"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { PROGRESS_LABEL } from "@/lib/corrections";
import type { CorrectionsProgressRow } from "@/lib/queries/corrections";
import type { GradebookAttempt, GradebookRow } from "@/lib/queries/results";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TONE } from "./corrections-progress";
import { DeleteAttemptButton } from "./delete-attempt-button";
import { UnlockButton } from "./unlock-button";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Props = {
  assignmentId: string;
  rows: GradebookRow[];
  /** One row per enrolled student; null for practice, which has no corrections. */
  corrections: CorrectionsProgressRow[] | null;
  summative: boolean;
  retakesNeedUnlock: boolean;
  attemptsAllowed: number | null;
};

type Sort = "name" | "score";

/**
 * One row per student (Jon, Oct 8 2026: "the top table should also include the
 * score for each attempt… looks better and is more efficient"). Replaces the
 * separate Corrections and Attempts tables, which listed the same roster twice:
 * every attempt is a score chip (the one that counts in green), corrections
 * status and progress sit beside it, and the counting score closes the row.
 * The chevron opens the details that used to fill the Attempts table: submit
 * times, tab switches, retake targets, delete, and the retake unlock.
 */
export function StudentResultsTable({
  assignmentId,
  rows,
  corrections,
  summative,
  retakesNeedUnlock,
  attemptsAllowed,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<Sort>("name");
  const byStudent = new Map((corrections ?? []).map((c) => [c.studentId, c]));
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.studentId));

  const sorted = [...rows];
  if (sort === "score")
    sorted.sort((a, b) => {
      const pa = a.final?.percent ?? -1;
      const pb = b.final?.percent ?? -1;
      return pb - pa || a.lastName.localeCompare(b.lastName);
    });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const columns = corrections ? 4 : 3;

  return (
    <div className="flex flex-col gap-2" data-student-results>
      <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Sort by
          {(["name", "score"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              className={cn(
                "rounded-md px-1.5 py-0.5 hover:text-foreground",
                sort === s && "bg-muted font-medium text-foreground"
              )}
              onClick={() => setSort(s)}
            >
              {s === "name" ? "Name" : "Score"}
            </button>
          ))}
        </span>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 hover:text-foreground"
          onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.studentId)))}
        >
          {allOpen ? "Hide details" : "Show details"}
        </button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Attempts</TableHead>
              {corrections ? (
                <TableHead className="hidden md:table-cell">Corrections</TableHead>
              ) : null}
              <TableHead className="text-right">Counts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => {
              const c = byStudent.get(s.studentId) ?? null;
              const isOpen = open.has(s.studentId);
              const inProgress = s.attempts.some((t) => t.status === "in_progress");
              const next = s.attempts.length + 1;
              const offerUnlock =
                retakesNeedUnlock &&
                s.attempts.length > 0 &&
                !inProgress &&
                (attemptsAllowed === null || next <= attemptsAllowed);
              const awaitingRequest =
                offerUnlock && s.requestedAt !== null && s.unlockedThrough < next;
              return (
                <StudentRows
                  key={s.studentId}
                  student={s}
                  corrections={c}
                  assignmentId={assignmentId}
                  summative={summative}
                  open={isOpen}
                  onToggle={() => toggle(s.studentId)}
                  columns={columns}
                  unlock={
                    offerUnlock ? { nextAttempt: next, unlocked: s.unlockedThrough >= next } : null
                  }
                  awaitingRequest={awaitingRequest}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StudentRows({
  student: s,
  corrections: c,
  assignmentId,
  summative,
  open,
  onToggle,
  columns,
  unlock,
  awaitingRequest,
}: {
  student: GradebookRow;
  corrections: CorrectionsProgressRow | null;
  assignmentId: string;
  summative: boolean;
  open: boolean;
  onToggle: () => void;
  columns: number;
  unlock: { nextAttempt: number; unlocked: boolean } | null;
  awaitingRequest: boolean;
}) {
  const quiet = s.attempts.length === 0;
  return (
    <>
      <TableRow
        data-student={s.studentId}
        data-open={open}
        className={cn(quiet && "text-muted-foreground")}
      >
        <TableCell className="align-top font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} details for ${s.firstName} ${s.lastName}`}
              className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onToggle}
            >
              <ChevronRight
                className={cn("size-4 transition-transform", open && "rotate-90")}
                aria-hidden
              />
            </button>
            <Link
              href={`/app/results/${assignmentId}/students/${s.studentId}`}
              className="hover:underline"
            >
              {s.lastName}, {s.firstName}
            </Link>
          </span>
        </TableCell>
        <TableCell className="align-top">
          {quiet ? (
            <span className="text-sm">Not started</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {s.attempts.map((t) => (
                <AttemptChip key={t.id} attempt={t} best={t.id === s.bestAttemptId} />
              ))}
              {awaitingRequest ? (
                <Badge className="bg-warning-soft text-warning-foreground">Retake requested</Badge>
              ) : null}
            </span>
          )}
        </TableCell>
        {c !== null || columns === 4 ? (
          <TableCell className="hidden align-top md:table-cell">
            {c ? <CorrectionsCell row={c} /> : <span className="text-xs">—</span>}
          </TableCell>
        ) : null}
        <TableCell className="text-right align-top font-semibold tabular">
          {s.final ? (
            <>
              {fmt(s.final.totalEarned)} / {fmt(s.final.totalPossible)} ·{" "}
              {Math.round(s.final.percent)}%
              {summative && s.final.tier ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  Tier {s.final.tier} · {s.final.targetsBelowThreshold} below threshold
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow data-student-details={s.studentId} className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={columns} className="py-2 pl-8">
            {quiet && !unlock ? (
              <span className="text-sm text-muted-foreground">No attempts yet.</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {s.attempts.map((t) => (
                  <AttemptDetail key={t.id} attempt={t} best={t.id === s.bestAttemptId} />
                ))}
              </ul>
            )}
            {c?.state === "returned" && c.reviewerNote ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Corrections returned: “{c.reviewerNote}”
              </p>
            ) : null}
            {unlock ? (
              <div className="mt-1.5">
                <UnlockButton
                  assignmentId={assignmentId}
                  studentId={s.studentId}
                  nextAttempt={unlock.nextAttempt}
                  unlocked={unlock.unlocked}
                  requestedAt={s.requestedAt}
                />
              </div>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** One attempt as a chip: number and percent, green when it is the one that counts. */
function AttemptChip({ attempt: t, best }: { attempt: GradebookAttempt; best: boolean }) {
  if (t.status === "in_progress")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground tabular"
        data-attempt={t.number}
        data-in-progress
      >
        {t.number} · in progress
      </span>
    );
  const scored = t.score !== null && t.maxScore !== null;
  const title = [
    `Attempt ${t.number}`,
    t.scopeCodes ? `retake of ${t.scopeCodes.join(", ")}` : null,
    scored ? `${fmt(t.score!)} / ${fmt(t.maxScore!)}` : "not scored yet",
    t.pendingManual > 0 ? `${t.pendingManual} to grade` : null,
    best ? "counts" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/app/results/attempts/${t.id}`}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs tabular hover:ring-2 hover:ring-ring/40",
        best ? "bg-success-soft font-semibold text-success-foreground" : "bg-muted text-foreground"
      )}
      data-attempt={t.number}
      data-best={best || undefined}
    >
      {t.number} · {scored ? `${Math.round(t.percent ?? 0)}%` : "—"}
      {t.scopeCodes ? <span className="font-normal opacity-70">retake</span> : null}
      {t.pendingManual > 0 ? (
        <span
          className="size-1.5 rounded-full bg-warning"
          aria-label={`${t.pendingManual} to grade`}
        />
      ) : null}
    </Link>
  );
}

/** The full line for one attempt, shown in the opened row. */
function AttemptDetail({ attempt: t, best }: { attempt: GradebookAttempt; best: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm" data-attempt={t.number}>
      <span className={best ? "font-semibold" : ""}>
        Attempt {t.number}
        {t.scopeCodes ? ` · retake ${t.scopeCodes.join(", ")}` : ""}
      </span>
      {t.status === "in_progress" ? (
        <Badge className="bg-brand-soft text-brand-deep">In progress</Badge>
      ) : (
        <>
          <span className={cn("tabular", best && "font-semibold")}>
            {t.score !== null && t.maxScore !== null
              ? `${fmt(t.score)} / ${fmt(t.maxScore)} · ${Math.round(t.percent ?? 0)}%`
              : "—"}
          </span>
          {t.pendingManual > 0 ? (
            <Badge className="bg-warning-soft text-warning-foreground">
              {t.pendingManual} to grade
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t.submittedAt ? <LocalTime date={t.submittedAt} /> : null}
            {t.tabSwitches > 0
              ? ` · ${t.tabSwitches} tab ${t.tabSwitches === 1 ? "switch" : "switches"}`
              : ""}
          </span>
          <Link
            href={`/app/results/attempts/${t.id}`}
            className="text-xs font-medium text-brand-deep hover:underline"
          >
            Review
          </Link>
        </>
      )}
      <DeleteAttemptButton
        attemptId={t.id}
        number={t.number}
        inProgress={t.status === "in_progress"}
      />
    </li>
  );
}

/** Status pill, progress bar, and the Approve / Review link for one student's set. */
function CorrectionsCell({ row: r }: { row: CorrectionsProgressRow }) {
  const tone = TONE[r.state];
  const quiet = r.state === "no_attempt" || r.state === "none";
  if (quiet)
    return (
      <span className="text-xs text-muted-foreground" data-corrections-state={r.state}>
        {PROGRESS_LABEL[r.state]}
      </span>
    );
  const count =
    r.approved === r.needed
      ? `${r.approved} of ${r.needed} approved`
      : r.done > 0
        ? `${r.done} of ${r.needed} submitted${r.approved ? ` · ${r.approved} approved` : ""}${r.returned ? ` · ${r.returned} returned` : ""}`
        : `${r.started} of ${r.needed} started`;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-corrections-state={r.state}>
      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone.pill)}>
        {PROGRESS_LABEL[r.state]}
      </span>
      <span className="h-2 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn("block h-full", r.approved === r.needed ? "bg-success" : "bg-brand")}
          style={{
            width: `${r.needed ? (Math.max(r.done, r.started) / r.needed) * 100 : 0}%`,
          }}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular">
        {count}
        {r.attemptNumber && r.attemptNumber > 1 ? ` · attempt ${r.attemptNumber}` : ""}
      </span>
      {r.attemptId ? (
        <Link
          href={`/app/results/attempts/${r.attemptId}`}
          className="text-xs font-medium text-brand-deep hover:underline"
        >
          {r.state === "submitted" ? "Approve" : "Review"}
        </Link>
      ) : null}
    </span>
  );
}
