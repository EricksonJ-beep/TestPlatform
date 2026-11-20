"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createContext, useContext } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "cn";
import {
  BLOCKER_LINE,
  needsYouCounts,
  STALE_TEXT,
  type ClassPlace,
  type RequestBlocker,
} from "@/lib/needs-you";
import type {
  CorrectionSetRow,
  GradingRow,
  NeedsYou,
  PausedAttempt,
  RetakeRequest,
  VideoFlagRow,
} from "@/lib/queries/dashboard";
import type { PendingVerification } from "@/lib/queries/practice";
import { hourLabel } from "@/lib/teacher-home";
import { LocalTime } from "@/components/local-time";
import { btn } from "@/components/home/ui";
import { useAction } from "@/components/use-action";
import { verifyCompletion } from "@/app/app/practice/actions";
import {
  clearRetakeRequest,
  letContinue,
  resolveVideoFlag,
  revokeAttemptUnlock,
  undoRetakeApproval,
  unlockNextAttempt,
} from "@/app/app/results/actions";
import { useHideScores } from "./hide-scores";

const name = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`;

/** Which class a row is in, in the home's words: "Biology, 3rd hour". */
const placeLabel = (p: ClassPlace) =>
  [p.courseName, hourLabel({ name: p.className, period: p.period })].filter(Boolean).join(", ");

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
 * Where the queue is drawn (home pages redesign §3): "dark" inside the quiet mode's dark panel
 * (rows on `ink-raised`, pink primary buttons), "light" in a white card under the gradebook while
 * a test is live.
 */
type Tone = "dark" | "light";
const ToneContext = createContext<Tone>("light");

/** A 44px button in the row's tone: the primary action, or the quieter second one. */
function QButton({
  kind = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { kind?: "primary" | "second" }) {
  const tone = useContext(ToneContext);
  return (
    <button
      type="button"
      className={cn(
        btn.base,
        kind === "primary"
          ? tone === "dark"
            ? btn.eosin
            : btn.primary
          : tone === "dark"
            ? btn.onDark
            : btn.outline,
        className
      )}
      {...props}
    />
  );
}

function QLink({ href, children }: { href: string; children: React.ReactNode }) {
  const tone = useContext(ToneContext);
  return (
    <Link href={href} className={cn(btn.base, tone === "dark" ? btn.eosin : btn.primary)}>
      {children}
    </Link>
  );
}

/**
 * "Needs you" (Jon, Oct 13 2026, dashboard plan; home pages redesign §3.3–3.4): everything
 * waiting on the teacher across all their courses, one row per thing, each naming its kind, its
 * course and period, and carrying its one-click action. Approve and Check off keep the row with
 * an Undo; "Not yet" (decline) asks first, because only the student can ask again. Renders
 * nothing when the queue is empty: the page says so itself.
 */
export function NeedsYouInbox({ inbox, tone = "light" }: { inbox: NeedsYou; tone?: Tone }) {
  const [keptRequests, setKeptRequests] = useState<Record<string, RetakeRequest>>({});
  const [keptActivities, setKeptActivities] = useState<Record<string, PendingVerification>>({});
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const requests = withKept(inbox.requests, keptRequests, requestKey, (r) => time(r.requestedAt));
  const activities = withKept(inbox.activities, keptActivities, activityKey, (r) =>
    time(r.completedAt)
  );
  // The count is what still needs the teacher; rows done here stay listed for KEEP_MS.
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

  if (empty && !notice) return null;
  return (
    <ToneContext.Provider value={tone}>
      <div className="flex flex-col gap-3" data-needs-you>
        {notice ? (
          <p
            className={cn(
              "flex items-start gap-3 text-[15px]",
              tone === "dark"
                ? notice.error
                  ? "text-eosin-pale"
                  : "text-on-ink-muted"
                : notice.error
                  ? "text-eosin-text"
                  : "text-ink-muted"
            )}
            role="status"
          >
            <span className="flex-1">{notice.text}</span>
            <button
              type="button"
              className="min-h-11 px-2 text-[13px] underline"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </p>
        ) : null}
        <ul className="flex flex-col gap-2.5">
          {inbox.asked.map((r) => (
            <AskedRow
              key={r.attemptId}
              r={r}
              onFailed={(msg) => setNotice({ text: `${name(r)}: ${msg}`, error: true })}
            />
          ))}
          {requests.rows.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              approved={requests.done.has(r.id)}
              onApproved={() => keepRequest(r)}
              onGone={() => forgetRequest(r.id)}
              onDeclined={() =>
                setNotice({ text: `Declined. Only ${r.firstName} can ask again.`, error: false })
              }
            />
          ))}
          {inbox.corrections.map((r) => (
            <CorrectionsRow key={r.attemptId} r={r} />
          ))}
          {inbox.grading.map((r) => (
            <GradingRowView key={r.assignmentId} r={r} />
          ))}
          {activities.rows.map((r) => (
            <ActivityRow
              key={activityKey(r)}
              r={r}
              checked={activities.done.has(activityKey(r))}
              onChecked={() => keepActivity(r)}
            />
          ))}
          {inbox.videos.map((r) => (
            <VideoRow key={r.sectionId} r={r} />
          ))}
          {counts.skyward ? <SkywardRow grades={counts.skyward} /> : null}
          {counts.worksheets ? <WorksheetRow emails={inbox.worksheetEmails} /> : null}
        </ul>
      </div>
    </ToneContext.Provider>
  );
}

/**
 * One queue row (§3.4): a 13px kind label, the name at 17px, a detail line, and the actions at
 * the right.
 */
function Row({
  kind,
  who,
  meta,
  note,
  error,
  actions,
  data,
}: {
  kind: string;
  who: React.ReactNode;
  meta: React.ReactNode;
  note?: React.ReactNode;
  error?: string | null;
  actions: React.ReactNode;
  data: Record<string, string>;
}) {
  const dark = useContext(ToneContext) === "dark";
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-4",
        dark ? "bg-ink-raised text-white" : "border border-line bg-surface text-ink"
      )}
      {...data}
    >
      <div className="min-w-0 flex-1 basis-64">
        <p
          className={cn("text-[13px] font-semibold", dark ? "text-stain-light" : "text-stain-deep")}
        >
          {kind}
        </p>
        <p className="text-[17px] leading-snug font-semibold">{who}</p>
        <p className={cn("text-sm", dark ? "text-on-ink-muted" : "text-ink-muted")}>{meta}</p>
        {note}
        {error ? (
          <p className={cn("text-[13px]", dark ? "text-eosin-pale" : "text-eosin-text")}>{error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </li>
  );
}

/** A quiet line under the detail, in the row's tone. */
function Note({ children, ...props }: React.ComponentProps<"p">) {
  const dark = useContext(ToneContext) === "dark";
  return (
    <p
      className={cn("mt-0.5 text-[13px]", dark ? "text-on-ink-muted" : "text-ink-muted")}
      {...props}
    >
      {children}
    </p>
  );
}

/** "Approved", "Checked off": what just happened on a row that keeps its Undo. */
function Did({ children }: { children: React.ReactNode }) {
  const dark = useContext(ToneContext) === "dark";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-semibold",
        dark ? "text-stain-light" : "text-done"
      )}
    >
      <Check className="size-3.5" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Title (to its results), course, period. */
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
      <Link href={`/app/results/${assignmentId}`} className="underline-offset-2 hover:underline">
        {title}
      </Link>
      {", "}
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
      kind="Asked to finish"
      who={name(r)}
      meta={
        <>
          <Where assignmentId={r.assignmentId} title={r.title} place={r.place} />, try{" "}
          {r.attemptNumber}, asked <LocalTime date={r.askedAt} />
        </>
      }
      actions={
        <QButton
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
          {pending ? "Letting them in…" : "Let them continue"}
        </QButton>
      }
    />
  );
}

function BlockerNote({ b }: { b: RequestBlocker }) {
  const dark = useContext(ToneContext) === "dark";
  return (
    <p
      className={cn(
        "mt-0.5 inline-flex items-center gap-1 text-[13px]",
        dark ? "text-eosin-pale" : "text-owed-text"
      )}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span>
        {BLOCKER_LINE[b.reason]}
        {"codes" in b ? ` ${b.codes.join(", ")}.` : null}
        {"at" in b ? (
          <>
            {" "}
            <LocalTime date={b.at} />
          </>
        ) : null}
      </span>
    </p>
  );
}

function RequestRow({
  r,
  approved,
  onApproved,
  onGone,
  onDeclined,
}: {
  r: RetakeRequest;
  approved: boolean;
  onApproved: () => void;
  onGone: () => void;
  onDeclined: () => void;
}) {
  const { run, pending, error } = useAction(NO_REFRESH);
  const [confirming, setConfirming] = useState(false);
  // "Hide scores" covers the whole page, this list included (decision 6: the projector).
  const hideScores = useHideScores();
  const meta = (
    <>
      <Where assignmentId={r.assignmentId} title={r.title} place={r.place} />, try {r.attemptNumber}
      {r.bestPercent !== null && !hideScores ? `, best ${Math.round(r.bestPercent)}%` : ""}
      {r.requestedAt ? (
        <>
          , asked <LocalTime date={r.requestedAt} />
        </>
      ) : null}
    </>
  );
  if (r.stale) {
    return (
      <Row
        data={{ "data-needs-request": r.id, "data-stale": r.stale }}
        kind="Retake request, leftover"
        who={name(r)}
        meta={meta}
        note={<Note>{STALE_TEXT[r.stale]}</Note>}
        error={error}
        actions={
          <QButton
            kind="second"
            disabled={pending}
            onClick={() => run(clearRetakeRequest(r.assignmentId, r.id), onGone)}
          >
            {pending ? "Clearing…" : "Clear"}
          </QButton>
        }
      />
    );
  }
  return (
    <Row
      data={{ "data-needs-request": r.id }}
      kind="Retake request"
      who={name(r)}
      meta={meta}
      note={
        <>
          {/* Ask to retake on a closed test (Jon, Oct 14 2026, R4): Approve reopens it for them;
              past the cap's window on an open one, it lets them retake it ("Let them ask while
              it's still open too"). */}
          {r.reopensUntil && !approved ? (
            <Note data-reopens={r.windowEnded ? "window" : "closed"}>
              {r.windowEnded
                ? `Retake window ended. Approve lets ${r.firstName} retake it through `
                : `Closed. Approve reopens it for ${r.firstName} through `}
              <LocalTime date={r.reopensUntil} mode="date" />
            </Note>
          ) : null}
          {r.blocker ? <BlockerNote b={r.blocker} /> : null}
        </>
      }
      error={error}
      actions={
        approved ? (
          <>
            <Did>
              Approved.{" "}
              {r.reopensUntil ? (
                <>
                  {r.windowEnded ? "Retake open through" : "Reopened through"}{" "}
                  <LocalTime date={r.reopensUntil} mode="date" />
                </>
              ) : (
                <>Try {r.attemptNumber} unlocked</>
              )}
            </Did>
            <QButton
              kind="second"
              disabled={pending}
              onClick={() => run(undoRetakeApproval(r.assignmentId, r.studentId))}
            >
              Undo
            </QButton>
          </>
        ) : confirming ? (
          <>
            <Note>Decline? Only {r.firstName} can ask again.</Note>
            <QButton
              disabled={pending}
              onClick={() =>
                run(revokeAttemptUnlock(r.assignmentId, r.studentId), () => {
                  setConfirming(false);
                  onDeclined();
                  onGone();
                })
              }
            >
              {pending ? "Declining…" : "Yes, decline"}
            </QButton>
            <QButton kind="second" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </QButton>
          </>
        ) : (
          <>
            <QButton
              disabled={pending}
              onClick={() => run(unlockNextAttempt(r.assignmentId, r.studentId), onApproved)}
            >
              {pending ? "Approving…" : "Approve"}
            </QButton>
            <QButton kind="second" disabled={pending} onClick={() => setConfirming(true)}>
              Not yet
            </QButton>
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
      kind="Corrections turned in"
      who={name(r)}
      meta={
        <>
          <Where assignmentId={r.assignmentId} title={r.title} place={r.place} />, try{" "}
          {r.attemptNumber}, {r.answers} {r.answers === 1 ? "answer" : "answers"}
          {r.flagged ? `, ${r.flagged} flagged` : ""}
          {r.submittedAt ? (
            <>
              , sent <LocalTime date={r.submittedAt} />
            </>
          ) : null}
        </>
      }
      actions={<QLink href={`/app/results/corrections?assignment=${r.assignmentId}`}>Review</QLink>}
    />
  );
}

function GradingRowView({ r }: { r: GradingRow }) {
  return (
    <Row
      data={{ "data-needs-grading": r.assignmentId }}
      kind="To grade"
      who={
        <Link
          href={`/app/results/${r.assignmentId}`}
          className="underline-offset-2 hover:underline"
        >
          {r.title}
        </Link>
      }
      meta={
        <>
          {placeLabel(r.place)}, {r.answers} {r.answers === 1 ? "answer" : "answers"} from{" "}
          {r.students} {r.students === 1 ? "student" : "students"}
          {r.oldestAt ? (
            <>
              , oldest <LocalTime date={r.oldestAt} />
            </>
          ) : null}
        </>
      }
      actions={<QLink href={`/app/results/grading?assignment=${r.assignmentId}`}>Grade</QLink>}
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
      kind="Activity to check off"
      who={name(r)}
      meta={
        <>
          {r.activityTitle}, {placeLabel(r.place)}, done <LocalTime date={r.completedAt} />.{" "}
          <Link href={`/app/practice/activities/${r.activityId}`} className="underline">
            Peek at their work
          </Link>
        </>
      }
      error={error}
      actions={
        checked ? (
          <>
            <Did>Checked off</Did>
            <QButton
              kind="second"
              disabled={pending}
              onClick={() => run(verifyCompletion(r.activityId, r.studentId, false))}
            >
              Undo
            </QButton>
          </>
        ) : (
          <QButton
            disabled={pending}
            onClick={() => run(verifyCompletion(r.activityId, r.studentId, true), onChecked)}
          >
            {pending ? "Checking off…" : "Check off"}
          </QButton>
        )
      }
    />
  );
}

/**
 * Relearning revamp A6: a Watch video the player refused for students (often YouTube's Restricted
 * Mode on school Chromebooks). They were offered Read or Do; the teacher checks the video on a
 * student account, swaps it in the pack if needed, then marks it fixed.
 */
function VideoRow({ r }: { r: VideoFlagRow }) {
  const { run, pending, error } = useAction();
  return (
    <Row
      data={{ "data-needs-video": r.sectionId }}
      kind="Video that won't play"
      who={`${r.targetCode}, ${r.optionTitle}`}
      meta={
        <>
          {r.part === "core" ? "Core" : "Extension"}
          {r.sectionTitle ? `: ${r.sectionTitle}` : ""}. Wouldn&apos;t play for {r.students}{" "}
          {r.students === 1 ? "student" : "students"}
          {r.errorCodes.length ? ` (error ${r.errorCodes.join(", ")})` : ""}, last{" "}
          <LocalTime date={r.lastSeenAt} />.
          {r.youtubeId ? (
            <>
              {" "}
              <a
                href={`https://www.youtube.com/watch?v=${r.youtubeId}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open the video
              </a>
              .
            </>
          ) : null}{" "}
          <Link href={`/app/practice/relearning/${r.optionId}`} className="underline">
            Swap it
          </Link>
        </>
      }
      note={
        <Note>
          Students were offered Read or Do instead. Try it on a student account; swap it in the
          editor if Restricted Mode blocks it.
        </Note>
      }
      error={error}
      actions={
        <QButton
          kind="second"
          disabled={pending}
          onClick={() => run(resolveVideoFlag(r.sectionId))}
        >
          {pending ? "Saving…" : "Fixed it"}
        </QButton>
      }
    />
  );
}

function SkywardRow({ grades }: { grades: number }) {
  return (
    <Row
      data={{ "data-needs-skyward": String(grades) }}
      kind="Skyward updates"
      who={`${grades} ${grades === 1 ? "grade" : "grades"} to update`}
      meta="Corrections, the relearning path or retakes changed these since they went to Skyward."
      actions={<QLink href="/app/skyward">Review</QLink>}
    />
  );
}

function WorksheetRow({ emails }: { emails: number }) {
  return (
    <Row
      data={{ "data-needs-worksheets": String(emails) }}
      kind="Worksheet emails"
      who={`${emails} ${emails === 1 ? "email" : "emails"} to match`}
      meta="Worksheet submits from an email Bloom doesn't know yet. Link each one to a student."
      actions={<QLink href="/app/practice/worksheets">Match</QLink>}
    />
  );
}
