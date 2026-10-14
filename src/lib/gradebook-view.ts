/**
 * The Dashboard's class gradebook, as the teacher sees it (Jon, Oct 13 2026: "a complete gradebook
 * view for the class so I can see who needs to take what without having to go into each
 * assessment"; docs/dashboard-plan.md build step 4). Pure rules on top of `getClassGradebook`:
 * which columns show, the who-needs-what chips, the filters and sorts, the "Right now" strip, each
 * cell's score line and small marks, and the panel's plain sentence. No database, no clock of its
 * own: the loader's `generatedAt` is "now", so the server and the browser render the same thing.
 */
import { CENTRAL, type CellTag, type TagFormat } from "@/lib/class-gradebook";
import { PRACTICE_PASS_PERCENT, practiceOwed, targetList } from "@/lib/quiz-practice";
import type {
  ClassGradebook,
  ClassGradebookCell,
  ClassGradebookColumn,
} from "@/lib/queries/class-gradebook";
import { correctionsProgress, type StudentToDo } from "@/lib/student-home";

type Student = ClassGradebook["students"][number];

// ---------------------------------------------------------------------------
// Who needs what
// ---------------------------------------------------------------------------

export type WhoChip =
  | "needs_you"
  | "testing"
  | "corrections"
  | "sent_back"
  | "relearning"
  | "retake_needed"
  | "ready"
  | "not_started"
  | "missing";

/** Chip order (wireframe: Needs you, then what the students owe, Not started and Missing last). */
export const WHO_CHIPS: WhoChip[] = [
  "needs_you",
  "testing",
  "corrections",
  "sent_back",
  "relearning",
  "retake_needed",
  "ready",
  "not_started",
  "missing",
];

export const WHO_CHIP_LABEL: Record<WhoChip, string> = {
  needs_you: "Needs you",
  testing: "Testing now",
  corrections: "Corrections",
  sent_back: "Sent back",
  relearning: "Relearning",
  retake_needed: "Retake needed",
  ready: "Ready for your OK",
  not_started: "Not started",
  missing: "Missing",
};

/**
 * Rule (research notes C, "Filters"): the chip a cell's tag falls under. Every one of the
 * teacher's moves is "Needs you"; "Corrections" covers both what must be fixed and
 * "Corrections → 100%" (decision 2: not optional). Quiet and done cells, and a retake state on a
 * closed test (it can't be taken), fall under none.
 */
export function whoChip(tag: CellTag): WhoChip | null {
  if (tag.closed) return null;
  if (tag.group === "your_move") return "needs_you";
  if (tag.group === "testing") return "testing";
  if (tag.group === "your_ok") return "ready";
  switch (tag.kind) {
    case "corrections_needed":
    case "corrections_to_full":
      return "corrections";
    case "sent_back":
    case "relearning":
    case "retake_needed":
    case "not_started":
    case "missing":
      return tag.kind;
    default:
      return null;
  }
}

/**
 * Rule: a cell is "to do" when it is the teacher's move or something the student owes. Testing
 * now, "Ready, needs your OK" (optional), quiet, done, and closed retake states are not.
 */
