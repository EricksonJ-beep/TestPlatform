"use client";

import Link from "next/link";
import { ArrowUp, Clock, Flag, Search } from "lucide-react";
import { cn } from "cn";
import {
  cellMarks,
  cellTitle,
  footerTitle,
  scoreText,
  unitBands,
  WHO_CHIP_LABEL,
  WHO_CHIPS,
  whoChip,
  type GradebookFilters,
  type GradebookView,
  type WhoChip,
} from "@/lib/gradebook-view";
import type {
  ClassGradebook,
  ClassGradebookCell,
  ClassGradebookColumn,
} from "@/lib/queries/class-gradebook";
import { cellLook, cellText, kindLabels, type CellLook } from "@/lib/teacher-home";
import { btn, segmented } from "@/components/home/ui";
import { deviceFlag } from "./device-flag";
import type { PanelTarget } from "./gradebook-panel";
import { setHideScores } from "./hide-scores";
import { TagPill } from "./gradebook-tag";
import { ScoreTrail } from "@/components/score-trail";

/**
 * "Detailed" (Nov 5 2026): the compact grid is the default, so the whole semester fits on one
 * screen; Detailed brings back the earlier cells (the tag's words, the score trail, tries, via
 * fixes) for the days Jon wants to read a column through. Remembered per browser, like Hide
 * scores. Kept because it costs one switch and nothing he relied on is lost; the panel has all
 * of it either way.
 */
const detailedView = deviceFlag("bloom.gradebook.detailed");

// ---------------------------------------------------------------------------
// The gradebook
// ---------------------------------------------------------------------------

/**
 * The class gradebook (Jon, Oct 13 2026, dashboard plan build step 4; drawn as the home pages
 * redesign §4 has it): the toolbar (Find, Sort, Hide scores, Detailed, Owes something, Practice
 * and the who-needs-what chips), then every student × every test of the class under its unit,
 * and the key. A cell or a name opens the side panel with the matching actions (the page owns
 * the panel and the filters, so the chips above the gradebook drive the same view).
 */
