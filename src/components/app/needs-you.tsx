"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  Hand,
  Inbox,
  LockOpen,
  type LucideIcon,
  PenLine,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  BLOCKER_LINE,
  needsYouCounts,
  placeLabel,
  STALE_TEXT,
  type ClassPlace,
  type NeedsYouGroup,
  type RequestBlocker,
} from "@/lib/needs-you";
import type {
  CorrectionSetRow,
  GradingRow,
  NeedsYou,
  PausedAttempt,
  RetakeRequest,
} from "@/lib/queries/dashboard";
import type { PendingVerification } from "@/lib/queries/practice";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "@/components/use-action";
import { verifyCompletion } from "@/app/app/practice/actions";
import {
  clearRetakeRequest,
  letContinue,
  revokeAttemptUnlock,
  undoRetakeApproval,
  unlockNextAttempt,
} from "@/app/app/results/actions";
import { useHideScores } from "./hide-scores";

const GROUPS: Record<
  NeedsYouGroup,
  { title: string; icon: LucideIcon; chip: (n: number) => string }
> = {
  asked: { title: "Asked to finish", icon: Hand, chip: (n) => `${n} asked to finish` },
  requests: {
    title: "Retake requests",
    icon: LockOpen,
    chip: (n) => `${n} retake ${n === 1 ? "request" : "requests"}`,
  },
  corrections: {
    title: "Corrections to check",
    icon: ClipboardCheck,
    chip: (n) => `${n} correction ${n === 1 ? "set" : "sets"}`,
  },
  grading: {
    title: "Answers to grade",
    icon: PenLine,
    chip: (n) => `${n} ${n === 1 ? "test" : "tests"} to grade`,
  },
  activities: {
    title: "Activities to check off",
    icon: CheckCircle2,
    chip: (n) => `${n} ${n === 1 ? "activity" : "activities"} to check off`,
  },
  worksheets: {
    title: "Worksheet emails",
    icon: FileSpreadsheet,
    chip: () => "Worksheet emails to match",
  },
};
const ORDER: NeedsYouGroup[] = [
  "asked",
  "requests",
  "corrections",
  "grading",
  "activities",
  "worksheets",
];

/**
 * The header's quick links (Jon, Oct 13 2026): one chip per kind of thing waiting, each jumping
 * to its group in the list below.
 */
export function NeedsYouChips({ counts }: { counts: Record<NeedsYouGroup, number> }) {
  const shown = ORDER.filter((g) => counts[g] > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What needs you">
      {shown.map((g) => (
        <li key={g}>
          <a
            href={`#needs-${g}`}
            className="inline-flex items-center rounded-md bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral-deep tabular hover:underline"
            data-needs-chip={g}
          >
            {GROUPS[g].chip(counts[g])}
          </a>
        </li>
      ))}
    </ul>
  );
}

