"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Flag,
  Hand,
  Hourglass,
  ListTodo,
  LockOpen,
  PenLine,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { cn } from "cn";
import {
  cellMarks,
  cellSentence,
  studentPanel,
  type PanelItem,
  type StudentPanel as StudentPanelData,
} from "@/lib/gradebook-view";
import type { ToDoGroup, ToDoRow } from "@/lib/student-home";
import type {
  ClassGradebook,
  ClassGradebookAttempt,
  ClassGradebookCell,
  ClassGradebookColumn,
  UnlockState,
} from "@/lib/queries/class-gradebook";
import { BLOCKER_LINE } from "@/lib/needs-you";
import { LocalTime } from "@/components/local-time";
import { ToDoRowBody } from "@/components/todo-row";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAction } from "@/components/use-action";
import {
  revokeAttemptUnlock,
  undoRetakeApproval,
  unlockNextAttempt,
} from "@/app/app/results/actions";
import { LetContinueButton } from "@/app/app/results/[assignmentId]/let-continue-button";
import { TagPill } from "./gradebook-tag";

export type PanelTarget =
  | { kind: "cell"; studentId: string; assignmentId: string }
  | { kind: "student"; studentId: string };

/**
 * The gradebook's side panel (Jon, Oct 13 2026, research notes C, "Clicks"). A cell opens that
 * student and test: a plain sentence, the attempt chips, the matching actions (Let them continue,
 * Approve / Decline, Unlock try N / Take back, Review corrections, Grade) and links (Full results,
 * Relearning monitor, View attempt). Delete attempt is never offered here. A name opens the
 * student's own to-do for this class (Jon, Oct 14 2026: the same list the student sees). It reads
 * the live gradebook, so after an action it shows the refreshed cell.
 */
