"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  ArrowUp,
  Check,
  Clock,
  EyeOff,
  Flag,
  Play,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { CellTone } from "@/lib/class-gradebook";
import { periodLabel } from "@/lib/class-focus";
import type { PeriodOption } from "@/lib/current-course";
import {
  cellMarks,
  DEFAULT_FILTERS,
  gradebookView,
  phoneLine,
  rightNow,
  scoreText,
  timeLeft,
  WHO_CHIP_LABEL,
  WHO_CHIPS,
  whoChip,
  type GradebookFilters,
  type LiveRow,
  type WhoChip,
} from "@/lib/gradebook-view";
import type {
  ClassGradebook,
  ClassGradebookCell,
  ClassGradebookColumn,
} from "@/lib/queries/class-gradebook";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pickDashboardClass } from "@/app/app/actions";
import { LetContinueButton } from "@/app/app/results/[assignmentId]/let-continue-button";
import { GradebookPanel, type PanelTarget } from "./gradebook-panel";
import { TagPill, TONE_CLASS } from "./gradebook-tag";

const KEY: { tone: CellTone; label: string }[] = [
  { tone: "coral", label: "Your move" },
  { tone: "brand", label: "Testing now" },
  { tone: "warning", label: "Student owes" },
  { tone: "coral_outline", label: "Your OK (optional)" },
  { tone: "muted", label: "Quiet" },
  { tone: "success", label: "Done" },
];

// "Hide scores" is remembered per browser (Jon, Oct 13 2026, decision 6: for the projector);
// useSyncExternalStore keeps the server render (scores shown) and the browser's choice in sync.
const HIDE_KEY = "bloom.gradebook.hideScores";
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeHidden(value: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, value ? "1" : "0");
  } catch {
    /* private mode etc. */
  }
  listeners.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

/**
 * CLASS (Jon, Oct 13 2026, dashboard plan build step 4): the sidebar course's class periods as
 * chips, opening on the one picked last (decision 8), then that class's gradebook: the "Right
 * now" strip while someone is testing, the who-needs-what chips, and every student × every test
 * of the class with one status tag per cell. A cell or a name opens a side panel with the matching
 * actions; on a phone it is one line per student.
 */
export function ClassGradebookSection({
  course,
  classes,
  currentClassId,
  gradebook,
  live,
}: {
  course: { id: string; name: string } | null;
  classes: PeriodOption[];
  currentClassId: string | null;
  gradebook: ClassGradebook | null;
  /** The page's Live indicator (`LiveRefresh`), shown at the right of the header. */
  live?: React.ReactNode;
}) {
  return (
    <Card data-class-gradebook>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CardTitle className="inline-flex items-center gap-2">
            <Users className="size-4 text-brand-deep" aria-hidden />
            Class
          </CardTitle>
          {course ? <span className="text-sm text-muted-foreground">{course.name}</span> : null}
          {classes.length > 1 || (classes.length === 1 && classes[0].period) ? (
            <PeriodChips classes={classes} currentId={currentClassId} />
          ) : null}
          {live ? <div className="ml-auto">{live}</div> : null}
        </div>
        {gradebook ? (
          <p className="text-sm text-muted-foreground">
            {gradebook.class.name}: every test assigned this term. Click a cell or a name for
            what&apos;s next; switch courses in the sidebar.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!course ? (
          <EmptyState
            icon={Users}
            title="No course yet"
            description="Make a course and a class, and this class's gradebook shows here."
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/app/courses" />}>
                Courses
              </Button>
            }
            className="py-6"
          />
        ) : !gradebook ? (
          <EmptyState
            icon={Users}
            title={`No classes on ${course.name} yet`}
            description="Add a class period for this course on the Classes page, or pick another course in the sidebar."
            action={
              <Button variant="outline" nativeButton={false} render={<Link href="/app/classes" />}>
                Classes
              </Button>
            }
            className="py-6"
          />
        ) : (
          <GradebookBody key={gradebook.class.id} gb={gradebook} />
        )}
      </CardContent>
    </Card>
  );
}

