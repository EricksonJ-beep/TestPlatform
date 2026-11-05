"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowUp,
  Check,
  Clock,
  EyeOff,
  Flag,
  Hand,
  Pause,
  PenLine,
  Play,
  Search,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { CellTone } from "@/lib/class-gradebook";
import { periodLabel } from "@/lib/class-focus";
import type { PeriodOption } from "@/lib/current-course";
import {
  cellMarks,
  cellTitle,
  compactCell,
  DEFAULT_FILTERS,
  footerTitle,
  gradebookView,
  phoneLine,
  rightNow,
  scoreText,
  shortColumnLabels,
  timeLeft,
  unitBands,
  WHO_CHIP_LABEL,
  WHO_CHIPS,
  whoChip,
  type CompactCell,
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
import { deviceFlag } from "./device-flag";
import { GradebookPanel, type PanelTarget } from "./gradebook-panel";
import { setHideScores, useHideScores } from "./hide-scores";
import { TagPill, TONE_CLASS } from "./gradebook-tag";
import { ScoreTrail } from "@/components/score-trail";

const KEY: { tone: CellTone; label: string }[] = [
  { tone: "coral", label: "Your move" },
  { tone: "brand", label: "Testing now" },
  { tone: "warning", label: "Student owes" },
  { tone: "coral_outline", label: "Your OK (optional)" },
  { tone: "muted", label: "Quiet" },
  { tone: "success", label: "Done" },
];

/**
 * "Detailed" (Nov 5 2026): the compact grid is the default, so the whole semester fits on one
 * screen; Detailed brings back the earlier cells (the tag's words, the score trail, tries, via
 * fixes) for the days Jon wants to read a column through. Remembered per browser, like Hide
 * scores. Kept because it costs one switch and nothing he relied on is lost; the panel has all
 * of it either way.
 */
const detailedView = deviceFlag("bloom.gradebook.detailed");

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
          {course ? (
            <span
              className="text-sm text-muted-foreground"
              title="Every test assigned this term. Click a cell or a name for what's next; switch courses in the sidebar."
            >
              {course.name}
              {gradebook ? ` · ${gradebook.class.name}` : ""}
            </span>
          ) : null}
          {classes.length > 1 || (classes.length === 1 && classes[0].period) ? (
            <PeriodChips classes={classes} currentId={currentClassId} />
          ) : null}
          {live ? <div className="ml-auto">{live}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
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
              // The action revalidates /app, which already re-renders this page with the new
              // period; a second refresh on top would render it all twice.
              const r = await pickDashboardClass(c.id);
              if (!r.ok) {
                setError(r.error);
                router.refresh();
              }
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
  const hideScores = useHideScores();
  const detailed = detailedView.use();
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <WhoChips
          counts={view.chips}
          active={filters.chip}
          onPick={(chip) => set({ chip: filters.chip === chip ? null : chip })}
        />
        <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
          <Toggle
            on={filters.onlyOwing}
            onClick={() => set({ onlyOwing: !filters.onlyOwing })}
            data="only-owing"
            title="Only students who owe something"
          >
            Owes something
          </Toggle>
          {gb.columns.some((c) => c.type === "practice") ? (
            <Toggle
              on={filters.showPractice}
              onClick={() => set({ showPractice: !filters.showPractice })}
              data="practice"
              title={
                view.practiceColumns > 0
                  ? `Show ${view.practiceColumns} practice ${view.practiceColumns === 1 ? "column" : "columns"}`
                  : "Hide the practice columns"
              }
            >
              Practice
            </Toggle>
          ) : null}
          <span className="inline-flex items-center text-muted-foreground" role="group">
            <span className="mr-0.5">Sort</span>
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
          <label className="relative">
            <span className="sr-only">Find a student</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filters.find}
              onChange={(e) => set({ find: e.target.value })}
              placeholder="Find student"
              className="h-7 w-32 pl-7 text-xs"
              data-find-student
            />
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={hideScores}
            title="Hides every score on the Dashboard (the gradebook, Needs you and Recent activity) for the projector; status tags stay."
            data-hide-scores
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
              hideScores
                ? "bg-brand-soft text-brand-deep"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => setHideScores(!hideScores)}
          >
            <EyeOff className="size-3.5" aria-hidden />
            Hide scores
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={detailed}
            title="Detailed: each cell spelled out (status words, score history, tries). Remembered on this device."
            data-detailed
            className={cn(
              "hidden rounded-md px-1.5 py-0.5 font-medium md:inline-flex",
              detailed
                ? "bg-brand-soft text-brand-deep"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => detailedView.set(!detailed)}
          >
            Detailed
          </button>
        </div>
      </div>
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

      {view.rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No students match. Clear the filters to see the whole class.
        </p>
      ) : (
        <>
          {detailed ? (
            <DetailedGrid
              gb={gb}
              view={view}
              chip={filters.chip}
              hideScores={hideScores}
              onOpen={setPanel}
            />
          ) : (
            <CompactGrid
              gb={gb}
              view={view}
              chip={filters.chip}
              hideScores={hideScores}
              onOpen={setPanel}
            />
          )}
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
        className="hidden flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground md:flex"
        aria-label="Key"
      >
        {KEY.map((k) => (
          <li key={k.tone} className="inline-flex items-center gap-1">
            {detailed ? (
              <span
                className={cn("inline-block size-3 rounded-sm", TONE_CLASS[k.tone])}
                aria-hidden
              />
            ) : (
              // A sample cell, as the grid draws it.
              <span
                className={cn(
                  "relative inline-flex h-4 w-6 items-center justify-center rounded-sm border border-border text-[10px] tabular",
                  COMPACT_TONE[k.tone]
                )}
                aria-hidden
              >
                {k.tone === "brand" ? "2/5" : "80"}
                {k.tone === "coral" ? <YourMoveDot /> : null}
              </span>
            )}
            {k.label}
          </li>
        ))}
        {detailed ? null : (
          <>
            <li>
              <span className="font-semibold text-warning-foreground">M</span> missing
            </li>
            <li>
              <span className="font-semibold text-warning-foreground">–</span> not started
            </li>
            <li className="inline-flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-brand" aria-hidden />
              open now
            </li>
            <li>Q quiz · T test · hover a cell for the details</li>
          </>
        )}
        {view.practiceColumns > 0 ? (
          <li>
            {view.practiceColumns} practice {view.practiceColumns === 1 ? "column" : "columns"}{" "}
            hidden
          </li>
        ) : null}
      </ul>

      <GradebookPanel
        gb={gb}
        target={panel}
        hideScores={hideScores}
        showPractice={filters.showPractice}
        onTarget={setPanel}
      />
    </>
  );
}