const name = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`;

// Every action in this list revalidates /app, which re-renders the Dashboard in place.
const NO_REFRESH = { refresh: false } as const;

/**
 * How long a row acted on here stays in view with its Undo. The live refresh never reloads the
 * page, so without a limit approvals and check-offs would pile up all day, each Undo going stale
 * once the student starts the try (Jon, Oct 13 2026: Approve and Check off have an Undo).
 */
const KEEP_MS = 5 * 60_000;

/** Rows acted on here stay in view (as done, with Undo) for a while after the server list drops them. */
function withKept<T>(
  live: T[],
  kept: Record<string, T>,
  key: (r: T) => string,
  at: (r: T) => number
): { rows: T[]; done: Set<string> } {
  const ids = new Set(live.map(key));
  const done = new Set(Object.keys(kept).filter((id) => !ids.has(id)));
  const rows = [...live, ...[...done].map((id) => kept[id])].sort((a, b) => at(a) - at(b));
  return { rows, done };
}
const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
const requestKey = (r: RetakeRequest) => r.id;
const activityKey = (r: PendingVerification) => `${r.activityId}:${r.studentId}`;

/**
 * "Needs you" (Jon, Oct 13 2026, dashboard plan): everything waiting on the teacher across all
 * their courses, grouped, each row naming its course · period and carrying its one-click action.
 * Approve and Check off keep the row with an Undo; Decline asks first, because only the student
 * can ask again.
 */
export function NeedsYouInbox({ inbox }: { inbox: NeedsYou }) {
  const [keptRequests, setKeptRequests] = useState<Record<string, RetakeRequest>>({});
  const [keptActivities, setKeptActivities] = useState<Record<string, PendingVerification>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const requests = withKept(inbox.requests, keptRequests, requestKey, (r) => time(r.requestedAt));
  const activities = withKept(inbox.activities, keptActivities, activityKey, (r) =>
    time(r.completedAt)
  );
  // Badges count what still needs the teacher; rows done here stay listed for KEEP_MS.
  const counts = needsYouCounts(inbox);
  const empty = counts.total === 0 && requests.done.size === 0 && activities.done.size === 0;
  const forgetRequest = (id: string) =>
    setKeptRequests((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));
  const forgetActivity = (key: string) =>
    setKeptActivities((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)));
  const keepRequest = (r: RetakeRequest) => {
    setKeptRequests((p) => ({ ...p, [r.id]: r }));
    window.setTimeout(() => forgetRequest(r.id), KEEP_MS);
  };
  const keepActivity = (r: PendingVerification) => {
    setKeptActivities((p) => ({ ...p, [activityKey(r)]: r }));
    window.setTimeout(() => forgetActivity(activityKey(r)), KEEP_MS);
  };

  return (
    <Card data-needs-you>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Inbox className="size-4 text-coral-deep" aria-hidden />
          Needs you
        </CardTitle>
        {/* Jon, Oct 14 2026: empty, the card shrinks to one line instead of a big blank box. */}
        {empty ? (
          <p
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            data-needs-you-empty
          >
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
            Nothing is waiting on you. Retake requests, corrections, and grading land here.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            From all your courses; each row says which class it&apos;s in.
          </p>
        )}
        {notice ? (
          <p className="flex items-start gap-2 text-sm text-error-foreground" role="status">
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </p>
        ) : null}
      </CardHeader>
      {empty ? null : (
        <CardContent className="p-0">
          <div className="flex flex-col">
            <Group id="asked" count={counts.asked} rows={inbox.asked.length}>
              {inbox.asked.map((r) => (
                <AskedRow
                  key={r.attemptId}
                  r={r}
                  onFailed={(msg) => setNotice(`${name(r)}: ${msg}`)}
                />
              ))}
            </Group>
            <Group id="requests" count={counts.requests} rows={requests.rows.length}>
              {requests.rows.map((r) => (
                <RequestRow
                  key={r.id}
                  r={r}
                  approved={requests.done.has(r.id)}
                  onApproved={() => keepRequest(r)}
                  onGone={() => forgetRequest(r.id)}
                />
              ))}
            </Group>
            <Group id="corrections" count={counts.corrections} rows={inbox.corrections.length}>
              {inbox.corrections.map((r) => (
                <CorrectionsRow key={r.attemptId} r={r} />
              ))}
            </Group>
            <Group id="grading" count={counts.grading} rows={inbox.grading.length}>
              {inbox.grading.map((r) => (
                <GradingRowView key={r.assignmentId} r={r} />
              ))}
            </Group>
            <Group id="activities" count={counts.activities} rows={activities.rows.length}>
              {activities.rows.map((r) => (
                <ActivityRow
                  key={activityKey(r)}
                  r={r}
                  checked={activities.done.has(activityKey(r))}
                  onChecked={() => keepActivity(r)}
                />
              ))}
            </Group>
            <Group id="worksheets" count={counts.worksheets} rows={counts.worksheets}>
              <WorksheetRow emails={inbox.worksheetEmails} />
            </Group>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Group({
  id,
  count,
  rows,
  children,
}: {
  id: NeedsYouGroup;
  /** Still waiting on the teacher. */
  count: number;
  /** Listed, including rows just done here (they keep an Undo). */
  rows: number;
  children: React.ReactNode;
}) {
  if (rows === 0) return null;
  const { title, icon: Icon } = GROUPS[id];
  return (
    <section
      id={`needs-${id}`}
      aria-labelledby={`needs-${id}-title`}
      className="scroll-mt-20 border-t border-border first:border-t-0"
      data-needs-group={id}
    >
      <h3
        id={`needs-${id}-title`}
        className="flex items-center gap-2 px-6 pt-3 pb-1 text-xs font-medium text-muted-foreground"
      >
        <Icon className="size-3.5 text-coral-deep" aria-hidden />
        {title}
        {id !== "worksheets" ? (
          <span className="rounded-md bg-coral-soft px-1.5 text-coral-deep tabular">{count}</span>
        ) : null}
      </h3>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function Row({
  who,
  what,
  meta,
  note,
  error,
  actions,
  data,
}: {
  who: React.ReactNode;
  what?: React.ReactNode;
  meta: React.ReactNode;
  note?: React.ReactNode;
  error?: string | null;
  actions: React.ReactNode;
  data: Record<string, string>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3 text-sm" {...data}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {who}
          {what ? <span className="font-normal text-muted-foreground"> · {what}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">{meta}</p>
        {note}
        {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </li>
  );
}

/** Title (to its results) · course · period. */
function Where({
  assignmentId,
  title,
  place,
}: {
  assignmentId: string;
  title: string;
  place: ClassPlace;
}) {
  return (
    <>
      <Link href={`/app/results/${assignmentId}`} className="hover:underline">
        {title}
      </Link>
      {" · "}
      {placeLabel(place)}
    </>
  );
}

function AskedRow({ r, onFailed }: { r: PausedAttempt; onFailed: (message: string) => void }) {
  const router = useRouter();
  const { run, pending } = useAction(NO_REFRESH);
  return (
    <Row
      data={{ "data-needs-asked": r.attemptId }}
      who={name(r)}
      what={`try ${r.attemptNumber}`}
      meta={
        <>
          <Where assignmentId={r.assignmentId} title={r.title} place={r.place} /> · asked{" "}
          <LocalTime date={r.askedAt} />
        </>
      }
      actions={
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            // No "are you sure?": it is harmless. If it fails (say they already used the code),
            // the message stays at the top of the list and the list refreshes.
            run(
              letContinue(r.attemptId).then((res) => {
                if (!res.ok) {
                  onFailed(res.error);
                  router.refresh();
                }
                return res;
              })
            )
          }
        >
          <Play data-icon="inline-start" aria-hidden />
          {pending ? "Letting them in…" : "Let them continue"}
        </Button>
      }
    />
  );
}

function BlockerNote({ b }: { b: RequestBlocker }) {
  return (
    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning-foreground">
      <Clock className="size-3.5" aria-hidden />
      {BLOCKER_LINE[b.reason]}
      {"codes" in b ? ` ${b.codes.join(", ")}.` : null}
      {"at" in b ? (
        <>
          {" "}
          <LocalTime date={b.at} />
        </>
      ) : null}
    </p>
  );
}

function RequestRow({
  r,
  approved,
  onApproved,
  onGone,
}: {
  r: RetakeRequest;
  approved: boolean;
  onApproved: () => void;
  onGone: () => void;
}) {
  const { run, pending, error } = useAction(NO_REFRESH);
  const [confirming, setConfirming] = useState(false);
  // "Hide scores" covers the whole Dashboard, this list included (decision 6: the projector).
  const hideScores = useHideScores();
  const meta = (
    <>
      <Where assignmentId={r.assignmentId} title={r.title} place={r.place} />
      {r.bestPercent !== null && !hideScores ? ` · best ${Math.round(r.bestPercent)}%` : ""}
      {r.requestedAt ? (
        <>
          {" "}
          · asked <LocalTime date={r.requestedAt} />
        </>
      ) : null}
    </>
  );
  if (r.stale) {
    return (
      <Row
        data={{ "data-needs-request": r.id, "data-stale": r.stale }}
        who={name(r)}
        what={`try ${r.attemptNumber}`}
        meta={meta}
        note={<p className="mt-0.5 text-xs text-muted-foreground">{STALE_TEXT[r.stale]}</p>}
        error={error}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(clearRetakeRequest(r.assignmentId, r.id), onGone)}
          >
            {pending ? "Clearing…" : "Clear"}
          </Button>
        }
      />
    );
  }
  return (
    <Row
      data={{ "data-needs-request": r.id }}
      who={name(r)}
      what={`try ${r.attemptNumber}`}
      meta={meta}
      note={
        <>
          {/* Ask to retake on a closed test (Jon, Oct 14 2026, R4): Approve reopens it for them. */}
          {r.reopensUntil && !approved ? (
            <p className="mt-0.5 text-xs text-muted-foreground" data-reopens>
              Closed · Approve reopens it for {r.firstName} through{" "}
              <LocalTime date={r.reopensUntil} mode="date" />
            </p>
          ) : null}
          {r.blocker ? <BlockerNote b={r.blocker} /> : null}
        </>
      }
      error={error}
      actions={
        approved ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-success-foreground">
              <Check className="size-3.5" aria-hidden />
              {r.reopensUntil ? (
                <>
                  Reopened through <LocalTime date={r.reopensUntil} mode="date" />
                </>
              ) : (
                <>Try {r.attemptNumber} unlocked</>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(undoRetakeApproval(r.assignmentId, r.studentId))}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              Undo
            </Button>
          </>
        ) : confirming ? (
          <>
            <span className="text-xs text-muted-foreground">
              Decline? Only {r.firstName} can ask again.
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(revokeAttemptUnlock(r.assignmentId, r.studentId), () => {
                  setConfirming(false);
                  onGone();
                })
              }
            >
              {pending ? "Declining…" : "Yes, decline"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(unlockNextAttempt(r.assignmentId, r.studentId), onApproved)}
            >
              {pending ? "Approving…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Decline
            </Button>
          </>
        )
      }
    />
  );
}

function CorrectionsRow({ r }: { r: CorrectionSetRow }) {
  return (
    <Row
      data={{ "data-needs-corrections": r.attemptId }}
      who={name(r)}
      what={`try ${r.attemptNumber}`}
      meta={
        <>
          <Where assignmentId={r.assignmentId} title={r.title} place={r.place} /> · {r.answers}{" "}
          {r.answers === 1 ? "answer" : "answers"}
          {r.flagged ? ` · ${r.flagged} flagged` : ""}
          {r.submittedAt ? (
            <>
              {" "}
              · sent <LocalTime date={r.submittedAt} />
            </>
          ) : null}
        </>
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/results/corrections?assignment=${r.assignmentId}`} />}
        >
          Review
        </Button>
      }
    />
  );
}