export function Gradebook({
  gb,
  view,
  filters,
  set,
  hideScores,
  onOpen,
}: {
  gb: ClassGradebook;
  view: GradebookView;
  filters: GradebookFilters;
  set: (patch: Partial<GradebookFilters>) => void;
  hideScores: boolean;
  onOpen: (t: PanelTarget) => void;
}) {
  const detailed = detailedView.use();
  const chips = WHO_CHIPS.filter((c) => view.chips[c] > 0 || c === filters.chip);
  return (
    <div className="flex flex-col gap-4" data-class-gradebook>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-display text-2xl font-semibold tracking-tight">Gradebook</h2>
        <label className="relative">
          <span className="sr-only">Find a student</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            type="search"
            value={filters.find}
            onChange={(e) => set({ find: e.target.value })}
            placeholder="Find"
            className="h-11 w-44 rounded-[10px] border border-line-strong bg-surface pr-3 pl-9 text-[15px] text-ink placeholder:text-ink-muted"
            data-find-student
          />
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-muted" id="gradebook-sort">
            Sort
          </span>
          <div className={segmented.track} role="group" aria-labelledby="gradebook-sort">
            {(["name", "todo"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filters.sort === s}
                data-sort={s}
                className={cn(segmented.segment, filters.sort === s ? segmented.on : segmented.off)}
                onClick={() => set({ sort: s })}
              >
                {s === "name" ? "Name" : "Most to do"}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={hideScores}
          title="Hides every score on this page (the gradebook, Needs you and Recent activity) for the projector; the colours stay."
          data-hide-scores
          className={cn(btn.base, hideScores ? btn.dark : btn.outline)}
          onClick={() => setHideScores(!hideScores)}
        >
          Hide scores
        </button>
        <button
          type="button"
          aria-pressed={detailed}
          title="Detailed: each cell spelled out (status words, score history, tries). Remembered on this device."
          data-detailed
          className={cn(btn.base, detailed ? btn.dark : btn.outline)}
          onClick={() => detailedView.set(!detailed)}
        >
          Detailed
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
        <ToggleChip
          on={filters.onlyOwing}
          onClick={() => set({ onlyOwing: !filters.onlyOwing })}
          data="only-owing"
          title="Only students who owe something"
        >
          Owes something
        </ToggleChip>
        {gb.columns.some((c) => c.type === "practice") ? (
          <ToggleChip
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
          </ToggleChip>
        ) : null}
        {chips.map((c) => (
          <ToggleChip
            key={c}
            on={filters.chip === c}
            onClick={() => set({ chip: filters.chip === c ? null : c })}
            who={c}
            title={`Only students with a "${WHO_CHIP_LABEL[c]}" cell`}
          >
            {WHO_CHIP_LABEL[c]}
            <span className="tabular">{view.chips[c]}</span>
          </ToggleChip>
        ))}
        {chips.length === 0 ? (
          <span className="text-sm text-done" data-who-chips="none">
            Everyone is caught up.
          </span>
        ) : null}
      </div>
      {filters.chip ? (
        <p className="text-sm text-ink-muted" data-chip-names>
          {WHO_CHIP_LABEL[filters.chip]}:{" "}
          {view.rows.map((r, i) => (
            <span key={r.student.id}>
              {i > 0 ? ", " : ""}
              <button
                type="button"
                className="text-ink underline-offset-2 hover:underline"
                onClick={() => onOpen({ kind: "student", studentId: r.student.id })}
              >
                {r.student.firstName} {r.student.lastName}
              </button>
            </span>
          ))}
        </p>
      ) : null}

      {view.rows.length === 0 ? (
        <p className="py-4 text-center text-[15px] text-ink-muted">
          No students match. Clear the filters to see the whole class.
        </p>
      ) : detailed ? (
        <DetailedGrid
          gb={gb}
          view={view}
          chip={filters.chip}
          hideScores={hideScores}
          onOpen={onOpen}
        />
      ) : (
        <CompactGrid
          gb={gb}
          view={view}
          chip={filters.chip}
          hideScores={hideScores}
          onOpen={onOpen}
        />
      )}

      <ul
        className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-muted"
        aria-label="Key"
      >
        {KEY.map((k) => (
          <li key={k.look} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex h-5 w-8 items-center justify-center rounded-md text-[11px] tabular",
                LOOK[k.look]
              )}
              aria-hidden
            >
              {k.sample}
            </span>
            {k.label}
          </li>
        ))}
        <li>Plain numbers are done.</li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-stain" aria-hidden />A dot under a label: open
          now.
        </li>
        {view.practiceColumns > 0 ? (
          <li>
            {view.practiceColumns} practice {view.practiceColumns === 1 ? "column" : "columns"}{" "}
            hidden.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** A 44px on/off chip: `segment` when off, ink when on. */
function ToggleChip({
  on,
  onClick,
  data,
  who,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  data?: string;
  who?: WhoChip;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-toggle={data}
      data-who-chip={who}
      title={title}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold",
        on ? "bg-ink text-white" : "bg-segment text-ink-soft hover:text-ink"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/** How each cell state is drawn (§4). State is never colour alone: each has its own words. */
const LOOK: Record<CellLook, string> = {
  done: "text-ink",
  owes: "bg-owed font-bold text-owed-text",
  testing: "bg-stain font-bold text-white",
  paused: "bg-stain-tint font-semibold text-stain-deep",
  missing: "border-[1.5px] border-dashed border-eosin-deep font-semibold text-eosin-text",
  your_move: "bg-eosin font-bold text-ink",
  your_ok: "border-[1.5px] border-eosin text-ink",
  not_started: "text-ink-muted",
  empty: "",
};

const KEY: { look: CellLook; label: string; sample: string }[] = [
  { look: "testing", label: "Testing now", sample: "4/25" },
  { look: "paused", label: "Paused", sample: "" },
  { look: "owes", label: "Student owes corrections", sample: "62" },
  { look: "missing", label: "Missing", sample: "" },
  { look: "your_move", label: "Your move", sample: "74" },
  { look: "your_ok", label: "Your OK (optional)", sample: "85" },
];

const TYPE_MARK: Record<ClassGradebookColumn["type"], string> = {
  formative: "F",
  summative: "S",
  practice: "P",
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

/** The unit header's rule: the newest unit violet, the next lighter, older ones lighter still. */
const UNIT_RULE = ["border-stain", "border-stain-mid", "border-stain-faint"];

/**
 * The grid (home pages redesign §4; Jon, Nov 5 2026: "see the entire semester on one view"): a
 * real table, laid out to the spec's proportions (a 1.7-share name column of at least 200px, one
 * share of at least 64px per test, 6px between cells), scrolling sideways inside its card on a
 * narrow screen with the names staying put. Unit names span their tests; a cell is the score and
 * a fill, and its words are in the tooltip and the panel. Columns keep the loader's newest-first
 * order.
 */
function CompactGrid({
  gb,
  view,
  chip,
  hideScores,
  onOpen,
}: {
  gb: ClassGradebook;
  view: GradebookView;
  chip: WhoChip | null;
  hideScores: boolean;
  onOpen: (t: PanelTarget) => void;
}) {
  const bands = unitBands(view.columns);
  const labels = kindLabels(view.columns);
  const n = view.columns.length;
  // The rank of each unit band among the named units, newest first, for its rule's colour.
  const named = bands.filter((b) => b.unitId !== null);
  const rule = (unitId: string | null) =>
    unitId === null
      ? "border-line"
      : UNIT_RULE[
          Math.min(
            named.findIndex((b) => b.unitId === unitId),
            UNIT_RULE.length - 1
          )
        ];
  return (
    <div className="overflow-x-auto" data-gradebook-grid="compact">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: `${Math.max(800, 200 + n * 70)}px` }}
        onKeyDown={onGridKey}
      >
        <colgroup>
          <col style={{ width: `max(200px, ${(170 / (1.7 + n)).toFixed(2)}%)` }} />
          {view.columns.map((c) => (
            <col key={c.assignmentId} />
          ))}
        </colgroup>
        <thead>
          {bands.length ? (
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface" aria-hidden />
              {bands.map((b) => (
                <th
                  key={`${b.unitId}:${b.start}`}
                  scope="colgroup"
                  colSpan={b.span}
                  className="px-[3px] pb-1 text-left align-bottom font-body font-semibold"
                  data-unit-band={b.unitId ?? "none"}
                >
                  <span
                    className={cn(
                      "block truncate border-b-[3px] pb-1.5 text-sm text-ink",
                      rule(b.unitId)
                    )}
                    title={b.name || "No unit"}
                  >
                    {b.name || "No unit"}
                  </span>
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface px-1 py-2 text-left text-[13px] font-medium text-ink-muted"
            >
              Student
            </th>
            {view.columns.map((c, i) => (
              <th
                key={c.assignmentId}
                scope="col"
                className="px-[3px] py-2 text-center font-normal"
                data-column={c.assignmentId}
              >
                <Link
                  href={`/app/results/${c.assignmentId}`}
                  className={cn(
                    "block truncate rounded-md text-[13px] hover:underline",
                    c.type === "summative" ? "font-bold text-ink" : "text-ink-muted"
                  )}
                  title={columnTitle(c)}
                  aria-label={`${c.title}: open its results`}
                >
                  {labels[i]}
                </Link>
                <span className="flex h-2 items-center justify-center" aria-hidden>
                  {c.status === "open" ? <span className="size-1.5 rounded-full bg-stain" /> : null}
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
                className="sticky left-0 z-10 border-t border-line-soft bg-surface py-[3px] pr-2 text-left font-medium"
              >
                <button
                  type="button"
                  className="flex h-[34px] w-full items-center gap-2 rounded-[9px] px-1 text-left text-sm font-medium text-ink hover:bg-stain-wash"
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
                      className="ml-auto inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-owed px-1.5 text-[13px] font-bold text-owed-text tabular"
                      aria-label={`${r.toDo} to do`}
                    >
                      {r.toDo}
                    </span>
                  ) : null}
                </button>
              </th>
              {r.cells.map((cell, i) => (
                <td key={cell.assignmentId} className="border-t border-line-soft px-[3px] py-[3px]">
                  <CompactCellButton
                    cell={cell}
                    column={view.columns[i]}
                    student={r.student}
                    now={gb.generatedAt}
                    hideScores={hideScores}
                    dim={chip !== null && whoChip(cell.tag) !== chip}
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
              className="sticky left-0 z-10 border-t-2 border-ink bg-surface px-1 py-3 text-left align-top text-sm font-semibold text-ink"
            >
              Class average
            </th>
            {view.columns.map((c) => (
              <td
                key={c.assignmentId}
                className="border-t-2 border-ink px-[3px] py-3 text-center align-top"
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

/** A column header's tooltip: the full title, its type and window. */
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
  r: number;
  c: number;
  onClick: () => void;
}) {
  const look = cellLook(cell.tag);
  const shown = cellText(cell, { hideScores });
  const marks = cellMarks(cell, column, now);
  const title = cellTitle(cell, column, now, { hideScores });
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={`${student.firstName} ${student.lastName}, ${title.replaceAll("\n", ". ")}`}
      className={cn(
        "relative flex h-[34px] w-full items-center justify-center rounded-[9px] tabular hover:brightness-95",
        LOOK[look],
        shown.small ? "text-xs" : "text-sm",
        look === "done" || look === "not_started" || look === "empty" ? "hover:bg-stain-wash" : "",
        dim && "opacity-30"
      )}
      data-cell={`${cell.assignmentId}:${cell.studentId}`}
      data-cell-tag={cell.tag.kind}
      data-cell-look={look}
      data-r={r}
      data-c={c}
    >
      {shown.dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : shown.text}
      {marks.tabSwitches > 0 ? (
        <span
          className="absolute top-1 left-1 size-1.5 rounded-full bg-ink-muted"
          aria-hidden
          data-tab-switches={marks.tabSwitches}
        />
      ) : null}
      {marks.retakeBy ? (
        <Clock className="absolute top-0.5 right-0.5 size-2.5" aria-hidden data-retake-by />
      ) : null}
    </button>
  );
}

/** The class average row: the average, turned in of enrolled, and on tests the Tier board. */
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
      <span className="font-display text-lg leading-tight font-semibold text-ink">
        {!hideScores && f.average !== null ? Math.round(f.average) : "–"}
      </span>
      <span className="text-xs text-ink-muted">
        {f.done} of {f.enrolled}
      </span>
      {c.type === "summative" ? (
        <span className="inline-flex items-center gap-1 text-xs">
          <Link
            href={`/app/results/${c.assignmentId}/tiers`}
            className="font-semibold text-stain-deep underline-offset-2 hover:underline"
            aria-label={`${c.title}: Tier board`}
          >
            Tiers
          </Link>
          {f.movedUpThisWeek > 0 ? (
            <span className="inline-flex items-center text-done">
              <ArrowUp className="size-3" aria-hidden />
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
  view: GradebookView;
  chip: WhoChip | null;
  hideScores: boolean;
  onOpen: (t: PanelTarget) => void;
}) {
  return (
    <div
      className="max-h-[70vh] overflow-auto rounded-2xl border border-line"
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
                      className="rounded-full bg-owed px-2 text-xs font-bold text-owed-text tabular"
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
              Class average
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