/** One chip per class period of the course; picking one is remembered (`pickDashboardClass`). */
function PeriodChips({
  classes,
  currentId,
}: {
  classes: PeriodOption[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = pending && picked ? picked : currentId;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Class period">
      {classes.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.name}
          aria-pressed={c.id === shown}
          data-period={c.id}
          disabled={pending}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            c.id === shown
              ? "border-brand bg-brand text-brand-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          onClick={() => {
            if (c.id === currentId) return;
            setPicked(c.id);
            setError(null);
            start(async () => {
              const r = await pickDashboardClass(c.id);
              if (!r.ok) setError(r.error);
              router.refresh();
            });
          }}
        >
          {periodLabel(c)}
        </button>
      ))}
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </div>
  );
}

function GradebookBody({ gb }: { gb: ClassGradebook }) {
  const [filters, setFilters] = useState<GradebookFilters>(DEFAULT_FILTERS);
  const [panel, setPanel] = useState<PanelTarget | null>(null);
  const hideScores = useSyncExternalStore(subscribe, readHidden, () => false);
  const view = gradebookView(gb, filters);
  const live = rightNow(gb);
  const set = (patch: Partial<GradebookFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const now = gb.generatedAt;

  if (gb.students.length === 0 || gb.columns.length === 0)
    return (
      <EmptyState
        icon={Users}
        title={
          gb.students.length === 0 ? "Nobody has joined this class yet" : "Nothing assigned yet"
        }
        description={
          gb.students.length === 0
            ? "Students show here once they join with the class code."
            : "Tests you assign to this class show here as columns."
        }
        action={
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={gb.students.length === 0 ? `/app/classes/${gb.class.id}` : "/app/assign"}
              />
            }
          >
            {gb.students.length === 0 ? "Class page" : "Assign"}
          </Button>
        }
        className="py-6"
      />
    );

  return (
    <>
      <RightNow live={live} now={now} onOpen={setPanel} />

      <WhoChips
        counts={view.chips}
        active={filters.chip}
        onPick={(chip) => set({ chip: filters.chip === chip ? null : chip })}
      />
      {filters.chip ? (
        <p className="-mt-2 text-xs text-muted-foreground" data-chip-names>
          {WHO_CHIP_LABEL[filters.chip]}:{" "}
          {view.rows.map((r, i) => (
            <span key={r.student.id}>
              {i > 0 ? ", " : ""}
              <button
                type="button"
                className="text-foreground hover:underline"
                onClick={() => setPanel({ kind: "student", studentId: r.student.id })}
              >
                {r.student.firstName} {r.student.lastName}
              </button>
            </span>
          ))}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Toggle
          on={filters.onlyOwing}
          onClick={() => set({ onlyOwing: !filters.onlyOwing })}
          data="only-owing"
        >
          Only students who owe something
        </Toggle>
        {gb.columns.some((c) => c.type === "practice") ? (
          <Toggle
            on={filters.showPractice}
            onClick={() => set({ showPractice: !filters.showPractice })}
            data="practice"
          >
            Practice
          </Toggle>
        ) : null}
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Sort by
          {(["name", "todo"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.sort === s}
              data-sort={s}
              className={cn(
                "rounded-md px-1.5 py-0.5 hover:text-foreground",
                filters.sort === s && "bg-muted font-medium text-foreground"
              )}
              onClick={() => set({ sort: s })}
            >
              {s === "name" ? "Name" : "Most to do"}
            </button>
          ))}
        </span>
        <label className="relative ml-auto">
          <span className="sr-only">Find a student</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.find}
            onChange={(e) => set({ find: e.target.value })}
            placeholder="Find student"
            className="h-7 w-40 pl-7 text-xs"
            data-find-student
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={hideScores}
          data-hide-scores
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium",
            hideScores
              ? "border-brand bg-brand-soft text-brand-deep"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
          onClick={() => writeHidden(!hideScores)}
        >
          <EyeOff className="size-3.5" aria-hidden />
          Hide scores
        </button>
      </div>

      {view.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No students match. Clear the filters to see the whole class.
        </p>
      ) : (
        <>
          <Grid gb={gb} view={view} chip={filters.chip} hideScores={hideScores} onOpen={setPanel} />
          <ul
            className="divide-y divide-border rounded-lg border border-border md:hidden"
            data-phone-list
          >
            {view.rows.map((r) => (
              <li key={r.student.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  onClick={() => setPanel({ kind: "student", studentId: r.student.id })}
                  data-phone-student={r.student.id}
                >
                  <span className={cn(r.toDo ? "font-medium" : "text-muted-foreground")}>
                    {phoneLine(r)}
                  </span>
                  {r.toDo ? (
                    <span className="rounded-md bg-warning-soft px-1.5 text-xs text-warning-foreground tabular">
                      {r.toDo}
                    </span>
                  ) : (
                    <Check className="size-4 text-success-foreground" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ul
        className="hidden flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground md:flex"
        aria-label="Key"
      >
        {KEY.map((k) => (
          <li key={k.tone} className="inline-flex items-center gap-1">
            <span
              className={cn("inline-block size-3 rounded-sm", TONE_CLASS[k.tone])}
              aria-hidden
            />
            {k.label}
          </li>
        ))}
        {view.practiceColumns > 0 ? (
          <li>
            {view.practiceColumns} practice {view.practiceColumns === 1 ? "column" : "columns"}{" "}
            hidden
          </li>
        ) : null}
      </ul>

      <GradebookPanel gb={gb} target={panel} hideScores={hideScores} onTarget={setPanel} />
    </>
  );
}

function Toggle({
  on,
  onClick,
  data,
  children,
}: {
  on: boolean;
  onClick: () => void;
  data: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-toggle={data}
      className={cn(
        "rounded-md border px-2 py-0.5 font-medium",
        on
          ? "border-brand bg-brand-soft text-brand-deep"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Right now
// ---------------------------------------------------------------------------

/**
 * Only while someone is in a test (decision 5): who is testing (answered of served, time left),
 * and who is paused, with Let them continue. Asked-to-finish students are marked; they also sit in
 * "Needs you".
 */
function RightNow({
  live,
  now,
  onOpen,
}: {
  live: { testing: LiveRow[]; paused: LiveRow[] };
  now: Date;
  onOpen: (t: PanelTarget) => void;
}) {
  if (live.testing.length + live.paused.length === 0) return null;
  const open = (r: LiveRow) =>
    onOpen({ kind: "cell", studentId: r.student.id, assignmentId: r.assignmentId });
  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-brand-soft/40 px-3 py-2"
      aria-label="Right now"
      data-right-now
    >
      {live.testing.length ? (
        <LiveLine icon={Play} label={`Testing ${live.testing.length}`}>
          {live.testing.map((r) => {
            const left = timeLeft(r.dueAt, now);
            return (
              <li key={r.attemptId} data-testing={r.attemptId}>
                <button type="button" className="hover:underline" onClick={() => open(r)}>
                  <span className="font-medium">
                    {r.student.firstName} {r.student.lastName[0]}
                  </span>{" "}
                  <span className="tabular">
                    {r.answered}/{r.total}
                  </span>
                  {left ? ` · ${left}` : ""}
                </button>
              </li>
            );
          })}
        </LiveLine>
      ) : null}
      {live.paused.length ? (
        <LiveLine icon={Clock} label={`Paused ${live.paused.length}`}>
          {live.paused.map((r) => (
            <li
              key={r.attemptId}
              className="inline-flex items-center gap-1.5"
              data-paused={r.attemptId}
            >
              <button type="button" className="hover:underline" onClick={() => open(r)}>
                <span className="font-medium">
                  {r.student.firstName} {r.student.lastName[0]}
                </span>{" "}
                · {r.title}{" "}
                <span className="tabular">
                  {r.answered}/{r.total}
                </span>
              </button>
              <LetContinueButton attemptId={r.attemptId} asked={r.asked} />
            </li>
          ))}
        </LiveLine>
      ) : null}
    </section>
  );
}

function LiveLine({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 pt-0.5 font-semibold text-brand-deep">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <ul className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who needs what
// ---------------------------------------------------------------------------

const CHIP_TONE: Record<WhoChip, CellTone> = {
  needs_you: "coral",
  testing: "brand",
  corrections: "warning",
  sent_back: "warning",
  relearning: "warning",
  retake_needed: "warning",
  ready: "coral_outline",
  not_started: "warning",
  missing: "warning",
};

/** Tap one to make its cells stand out and keep only the students who have one. */
function WhoChips({
  counts,
  active,
  onPick,
}: {
  counts: Record<WhoChip, number>;
  active: WhoChip | null;
  onPick: (chip: WhoChip) => void;
}) {
  const shown = WHO_CHIPS.filter((c) => counts[c] > 0 || c === active);
  if (shown.length === 0)
    return (
      <p className="text-sm text-success-foreground" data-who-chips="none">
        Everyone is caught up.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Who needs what">
      {shown.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={active === c}
          data-who-chip={c}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
            TONE_CLASS[CHIP_TONE[c]],
            active === c && "ring-2 ring-ring",
            active && active !== c && "opacity-60"
          )}
          onClick={() => onPick(c)}
        >
          {WHO_CHIP_LABEL[c]} <span className="tabular">{counts[c]}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

const TYPE_MARK: Record<ClassGradebookColumn["type"], string> = {
  formative: "F",
  summative: "S",
  practice: "P",
};

/**
 * Students down, tests across (decision 7), scrolling sideways in its own box with the name column
 * and the header row fixed. Each cell: the counting score, one status tag, small marks.
 */
function Grid({
  gb,
  view,
  chip,
  hideScores,
  onOpen,
}: {
  gb: ClassGradebook;
  view: ReturnType<typeof gradebookView>;
  chip: WhoChip | null;
  hideScores: boolean;
  onOpen: (t: PanelTarget) => void;
}) {
  return (
    <div
      className="hidden max-h-[70vh] overflow-auto rounded-lg border border-border md:block"
      data-gradebook-grid
    >
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 min-w-44 border-r border-b border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Student
            </th>
            {view.columns.map((c) => (
              <th
                key={c.assignmentId}
                scope="col"
                className="sticky top-0 z-20 w-40 max-w-40 min-w-40 border-r border-b border-border bg-card px-2 py-2 text-left align-bottom font-medium"
                data-column={c.assignmentId}
              >
                <Link
                  href={`/app/results/${c.assignmentId}`}
                  className="line-clamp-2 text-xs leading-snug hover:underline"
                  title={`${c.title}: open its results`}
                >
                  {c.title}
                </Link>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                  <span
                    className="rounded bg-muted px-1 font-medium"
                    title={c.type[0].toUpperCase() + c.type.slice(1)}
                  >
                    {TYPE_MARK[c.type]}
                  </span>
                  {c.status === "closed"
                    ? "closed"
                    : c.status === "scheduled"
                      ? "not open"
                      : "open"}
                  {c.cvtcRules ? " · CVTC" : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.student.id} data-student-row={r.student.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-b border-border bg-card px-3 py-1.5 text-left font-medium whitespace-nowrap"
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 hover:underline"
                  onClick={() => onOpen({ kind: "student", studentId: r.student.id })}
                  data-open-student={r.student.id}
                >
                  {r.student.lastName}, {r.student.firstName}
                  {r.toDo ? (
                    <span
                      className="rounded-md bg-warning-soft px-1 text-xs font-normal text-warning-foreground tabular"
                      title={`${r.toDo} to do`}
                    >
                      {r.toDo}
                    </span>
                  ) : null}
                </button>
              </th>
              {r.cells.map((cell, i) => (
                <td
                  key={cell.assignmentId}
                  className="border-r border-b border-border p-0 align-top"
                >
                  <CellButton
                    cell={cell}
                    column={view.columns[i]}
                    now={gb.generatedAt}
                    hideScores={hideScores}
                    dim={chip !== null && whoChip(cell.tag) !== chip}
                    lit={chip !== null && whoChip(cell.tag) === chip}
                    onClick={() =>
                      onOpen({
                        kind: "cell",
                        studentId: r.student.id,
                        assignmentId: cell.assignmentId,
                      })
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Class
            </th>
            {view.columns.map((c) => (
              <td
                key={c.assignmentId}
                className="border-r border-border bg-muted/30 px-2 py-2 align-top text-[11px] text-muted-foreground"
                data-footer={c.assignmentId}
              >
                <Footer column={c} hideScores={hideScores} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CellButton({
  cell,
  column,
  now,
  hideScores,
  dim,
  lit,
  onClick,
}: {
  cell: ClassGradebookCell;
  column: ClassGradebookColumn;
  now: Date;
  hideScores: boolean;
  dim: boolean;
  lit: boolean;
  onClick: () => void;
}) {
  const marks = cellMarks(cell, column, now);
  const score = hideScores ? null : scoreText(cell);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-1 px-2 py-1.5 text-left transition-opacity hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        dim && "opacity-35",
        lit && "bg-muted/40 ring-2 ring-ring/60 ring-inset"
      )}
      data-cell={`${cell.assignmentId}:${cell.studentId}`}
      data-cell-tag={cell.tag.kind}
    >
      <span className="flex min-h-4 w-full items-center gap-1.5 text-xs">
        {score ? <span className="font-semibold tabular">{score}</span> : null}
        {!hideScores && marks.viaFixes ? (
          <span className="text-[10px] text-muted-foreground">via fixes</span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {marks.retakeBy ? (
            <span
              className="inline-flex items-center gap-0.5 text-warning-foreground"
              title="The retake window closes within 48 hours"
              data-retake-by
            >
              <Clock className="size-3" aria-hidden />
              {marks.retakeBy.toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "America/Chicago",
              })}
            </span>
          ) : null}
          {marks.tabSwitches > 0 ? (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${marks.tabSwitches} tab ${marks.tabSwitches === 1 ? "switch" : "switches"}`}
              data-tab-switches={marks.tabSwitches}
            >
              <Flag className="size-3" aria-hidden />
              {marks.tabSwitches}
            </span>
          ) : null}
          {marks.tries && (marks.tries.allowed === null || marks.tries.allowed > 1) ? (
            <span
              className="tabular"
              title={`${marks.tries.used}${marks.tries.allowed ? ` of ${marks.tries.allowed}` : ""} ${marks.tries.used === 1 ? "try" : "tries"}`}
            >
              {marks.tries.used}
              {marks.tries.allowed ? `/${marks.tries.allowed}` : ""}
            </span>
          ) : null}
        </span>
      </span>
      <TagPill tag={cell.tag} />
    </button>
  );
}

/**
 * Column footers (decision 9: Class at a glance folded in): done / enrolled, the average counting
 * score, and on summatives the tier counts, "↑ N this week" and the Tier board.
 */
function Footer({ column: c, hideScores }: { column: ClassGradebookColumn; hideScores: boolean }) {
  const f = c.footer;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="tabular">
        {f.done}/{f.enrolled} done
        {!hideScores && f.average !== null ? ` · avg ${Math.round(f.average)}%` : ""}
      </span>
      {f.tiers ? (
        <span className="tabular" data-tiers>
          T1 {f.tiers[1]} · T2 {f.tiers[2]} · T3 {f.tiers[3]}
        </span>
      ) : null}
      {f.movedUpThisWeek > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-success-foreground">
          <ArrowUp className="size-3" aria-hidden />
          {f.movedUpThisWeek} this week
        </span>
      ) : null}
      {c.type === "summative" ? (
        <Link
          href={`/app/results/${c.assignmentId}/tiers`}
          className="font-medium text-brand-deep hover:underline"
        >
          Tier board
        </Link>
      ) : null}
    </span>
  );
}