export function GradebookPanel({
  gb,
  target,
  hideScores,
  showPractice,
  onTarget,
}: {
  gb: ClassGradebook;
  target: PanelTarget | null;
  hideScores: boolean;
  /** The grid's Practice switch: the student panel lists the same columns the grid shows. */
  showPractice: boolean;
  onTarget: (t: PanelTarget | null) => void;
}) {
  // Keep showing the last panel while the sheet slides shut.
  const [last, setLast] = useState(target);
  if (target && target !== last) setLast(target);
  const shown = target ?? last;
  const row = shown ? gb.rows.find((r) => r.student.id === shown.studentId) : undefined;
  const i =
    shown?.kind === "cell"
      ? gb.columns.findIndex((c) => c.assignmentId === shown.assignmentId)
      : -1;
  return (
    <Sheet open={!!target && !!row} onOpenChange={(o) => !o && onTarget(null)}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {row && shown?.kind === "cell" && i >= 0 ? (
          <CellPanel
            key={`${shown.assignmentId}:${shown.studentId}`}
            classId={gb.class.id}
            student={row.student}
            column={gb.columns[i]}
            cell={row.cells[i]}
            now={gb.generatedAt}
            hideScores={hideScores}
            onStudent={() => onTarget({ kind: "student", studentId: row.student.id })}
            onClose={() => onTarget(null)}
          />
        ) : row ? (
          <StudentPanel
            gb={gb}
            row={row}
            showPractice={showPractice}
            hideScores={hideScores}
            onCell={(assignmentId) =>
              onTarget({ kind: "cell", studentId: row.student.id, assignmentId })
            }
            onClose={() => onTarget(null)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type Student = ClassGradebook["students"][number];

function CellPanel({
  classId,
  student,
  column,
  cell,
  now,
  hideScores,
  onStudent,
  onClose,
}: {
  classId: string;
  student: Student;
  column: ClassGradebookColumn;
  cell: ClassGradebookCell;
  now: Date;
  hideScores: boolean;
  onStudent: () => void;
  onClose: () => void;
}) {
  const marks = cellMarks(cell, column, now);
  const open = cell.attempts.find((a) => a.id === cell.openAttemptId) ?? null;
  const toGrade = cell.attempts.reduce((n, a) => n + a.pendingManual, 0);
  const viewId = cell.latestAttemptId ?? cell.openAttemptId;
  const checkCorrections =
    cell.tag.kind === "check_corrections" || cell.corrections?.state === "submitted";
  return (
    <div
      className="flex flex-col gap-4 pb-6"
      data-cell-panel={`${cell.assignmentId}:${student.id}`}
    >
      <SheetHeader className="pr-12">
        <SheetTitle>
          <button type="button" className="hover:underline" onClick={onStudent}>
            {student.firstName} {student.lastName}
          </button>
        </SheetTitle>
        <SheetDescription>
          {column.title} · {column.type}
          {column.status === "closed" ? " · closed" : ""}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-2 px-4">
        <TagPill tag={cell.tag} className="self-start" />
        <p className="text-sm" data-cell-sentence>
          {cellSentence(cell, column, { hideScores })}
        </p>
        {cell.attempts.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attempts">
            {cell.attempts.map((a) => (
              <li key={a.id}>
                <AttemptChip attempt={a} hideScores={hideScores} />
              </li>
            ))}
          </ul>
        ) : null}
        {marks.retakeBy || marks.tabSwitches > 0 ? (
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {marks.retakeBy ? (
              <span className="inline-flex items-center gap-1 text-warning-foreground">
                <Clock className="size-3.5" aria-hidden />
                Retake by <LocalTime date={marks.retakeBy} />
              </span>
            ) : null}
            {marks.tabSwitches > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Flag className="size-3.5" aria-hidden />
                {marks.tabSwitches} tab {marks.tabSwitches === 1 ? "switch" : "switches"}
              </span>
            ) : null}
          </p>
        ) : null}
        {cell.corrections?.state === "returned" && cell.corrections.reviewerNote ? (
          <p className="text-xs text-muted-foreground">
            Your note when you sent it back: “{cell.corrections.reviewerNote}”
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-4" data-cell-actions>
        {open?.paused ? <LetContinueButton attemptId={open.id} asked={!!open.askedAt} /> : null}
        {cell.unlock ? (
          <UnlockControls
            assignmentId={cell.assignmentId}
            student={student}
            unlock={cell.unlock}
            reopenedUntil={cell.reopenedUntil}
            noRetake={cell.rule === "to_full"}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {checkCorrections ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/app/results/corrections?assignment=${cell.assignmentId}`} />}
            >
              <ClipboardCheck data-icon="inline-start" aria-hidden />
              Review corrections
            </Button>
          ) : null}
          {toGrade > 0 ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={`/app/results/grading?assignment=${cell.assignmentId}`} />}
            >
              <PenLine data-icon="inline-start" aria-hidden />
              Grade ({toGrade})
            </Button>
          ) : null}
          {cell.tag.kind === "check_activity" ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href="#needs-activities" onClick={onClose} />}
            >
              <Check data-icon="inline-start" aria-hidden />
              Check off in Needs you
            </Button>
          ) : null}
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-x-4 gap-y-1 px-4 text-sm"
        aria-label="More about this test"
      >
        <PanelLink href={`/app/results/${cell.assignmentId}`}>Full results</PanelLink>
        {cell.attempts.length ? (
          <PanelLink href={`/app/results/${cell.assignmentId}/students/${student.id}`}>
            Relearning monitor
          </PanelLink>
        ) : null}
        {viewId ? (
          <PanelLink href={`/app/results/attempts/${viewId}`}>View attempt</PanelLink>
        ) : null}
        <PanelLink href={`/app/classes/${classId}/activity?student=${student.id}`}>
          Activity log
        </PanelLink>
      </nav>
    </div>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium text-brand-deep hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </Link>
  );
}

/** One attempt (the results table's chip styling): in progress dashed, paused in brand. */
function AttemptChip({
  attempt: a,
  hideScores,
}: {
  attempt: ClassGradebookAttempt;
  hideScores: boolean;
}) {
  if (a.status === "in_progress")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs tabular",
          a.paused
            ? "border-brand/50 bg-brand-soft text-brand-deep"
            : "border-border text-muted-foreground"
        )}
        data-attempt={a.number}
      >
        {a.number} · {a.paused ? "paused" : "in progress"}
      </span>
    );
  return (
    <Link
      href={`/app/results/attempts/${a.id}`}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular hover:ring-2 hover:ring-ring/40"
      data-attempt={a.number}
      title={a.scopeCodes ? `Retake of ${a.scopeCodes.join(", ")}` : `Attempt ${a.number}`}
    >
      {a.number} · {hideScores ? "done" : a.percent !== null ? `${Math.round(a.percent)}%` : "—"}
      {a.scopeCodes ? <span className="opacity-70">retake</span> : null}
      {a.pendingManual > 0 ? (
        <span
          className="size-1.5 rounded-full bg-warning"
          aria-label={`${a.pendingManual} to grade`}
        />
      ) : null}
    </Link>
  );
}

/**
 * "Retakes need my OK" for this student's next try (Jon, Oct 1 2026; inbox rules Oct 13): Approve
 * keeps an undo (Take back turns the unlock back into their request, `undoRetakeApproval`);
 * Decline asks first, because only the student can ask again; an unasked try can be unlocked
 * early (Ready, needs your OK) and taken back. On a closed test (Oct 14 2026, R4) Approve reopens
 * it for the student through the next school day, and the panel says until when. At or above
 * the line under the cap (`noRetake`) the inbox's note says why no try will start, whatever is
 * approved.
 */
function UnlockControls({
  assignmentId,
  student,
  unlock,
  reopenedUntil,
  noRetake,
}: {
  assignmentId: string;
  student: Student;
  unlock: UnlockState;
  /** The closed test is open for this student until then. */
  reopenedUntil: Date | null;
  noRetake: boolean;
}) {
  // Unlock, Decline and Take back all revalidate /app, which re-renders the Dashboard in place.
  const { run, pending, error } = useAction({ refresh: false });
  const [confirming, setConfirming] = useState(false);
  const n = unlock.attemptNumber;
  return (
    <div className="flex flex-col gap-1" data-unlock-state={unlock.state}>
      <span className="flex flex-wrap items-center gap-2">
        {unlock.state === "unlocked" ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-success-foreground">
              <LockOpen className="size-3.5" aria-hidden />
              Try {n} unlocked
              {reopenedUntil ? (
                <>
                  {" "}
                  · reopened through <LocalTime date={reopenedUntil} mode="date" />
                </>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(undoRetakeApproval(assignmentId, student.id))}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              Take back
            </Button>
          </>
        ) : unlock.state === "requested" ? (
          confirming ? (
            <>
              <span className="text-xs text-muted-foreground">
                Decline? Only {student.firstName} can ask again.
              </span>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  run(revokeAttemptUnlock(assignmentId, student.id), () => setConfirming(false))
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
              <span className="inline-flex items-center gap-1 text-xs text-coral-deep">
                <Hand className="size-3.5" aria-hidden />
                Asked for try {n}
                {unlock.requestedAt ? (
                  <>
                    {" "}
                    <LocalTime date={unlock.requestedAt} />
                  </>
                ) : null}
              </span>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(unlockNextAttempt(assignmentId, student.id))}
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
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(unlockNextAttempt(assignmentId, student.id))}
          >
            <LockOpen data-icon="inline-start" aria-hidden />
            {pending ? "Unlocking…" : `Unlock try ${n}`}
          </Button>
        )}
      </span>
      {unlock.reopensUntil && unlock.state !== "unlocked" ? (
        <span
          className="text-xs text-muted-foreground"
          data-reopens={unlock.windowEnded ? "window" : "closed"}
        >
          {/* Past the cap's window on an open test (Jon, Oct 14 2026), as the Needs you row says. */}
          {unlock.windowEnded ? "Retake window ended" : "Closed"} ·{" "}
          {unlock.state === "requested" ? "Approve" : "Unlocking"}{" "}
          {unlock.windowEnded
            ? `lets ${student.firstName} retake it`
            : `reopens it for ${student.firstName}`}{" "}
          through <LocalTime date={unlock.reopensUntil} mode="date" />
        </span>
      ) : null}
      {noRetake ? (
        <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
          <Clock className="size-3.5" aria-hidden />
          {BLOCKER_LINE.no_retake}
        </span>
      ) : null}
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </div>
  );
}

/**
 * A student's panel (Jon, Oct 14 2026, docs/student-home-plan.md "Teacher side": "the student
 * panel lists the same to-do the student sees"): the student's own list for this class, in their
 * words and groups (To do, Want a higher score?, and their "Waiting on your teacher" as Waiting on
 * you), each row with its cell's tag and a way into that cell; then what the teacher would still
 * act on or watch that isn't on their list; and their activity log.
 */
function StudentPanel({
  gb,
  row,
  showPractice,
  hideScores,
  onCell,
  onClose,
}: {
  gb: ClassGradebook;
  row: ClassGradebook["rows"][number];
  showPractice: boolean;
  hideScores: boolean;
  onCell: (assignmentId: string) => void;
  onClose: () => void;
}) {
  const p = studentPanel(gb, row.student.id, { showPractice })!;
  const s = row.student;
  const groups = (["todo", "higher", "waiting"] as const).filter(
    (g) => g === "todo" || p.list[g].length
  );
  return (
    <div className="flex flex-col gap-4 pb-6" data-student-panel={s.id}>
      <SheetHeader className="pr-12">
        <SheetTitle>
          {s.firstName} {s.lastName}
        </SheetTitle>
        <SheetDescription>
          {gb.class.name} · {p.toDo ? `${p.toDo} to do` : "nothing to do"} · {p.done} of {p.total}{" "}
          done
        </SheetDescription>
      </SheetHeader>
      <section
        className="flex flex-col gap-3 px-4"
        aria-labelledby="student-todo-title"
        data-student-todo={p.list.count}
      >
        <div>
          <h3 id="student-todo-title" className="text-sm font-medium">
            {s.firstName}&apos;s to-do
          </h3>
          {/* This class's rows only: a student in two classes has more on their home. */}
          <p className="text-xs text-muted-foreground">
            {p.list.count
              ? `From this class, their home lists ${p.list.count} ${p.list.count === 1 ? "thing" : "things"} to do.`
              : "From this class, nothing is on their home's to-do list."}
          </p>
        </div>
        {groups.map((g) => (
          <ToDoGroupList
            key={g}
            group={g}
            rows={p.list[g]}
            panel={p}
            hideScores={hideScores}
            onCell={onCell}
            onClose={onClose}
          />
        ))}
      </section>
      {p.also.length ? (
        <PanelList title="Not on their list" items={p.also} onCell={onCell} />
      ) : null}
      <nav className="px-4 text-sm">
        <PanelLink href={`/app/classes/${gb.class.id}/activity?student=${s.id}`}>
          Activity log
        </PanelLink>
      </nav>
    </div>
  );
}

/** The student's group names, with "Waiting on your teacher" in the teacher's words. */
const TODO_GROUP = {
  todo: { title: "To do", icon: ListTodo, tone: "text-brand-deep" },
  higher: { title: "Want a higher score?", icon: TrendingUp, tone: "text-success-foreground" },
  waiting: { title: "Waiting on you", icon: Hourglass, tone: "text-muted-foreground" },
} as const;

function ToDoGroupList({
  group,
  rows,
  panel,
  hideScores,
  onCell,
  onClose,
}: {
  group: ToDoGroup;
  rows: ToDoRow[];
  panel: StudentPanelData;
  hideScores: boolean;
  onCell: (assignmentId: string) => void;
  onClose: () => void;
}) {
  const g = TODO_GROUP[group];
  return (
    <div data-todo-group={group}>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <g.icon className={cn("size-3.5", g.tone)} aria-hidden />
        {g.title}
        <span className="font-normal tabular">· {rows.length}</span>
      </p>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-label={g.title}>
          {rows.map((r) => {
            const item = r.assignmentId ? panel.cells.get(r.assignmentId) : undefined;
            return (
              <li
                key={r.key}
                className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start"
                data-todo-kind={r.kind}
                data-assignment={r.assignmentId ?? undefined}
              >
                <ToDoRowBody r={r} hideScores={hideScores} heading="h4" />
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  {item ? (
                    <>
                      <TagPill tag={item.cell.tag} />
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Open ${r.title}`}
                        onClick={() => onCell(item.cell.assignmentId)}
                      >
                        Open
                      </Button>
                    </>
                  ) : r.kind === "activity_check" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<a href="#needs-activities" onClick={onClose} />}
                    >
                      <Check data-icon="inline-start" aria-hidden />
                      Check off in Needs you
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-success-foreground">Nothing to do in this class.</p>
      )}
    </div>
  );
}

function PanelList({
  title,
  items,
  onCell,
}: {
  title: string;
  items: PanelItem[];
  onCell: (assignmentId: string) => void;
}) {
  return (
    <section className="px-4">
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map(({ cell, column }) => (
          <li key={cell.assignmentId}>
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
              onClick={() => onCell(cell.assignmentId)}
              data-owes={cell.assignmentId}
            >
              <span className="min-w-0 flex-1 truncate">{column.title}</span>
              <TagPill tag={cell.tag} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