function GradingRowView({ r }: { r: GradingRow }) {
  return (
    <Row
      data={{ "data-needs-grading": r.assignmentId }}
      who={
        <Link href={`/app/results/${r.assignmentId}`} className="hover:underline">
          {r.title}
        </Link>
      }
      what={placeLabel(r.place)}
      meta={
        <>
          {r.answers} {r.answers === 1 ? "answer" : "answers"} from {r.students}{" "}
          {r.students === 1 ? "student" : "students"}
          {r.oldestAt ? (
            <>
              {" "}
              · oldest <LocalTime date={r.oldestAt} />
            </>
          ) : null}
        </>
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/app/results/grading?assignment=${r.assignmentId}`} />}
        >
          Grade →
        </Button>
      }
    />
  );
}

function ActivityRow({
  r,
  checked,
  onChecked,
}: {
  r: PendingVerification;
  checked: boolean;
  onChecked: () => void;
}) {
  const { run, pending, error } = useAction(NO_REFRESH);
  return (
    <Row
      data={{ "data-needs-activity": `${r.activityId}:${r.studentId}` }}
      who={name(r)}
      what={r.activityTitle}
      meta={
        <>
          {placeLabel(r.place)} · done <LocalTime date={r.completedAt} /> ·{" "}
          <Link
            href={`/app/practice/activities/${r.activityId}`}
            className="text-brand-deep hover:underline"
          >
            Peek at their work
          </Link>
        </>
      }
      error={error}
      actions={
        checked ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-success-foreground">
              <Check className="size-3.5" aria-hidden />
              Checked off
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(verifyCompletion(r.activityId, r.studentId, false))}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              Undo
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(verifyCompletion(r.activityId, r.studentId, true), onChecked)}
          >
            <Check data-icon="inline-start" aria-hidden />
            {pending ? "Checking off…" : "Check off"}
          </Button>
        )
      }
    />
  );
}

function WorksheetRow({ emails }: { emails: number }) {
  return (
    <Row
      data={{ "data-needs-worksheets": String(emails) }}
      who={`${emails} ${emails === 1 ? "email" : "emails"} to match`}
      meta="Worksheet submits from an email Bloom doesn't know yet. Link each one to a student."
      actions={
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/app/practice/worksheets" />}
        >
          Match →
        </Button>
      }
    />
  );
}