function Toggle({
  on,
  onClick,
  data,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  data: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-toggle={data}
      title={title}
      className={cn(
        "rounded-md px-1.5 py-0.5 font-medium",
        on
          ? "bg-brand-soft text-brand-deep"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
      className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-brand-soft/50 px-2.5 py-1"
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-brand-deep">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}</ul>
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
    <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Who needs what">
      {shown.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={active === c}
          data-who-chip={c}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
            active === c && "bg-muted text-foreground ring-1 ring-ring",
            active && active !== c && "opacity-60"
          )}
          onClick={() => onPick(c)}
        >
          <span className={cn("size-2 rounded-full", DOT_CLASS[CHIP_TONE[c]])} aria-hidden />
          {WHO_CHIP_LABEL[c]}
          <span className="font-semibold text-foreground tabular">{counts[c]}</span>
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

/** The chips' dots and the compact cells, in the gradebook's colour families. */
const DOT_CLASS: Record<CellTone, string> = {
  coral: "bg-coral",
  brand: "bg-brand",
  warning: "bg-warning",
  coral_outline: "ring-1 ring-coral ring-inset",
  muted: "bg-muted-foreground/40",
  success: "bg-success",
};

/**
 * A compact cell's colour (Nov 5 2026): a soft fill for what needs someone (your move, testing,
 * the student owes), an outline for your optional OK, grey text for quiet, and plain for done, so
 * the colour is where the work is.
 */
const COMPACT_TONE: Record<CellTone, string> = {
  coral: "bg-coral-soft text-coral-deep font-semibold",
  brand: "bg-brand-soft text-brand-deep font-medium",
  warning: "bg-warning-soft text-warning-foreground",
  coral_outline: "text-coral-deep ring-1 ring-coral/60 ring-inset",
  muted: "text-muted-foreground",
  success: "text-foreground",
};

/** The corner dot on the teacher's own moves, so coral reads apart from the student's amber. */
function YourMoveDot() {
  return (
    <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-coral-deep" aria-hidden />
  );
}

const CELL_ICON: Record<NonNullable<CompactCell["icon"]>, LucideIcon | null> = {
  play: Play,
  pause: Pause,
  hand: Hand,
  timer: Timer,
  pen: PenLine,
  check: Check,
  dot: null,
};

/** Arrow keys move between the grid's cells and names (Home / End: the row's ends). */
function onGridKey(e: React.KeyboardEvent<HTMLTableElement>) {
  const from = (e.target as HTMLElement).closest<HTMLElement>("[data-r]");
  if (!from) return;
  const r = Number(from.dataset.r);
  const c = Number(from.dataset.c);
  const next =
    e.key === "ArrowRight"
      ? [r, c + 1]
      : e.key === "ArrowLeft"
        ? [r, c - 1]
        : e.key === "ArrowDown"
          ? [r + 1, c]
          : e.key === "ArrowUp"
            ? [r - 1, c]
            : e.key === "Home"
              ? [r, -1]
              : e.key === "End"
                ? [r, Number.MAX_SAFE_INTEGER]
                : null;
  if (!next) return;
  const table = e.currentTarget;
  let to = table.querySelector<HTMLElement>(`[data-r="${next[0]}"][data-c="${next[1]}"]`);
  if (!to && e.key === "End") {
    const row = table.querySelectorAll<HTMLElement>(`[data-r="${r}"]`);
    to = row[row.length - 1] ?? null;
  }
  if (!to) return;
  e.preventDefault();
  to.focus();
}

/**
 * The compact grid (Jon, Nov 5 2026: "see the entire semester on one view without having to
 * scroll"): one narrow column per test under its unit, a short label with the full title on
 * hover, and a cell that is the score and a colour; the words are in the tooltip and the panel.
 * The name column and the header stay put if it ever has to scroll. Columns keep the loader's
 * newest-first order.
 */
function CompactGrid({
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
  const labels = shortColumnLabels(view.columns);
  const bands = unitBands(view.columns);
  const unitStart = new Set(bands.slice(1).map((b) => b.start));
  const n = view.columns.length;
  const headTop = bands.length ? "top-5" : "top-0";
  return (
    <div
      // Under the top bar (3.5rem), the whole grid fits the window once scrolled to.
      className="hidden max-h-[calc(100dvh-4.5rem)] overflow-auto rounded-lg border border-border md:block"
      data-gradebook-grid="compact"
    >
      <table
        className="table-fixed border-separate border-spacing-0 text-xs"
        // As wide as it needs (about 3.5rem a test), never wider than the card.
        style={{ width: `min(100%, ${10 + n * 3.5}rem)` }}
        onKeyDown={onGridKey}
      >
        <colgroup>
          <col className="w-40" />
          {view.columns.map((c) => (
            <col key={c.assignmentId} />
          ))}
        </colgroup>
        <thead>
          {bands.length ? (
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 h-5 border-b border-border bg-card"
                aria-hidden
              />
              {bands.map((b) => (
                <th
                  key={`${b.unitId}:${b.start}`}
                  scope="colgroup"
                  colSpan={b.span}
                  title={b.name || "No unit"}
                  className={cn(
                    "sticky top-0 z-20 h-5 truncate border-b border-border bg-muted/60 px-1.5 text-left text-[10px] font-medium text-muted-foreground backdrop-blur",
                    b.start > 0 && "border-l border-l-foreground/20"
                  )}
                  data-unit-band={b.unitId ?? "none"}
                >
                  {b.name || "No unit"}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            <th
              scope="col"
              className={cn(
                "sticky left-0 z-30 border-r border-b border-border bg-card px-2 py-1 text-left text-[11px] font-medium text-muted-foreground",
                headTop
              )}
            >
              Student
            </th>
            {view.columns.map((c, i) => (
              <th
                key={c.assignmentId}
                scope="col"
                className={cn(
                  "sticky z-20 border-r border-b border-border bg-card px-0.5 py-1 text-center font-medium",
                  headTop,
                  c.type === "summative" && "bg-brand-soft/60",
                  unitStart.has(i) && "border-l border-l-foreground/20"
                )}
                data-column={c.assignmentId}
              >
                <Link
                  href={`/app/results/${c.assignmentId}`}
                  className={cn(
                    "relative block truncate rounded-sm text-[11px] leading-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    c.type === "summative" && "font-semibold text-brand-deep",
                    c.status === "scheduled" && "font-normal text-muted-foreground"
                  )}
                  title={columnTitle(c)}
                  aria-label={`${c.title}: open its results`}
                >
                  {labels[i]}
                </Link>
                <span className="flex h-2 items-center justify-center" aria-hidden>
                  {c.status === "open" ? <span className="size-1.5 rounded-full bg-brand" /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r, ri) => (
            <tr key={r.student.id} data-student-row={r.student.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-r border-b border-border bg-card p-0 text-left font-medium"
              >
                <button
                  type="button"
                  className="flex h-[22px] w-full items-center gap-1 px-2 text-left text-[13px] hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  onClick={() => onOpen({ kind: "student", studentId: r.student.id })}
                  title={`${r.student.firstName} ${r.student.lastName}${r.toDo ? `: ${r.toDo} to do` : ""}`}
                  data-open-student={r.student.id}
                  data-r={ri}
                  data-c={-1}
                >
                  <span className="truncate">
                    {r.student.lastName}, {r.student.firstName}
                  </span>
                  {r.toDo ? (
                    <span
                      className="ml-auto shrink-0 rounded bg-warning-soft px-1 text-[10px] leading-4 font-normal text-warning-foreground tabular"
                      aria-label={`${r.toDo} to do`}
                    >
                      {r.toDo}
                    </span>
                  ) : null}
                </button>
              </th>
              {r.cells.map((cell, i) => (
                <td
                  key={cell.assignmentId}
                  className={cn(
                    "border-r border-b border-border p-0",
                    unitStart.has(i) && "border-l border-l-foreground/20"
                  )}
                >
                  <CompactCellButton
                    cell={cell}
                    column={view.columns[i]}
                    student={r.student}
                    now={gb.generatedAt}
                    hideScores={hideScores}
                    dim={chip !== null && whoChip(cell.tag) !== chip}
                    lit={chip !== null && whoChip(cell.tag) === chip}
                    r={ri}
                    c={i}
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
              className="sticky bottom-0 left-0 z-30 border-r border-border bg-card px-2 py-1 text-left text-[11px] font-medium text-muted-foreground"
            >
              Class
            </th>
            {view.columns.map((c, i) => (
              <td
                key={c.assignmentId}
                className={cn(
                  "sticky bottom-0 z-20 border-r border-border bg-muted px-0.5 py-1 text-center align-top text-[10px] leading-3.5 text-muted-foreground",
                  unitStart.has(i) && "border-l border-l-foreground/20"
                )}
                title={footerTitle(c, { hideScores })}
                data-footer={c.assignmentId}
              >
                <CompactFooter column={c} hideScores={hideScores} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** A compact header's tooltip: the full title, its type and window. */
function columnTitle(c: ClassGradebookColumn): string {
  const day = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
  const type = {
    formative: "Quiz (formative)",
    summative: "Test (summative)",
    practice: "Practice",
  };
  const status =
    c.status === "closed"
      ? `closed${c.closesAt ? ` ${day(c.closesAt)}` : ""}`
      : c.status === "scheduled"
        ? `opens${c.opensAt ? ` ${day(c.opensAt)}` : " later"}`
        : `open${c.closesAt ? ` until ${day(c.closesAt)}` : ""}`;
  return `${c.title}\n${type[c.type]} · ${status}${c.cvtcRules ? " · CVTC" : ""}\nClick for its results`;
}

function CompactCellButton({
  cell,
  column,
  student,
  now,
  hideScores,
  dim,
  lit,
  r,
  c,
  onClick,
}: {
  cell: ClassGradebookCell;
  column: ClassGradebookColumn;
  student: { firstName: string; lastName: string };
  now: Date;
  hideScores: boolean;
  dim: boolean;
  lit: boolean;
  r: number;
  c: number;
  onClick: () => void;
}) {
  const shown = compactCell(cell, { hideScores });
  const marks = cellMarks(cell, column, now);
  const title = cellTitle(cell, column, now, { hideScores });
  const Icon = shown.icon ? CELL_ICON[shown.icon] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`${student.firstName} ${student.lastName}, ${title.replaceAll("\n", ". ")}`}
      className={cn(
        "relative flex h-[22px] w-full items-center justify-center tabular transition-opacity hover:ring-1 hover:ring-foreground/30 hover:brightness-95 hover:ring-inset focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        COMPACT_TONE[cell.tag.tone],
        cell.tag.kind === "missing" && "font-semibold ring-1 ring-warning ring-inset",
        dim && "opacity-30",
        lit && "ring-2 ring-ring ring-inset"
      )}
      data-cell={`${cell.assignmentId}:${cell.studentId}`}
      data-cell-tag={cell.tag.kind}
      data-r={r}
      data-c={c}
    >
      {Icon ? (
        <Icon className="size-3" aria-hidden />
      ) : shown.icon === "dot" ? (
        <span className="size-1 rounded-full bg-current" aria-hidden />
      ) : (
        shown.text
      )}
      {cell.tag.group === "your_move" && !cell.tag.closed ? <YourMoveDot /> : null}
      {marks.retakeBy ? (
        <Clock
          className="absolute top-0.5 left-0.5 size-2.5 text-warning-foreground"
          aria-hidden
          data-retake-by
        />
      ) : null}
      {marks.tabSwitches > 0 ? (
        <Flag
          className="absolute bottom-0.5 left-0.5 size-2.5 text-muted-foreground"
          aria-hidden
          data-tab-switches={marks.tabSwitches}
        />
      ) : null}
    </button>
  );
}

/** The compact footer: the average, done of enrolled, and on tests the Tier board and ↑ N. */
function CompactFooter({
  column: c,
  hideScores,
}: {
  column: ClassGradebookColumn;
  hideScores: boolean;
}) {
  const f = c.footer;
  // A test that isn't open yet has nothing to sum up.
  if (c.status === "scheduled" && f.done === 0) return null;
  return (
    <span className="flex flex-col items-center tabular">
      <span className="font-semibold text-foreground">
        {!hideScores && f.average !== null ? Math.round(f.average) : "–"}
      </span>
      <span>
        {f.done}/{f.enrolled}
      </span>
      {c.type === "summative" ? (
        <span className="inline-flex items-center gap-0.5">
          <Link
            href={`/app/results/${c.assignmentId}/tiers`}
            className="font-medium text-brand-deep hover:underline"
            aria-label={`${c.title}: Tier board`}
          >
            Tiers
          </Link>
          {f.movedUpThisWeek > 0 ? (
            <span className="inline-flex items-center text-success-foreground">
              <ArrowUp className="size-2.5" aria-hidden />
              {f.movedUpThisWeek}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Detailed (the grid as it was before Nov 5 2026): students down, tests across (decision 7),
 * scrolling sideways in its own box with the name column and the header row fixed. Each cell: the
 * counting score, one status tag, small marks.
 */
function DetailedGrid({
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
      data-gradebook-grid="detailed"
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
      {!hideScores && cell.trail ? (
        // The score trail (R7): every step before the score shown, each dated in the tooltip.
        <ScoreTrail
          steps={cell.trail}
          prefix="from"
          className="text-[10px] text-muted-foreground"
        />
      ) : !hideScores && cell.growth ? (
        <span
          className="text-[10px] text-muted-foreground tabular"
          title={`First try ${Math.round(cell.growth.first)}%, now ${Math.round(cell.growth.now)}%`}
          data-growth
        >
          from {Math.round(cell.growth.first)}%
        </span>
      ) : null}
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