export function isToDo(tag: CellTag): boolean {
  return !tag.closed && (tag.group === "your_move" || tag.group === "owes");
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

export type GradebookFilters = {
  /** Practice columns are off by default (decision 7). */
  showPractice: boolean;
  /** Only students who owe something. */
  onlyOwing: boolean;
  /** Find a student by name. */
  find: string;
  sort: "name" | "todo";
  /** A who-needs-what chip: its cells stand out and only students with one stay listed. */
  chip: WhoChip | null;
};

export const DEFAULT_FILTERS: GradebookFilters = {
  showPractice: false,
  onlyOwing: false,
  find: "",
  sort: "name",
  chip: null,
};

export type GradebookViewRow = {
  student: Student;
  /** The visible columns' cells, in column order. */
  cells: ClassGradebookCell[];
  /** Cells that are to do (`isToDo`) in the visible columns. */
  toDo: number;
};

export type GradebookView = {
  columns: ClassGradebookColumn[];
  rows: GradebookViewRow[];
  /** Cells per chip across the whole class (visible columns), whatever the other filters say. */
  chips: Record<WhoChip, number>;
  /** Practice columns hidden by the Practice switch. */
  practiceColumns: number;
};

/** "Ava Adams", "Adams, Ava" or any piece of either, any case. */
function matchesName(s: Student, find: string): boolean {
  const q = find.trim().toLowerCase();
  if (!q) return true;
  return [`${s.firstName} ${s.lastName}`, `${s.lastName}, ${s.firstName}`].some((n) =>
    n.toLowerCase().includes(q)
  );
}

/** Rule (decision 7): formative and summative columns always show; practice only when switched on. */
export function columnShown(
  c: Pick<ClassGradebookColumn, "type">,
  f: Pick<GradebookFilters, "showPractice">
): boolean {
  return f.showPractice || c.type !== "practice";
}

/**
 * Rule (research notes C, "Filters"; decision 7): formative and summative columns always, practice
 * only when switched on; the chips count every student; then "only students who owe something",
 * the name search and the chip narrow the rows; sort by name (the roster's last, first order) or by
 * most to do.
 */
export function gradebookView(gb: ClassGradebook, f: GradebookFilters): GradebookView {
  const keep = gb.columns.map((c) => columnShown(c, f));
  const columns = gb.columns.filter((_, i) => keep[i]);
  const chips = Object.fromEntries(WHO_CHIPS.map((c) => [c, 0])) as Record<WhoChip, number>;
  const all = gb.rows.map((r) => {
    const cells = r.cells.filter((_, i) => keep[i]);
    for (const c of cells) {
      const chip = whoChip(c.tag);
      if (chip) chips[chip] += 1;
    }
    return { student: r.student, cells, toDo: cells.filter((c) => isToDo(c.tag)).length };
  });
  const rows = all.filter(
    (r) =>
      (!f.onlyOwing || r.toDo > 0) &&
      matchesName(r.student, f.find) &&
      (!f.chip || r.cells.some((c) => whoChip(c.tag) === f.chip))
  );
  if (f.sort === "todo") {
    const order = new Map(all.map((r, i) => [r.student.id, i]));
    rows.sort((a, b) => b.toDo - a.toDo || order.get(a.student.id)! - order.get(b.student.id)!);
  }
  return { columns, rows, chips, practiceColumns: gb.columns.length - columns.length };
}

export type PanelItem = { cell: ClassGradebookCell; column: ClassGradebookColumn };

/**
 * A student's panel (research notes C, "Clicks"): over the columns the grid shows (practice only
 * when switched on, so the panel's "N to do" matches the row badge and the phone line), the cells
 * that are to do, what waits on the teacher's optional OK or is being taken now, and how many are
 * done. Null when the student isn't on the roster.
 */
export function studentPanelItems(
  gb: ClassGradebook,
  studentId: string,
  f: Pick<GradebookFilters, "showPractice">
): { toDo: PanelItem[]; other: PanelItem[]; done: number; total: number } | null {
  const row = gb.rows.find((r) => r.student.id === studentId);
  if (!row) return null;
  const items = row.cells
    .map((cell, i) => ({ cell, column: gb.columns[i] }))
    .filter((x) => columnShown(x.column, f));
  return {
    toDo: items.filter((x) => isToDo(x.cell.tag)),
    other: items.filter((x) => x.cell.tag.group === "your_ok" || x.cell.tag.group === "testing"),
    done: items.filter((x) => x.cell.tag.kind === "done").length,
    total: items.length,
  };
}

export type StudentPanel = {
  /** The cells that are to do in the shown columns: the row badge's number. */
  toDo: number;
  done: number;
  total: number;
  /** What the student's own home lists for this class's tests (`buildStudentToDo`). */
  list: StudentToDo;
  /** The cell behind each of the list's rows, by assignment id. */
  cells: Map<string, PanelItem>;
  /**
   * What the teacher would act on or watch that isn't on the student's list (a Missing test, a
   * check-off on an older try), over the shown columns.
   */
  also: PanelItem[];
};

/**
 * A student's panel (Jon, Oct 14 2026, docs/student-home-plan.md "Teacher side": "the student
 * panel lists the same to-do the student sees"): the rows of the student's own home for this
 * class, from the same builder (`studentToDo`, made by the loader), each with its cell; then what
 * the teacher would still act on or watch that the list doesn't show; and the row badge's count,
 * done and total over the columns the grid shows (`studentPanelItems`). Null when the student
 * isn't on the roster.
 */
export function studentPanel(
  gb: ClassGradebook,
  studentId: string,
  f: Pick<GradebookFilters, "showPractice">
): StudentPanel | null {
  const row = gb.rows.find((r) => r.student.id === studentId);
  const items = studentPanelItems(gb, studentId, f);
  if (!row || !items) return null;
  const list = row.studentToDo;
  const cells = new Map(
    row.cells.map((cell, i) => [cell.assignmentId, { cell, column: gb.columns[i] }] as const)
  );
  const listed = new Set(
    [...list.todo, ...list.higher, ...list.waiting].map((r) => r.assignmentId)
  );
  const flagged = new Set([...items.toDo, ...items.other].map((x) => x.cell));
  return {
    toDo: items.toDo.length,
    done: items.done,
    total: items.total,
    list,
    cells,
    // In column order, as the grid shows them.
    also: [...cells.values()].filter(
      (x) => flagged.has(x.cell) && !listed.has(x.cell.assignmentId)
    ),
  };
}

/** "Cho, L": the phone list's short name. */
export function shortName(s: { firstName: string; lastName: string }): string {
  return s.firstName ? `${s.lastName}, ${s.firstName[0]}` : s.lastName;
}

/** The phone line (research notes C: one line per student, "Cho, L: 3 to do"). */
export function phoneLine(row: Pick<GradebookViewRow, "student" | "toDo">): string {
  return `${shortName(row.student)}: ${row.toDo ? `${row.toDo} to do` : "all caught up"}`;
}

// ---------------------------------------------------------------------------
// Right now
// ---------------------------------------------------------------------------

export type LiveRow = {
  student: Student;
  assignmentId: string;
  title: string;
  attemptId: string;
  attemptNumber: number;
  answered: number;
  total: number;
  dueAt: Date | null;
  paused: boolean;
  asked: boolean;
};

/**
 * Rule (decision 5; research notes C, "Testing now"): everyone with an open attempt on any of the
 * class's tests, split into testing (active in the last 10 minutes) and paused (Finish later, idle,
 * or the window closed; `currentPause` decided it in the loader). Asked-to-finish students are
 * paused too; they also count in "Needs you". Whatever tag wins the cell, an open attempt shows here,
 * except one whose time ran out before it paused (`outOfTime`): nobody is testing in it, and it is
 * submitted when they come back (the same rule as the live stamp's `testingNow`).
 */
export function rightNow(gb: ClassGradebook): { testing: LiveRow[]; paused: LiveRow[] } {
  const testing: LiveRow[] = [];
  const paused: LiveRow[] = [];
  for (const row of gb.rows) {
    row.cells.forEach((cell, i) => {
      const open = cell.attempts.find((a) => a.id === cell.openAttemptId);
      if (!open || open.outOfTime) return;
      const live: LiveRow = {
        student: row.student,
        assignmentId: cell.assignmentId,
        title: gb.columns[i].title,
        attemptId: open.id,
        attemptNumber: open.number,
        answered: cell.tag.progress?.answered ?? 0,
        total: cell.tag.progress?.total ?? 0,
        dueAt: open.dueAt,
        paused: open.paused,
        asked: open.paused && open.askedAt !== null,
      };
      (open.paused ? paused : testing).push(live);
    });
  }
  return { testing, paused };
}

/** "18 min left", "1 h 5 min left", "time's up"; null with no deadline. */
export function timeLeft(dueAt: Date | null, now: Date): string | null {
  if (!dueAt) return null;
  const minutes = Math.ceil((dueAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "time's up";
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

// ---------------------------------------------------------------------------
// One cell
// ---------------------------------------------------------------------------

const pct = (n: number) => `${Math.round(n)}%`;

/** Line 1 (research notes C): the counting score, with the tier on summatives ("T2 74%"). */
export function scoreText(cell: ClassGradebookCell): string | null {
  if (!cell.score) return null;
  return cell.score.tier
    ? `T${cell.score.tier} ${pct(cell.score.percent)}`
    : pct(cell.score.percent);
}

export type CellMarks = {
  /** "2 of 3 tries": attempts used, and allowed (null = unlimited). */
  tries: { used: number; allowed: number | null } | null;
  /** The cap's retake window ends in under 48 hours and a retake is still on offer. */
  retakeBy: Date | null;
  tabSwitches: number;
  /** Corrections lifted the counting score. */
  viaFixes: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rule (research notes C, "Small marks"): tries used once there is an attempt; a clock with
 * "Retake by …" only while a retake is on offer on an open test and the cap's window ends within
 * 48 hours; the tab-switch flag; "via fixes" when the counting score came from corrections.
 */
export function cellMarks(
  cell: ClassGradebookCell,
  column: ClassGradebookColumn,
  now: Date
): CellMarks {
  const left = cell.retakeBy ? cell.retakeBy.getTime() - now.getTime() : -1;
  const offered = cell.cycle === "retake_available" || cell.cycle === "awaiting_unlock";
  return {
    tries:
      cell.attemptsUsed > 0 ? { used: cell.attemptsUsed, allowed: column.attemptsAllowed } : null,
    retakeBy:
      offered && column.status === "open" && left > 0 && left <= 2 * DAY_MS ? cell.retakeBy : null,
    tabSwitches: cell.tabSwitches,
    viaFixes:
      cell.score?.basis === "corrections_to_threshold" ||
      cell.score?.basis === "corrections_to_full",
  };
}

/**
 * The cell panel's plain sentence (research notes C, "Clicks": "Took try 1 Oct 9 (62%);
 * corrections 3 of 8 started", in the student's own words for an owed set; Oct 14 2026: a quiz's practice still owed before the retake, R3,
 * "needs 80% on practice for U2.LT1 (best 60%)", and a closed test reopened for the student ends
 * "reopened through Oct 15", R4; past the cap's window on an open test, an approved retake ends
 * "retake open through Oct 15"). Scores drop out when "Hide scores" is on (decision 6).
 */
export function cellSentence(
  cell: ClassGradebookCell,
  column: ClassGradebookColumn,
  opts: { hideScores: boolean; fmt?: TagFormat }
): string {
  const fmt = opts.fmt ?? CENTRAL;
  const parts: string[] = [];
  const finished = cell.attempts.filter((a) => a.status !== "in_progress");
  const open = cell.attempts.find((a) => a.id === cell.openAttemptId) ?? null;

  if (cell.attempts.length === 0) {
    if (column.status === "scheduled")
      return column.opensAt ? `Opens ${fmt.date(column.opensAt)}.` : "Not open yet.";
    if (column.status === "closed")
      return column.closesAt
        ? `Never started; the test closed ${fmt.date(column.closesAt)}.`
        : "Never started; the test is closed.";
    return "Hasn't started yet.";
  }
  if (finished.length) {
    const tries = finished.map((a) => {
      const when = a.submittedAt ? ` ${fmt.date(a.submittedAt)}` : "";
      const notes = [
        !opts.hideScores && a.percent !== null ? pct(a.percent) : null,
        a.pendingManual ? `${a.pendingManual} to grade` : null,
      ].filter(Boolean);
      return `try ${a.number}${a.scopeCodes ? ` (retake of ${a.scopeCodes.join(", ")})` : ""}${when}${notes.length ? ` (${notes.join(", ")})` : ""}`;
    });
    parts.push(`Took ${tries.join(", ")}`);
  }
  if (open) {
    const progress = cell.tag.progress
      ? `${cell.tag.progress.answered} of ${cell.tag.progress.total} answered`
      : null;
    if (open.paused)
      parts.push(
        `try ${open.number} is paused${progress ? ` at ${progress}` : ""}${open.askedAt ? "; they asked to finish" : ""}`
      );
    else if (open.outOfTime)
      parts.push(
        `try ${open.number} ran out of time${progress ? ` at ${progress}` : ""} and isn't submitted yet; it is submitted when they open it again`
      );
    else parts.push(`taking try ${open.number} now${progress ? `, ${progress}` : ""}`);
  }
  const c = cell.corrections;
  if (c) {
    parts.push(
      c.state === "approved"
        ? "corrections approved"
        : c.state === "submitted"
          ? "corrections sent in, waiting for you"
          : c.state === "returned"
            ? `corrections sent back (${c.done} of ${c.needed} done)`
            : `corrections ${correctionsProgress(c).label}`
    );
  }
  if (cell.score && !opts.hideScores) {
    const via =
      cell.score.basis === "corrections_to_threshold" || cell.score.basis === "corrections_to_full"
        ? " via fixes"
        : "";
    parts.push(`counts ${scoreText(cell)}${via}`);
  }
  // Quiz relearning (Jon, Oct 14 2026, R3): practice is what stands before the retake.
  const owed = cell.cycle === "relearning" ? practiceOwed(cell.quizPractice) : [];
  if (owed.length)
    parts.push(
      `needs ${PRACTICE_PASS_PERCENT}% on practice for ${targetList(
        owed.map((t) =>
          t.best !== null && !opts.hideScores ? `${t.code} (best ${pct(t.best)})` : t.code
        )
      )}`
    );
  if (cell.retakeBy && (cell.cycle === "retake_available" || cell.cycle === "awaiting_unlock"))
    parts.push(
      // Past it, the student asks for the retake (Jon, Oct 14 2026).
      cell.retakeWindowClosed
        ? `retake window ended ${fmt.date(cell.retakeBy)}`
        : `retake by ${fmt.time(cell.retakeBy)}`
    );
  // Ask to retake on a closed test (Jon, Oct 14 2026, R4): open for them alone until then; past
  // the cap's window on an open one, the approved retake may start until then.
  if (cell.reopenedUntil) parts.push(`reopened through ${fmt.date(cell.reopenedUntil)}`);
  if (cell.retakeOpenUntil) parts.push(`retake open through ${fmt.date(cell.retakeOpenUntil)}`);
  const text = parts.join("; ");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : "";
}
