/**
 * The teacher home (home pages redesign, BLOOM_HOME_REDESIGN.md §3–4). Pure rules on top of the
 * class gradebook read (`getClassGradebook`) and `rightNow`: which mode the page is in, the live
 * panel's figures and tiles, the quiet mode's cards, and how a gradebook cell is drawn. No
 * database and no clock of its own: the loader's `generatedAt` is "now".
 */
import type { CellTag } from "@/lib/class-gradebook";
import { timeLeft, type GradebookViewRow, type LiveRow } from "@/lib/gradebook-view";
import type {
  ClassGradebook,
  ClassGradebookCell,
  ClassGradebookColumn,
} from "@/lib/queries/class-gradebook";

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Rule (§3.1): before 12:00 morning, 12:00 to 16:59 afternoon, after that evening. */
export function greetingFor(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** A class period's words (§3.1): "3rd hour" for period 3; the class name without a number. */
export function hourLabel(c: { name: string; period: string | null }): string {
  const digits = /\d+/.exec(c.period ?? "")?.[0];
  if (digits) return `${ordinal(Number(digits))} hour`;
  return c.period?.trim() || c.name;
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** A count as the quiet panel's heading says it (§3.4): words for 1 to 9, digits above. */
export function countWord(n: number): string {
  return n >= 0 && n <= 9 ? WORDS[n] : String(n);
}

/** "Braeden A": the first name and the last initial. */
export function firstAndInitial(s: { firstName: string; lastName: string }): string {
  return s.lastName ? `${s.firstName} ${s.lastName[0]}` : s.firstName;
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export type HomeMode = "live" | "quiet";

/**
 * Rule (§3.2): live when at least one student of the selected class has an attempt in progress
 * or paused (the same rows as the old "Testing N" / "Paused N" strip, `rightNow`); quiet otherwise.
 */
export function homeMode(live: { testing: unknown[]; paused: unknown[] }): HomeMode {
  return live.testing.length + live.paused.length > 0 ? "live" : "quiet";
}

// ---------------------------------------------------------------------------
// The live panel
// ---------------------------------------------------------------------------

export type LiveTile = {
  row: LiveRow;
  /** The second line: "of 25 answered", or what sets this student apart from the room. */
  line: string;
};

export type LiveSummary = {
  /** The assessment with the most students in progress (testing or paused). */
  assignmentId: string;
  title: string;
  closesAt: Date | null;
  /** How long most of the room has: the most common time left among the heading test's testers. */
  roomLeft: string | null;
  testing: number;
  paused: number;
  /** Students of the class who have turned in the heading test, and the roster size. */
  turnedIn: number;
  roster: number;
  /** One per attempt being taken now, most answered first. */
  tiles: LiveTile[];
};

const fraction = (r: LiveRow) => (r.total > 0 ? r.answered / r.total : 0);

/** The value most rows share; the earliest of them on a tie. */
function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  for (const v of values) {
    if (v === null) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (best === null || n > counts.get(best)!) best = v;
  }
  return best;
}

/**
 * Rule (§3.3): the heading is the assessment with the most students in progress (testing or
 * paused; newest column on a tie). The three figures count every open attempt in the class, as
 * the old strip did. Each tile reads "of N answered"; a student whose time left differs from the
 * room's reads "of N, 2 h 34 min left", and one on a different assessment reads that test's title
 * and their time left. Null when nobody is testing or paused.
 */
export function liveSummary(
  gb: ClassGradebook,
  live: { testing: LiveRow[]; paused: LiveRow[] }
): LiveSummary | null {
  const open = [...live.testing, ...live.paused];
  if (open.length === 0) return null;
  const per = new Map<string, number>();
  for (const r of open) per.set(r.assignmentId, (per.get(r.assignmentId) ?? 0) + 1);
  const order = new Map(gb.columns.map((c, i) => [c.assignmentId, i]));
  const headId = [...per.keys()].sort(
    (a, b) => per.get(b)! - per.get(a)! || (order.get(a) ?? 0) - (order.get(b) ?? 0)
  )[0];
  const i = order.get(headId) ?? -1;
  const column = gb.columns[i];
  const now = gb.generatedAt;
  const roomLeft = mostCommon(
    live.testing.filter((r) => r.assignmentId === headId).map((r) => timeLeft(r.dueAt, now))
  );
  const tiles = [...live.testing]
    .sort(
      (a, b) =>
        fraction(b) - fraction(a) ||
        a.student.lastName.localeCompare(b.student.lastName) ||
        a.student.firstName.localeCompare(b.student.firstName)
    )
    .map((row) => {
      const left = timeLeft(row.dueAt, now);
      const line =
        row.assignmentId !== headId
          ? [row.title, left].filter(Boolean).join(", ")
          : left && left !== roomLeft
            ? `of ${row.total}, ${left}`
            : `of ${row.total} answered`;
      return { row, line };
    });
  return {
    assignmentId: headId,
    title: column?.title ?? open[0].title,
    closesAt: column?.closesAt ?? null,
    roomLeft,
    testing: live.testing.length,
    paused: live.paused.length,
    turnedIn:
      i >= 0
        ? gb.rows.filter((r) => r.cells[i].attempts.some((a) => a.status !== "in_progress")).length
        : 0,
    roster: gb.students.length,
    tiles,
  };
}

// ---------------------------------------------------------------------------
// Quiet mode
// ---------------------------------------------------------------------------

export type UpNext = {
  assignmentId: string;
  title: string;
  status: "open" | "scheduled";
  opensAt: Date | null;
  closesAt: Date | null;
  turnedIn: number;
  roster: number;
};

/**
 * Rule (§3.4, "Up next"): the class's open test that closes soonest (one with no close last);
 * with none open, the scheduled one that opens soonest. Practice is left out. Null when nothing
 * is open or scheduled, and the card is omitted.
 */
export function upNext(gb: ClassGradebook): UpNext | null {
  const at = (d: Date | null) => d?.getTime() ?? Number.POSITIVE_INFINITY;
  const real = gb.columns.map((c, i) => ({ c, i })).filter((x) => x.c.type !== "practice");
  const open = real
    .filter((x) => x.c.status === "open")
    .sort((a, b) => at(a.c.closesAt) - at(b.c.closesAt));
  const soon = real
    .filter((x) => x.c.status === "scheduled")
    .sort((a, b) => at(a.c.opensAt) - at(b.c.opensAt));
  const pick = open[0] ?? soon[0];
  if (!pick) return null;
  return {
    assignmentId: pick.c.assignmentId,
    title: pick.c.title,
    status: pick.c.status === "open" ? "open" : "scheduled",
    opensAt: pick.c.opensAt,
    closesAt: pick.c.closesAt,
    turnedIn: gb.rows.filter((r) =>
      r.cells[pick.i].attempts.some((a) => a.status !== "in_progress")
    ).length,
    roster: gb.students.length,
  };
}

export type MostToDo = {
  top: { student: GradebookViewRow["student"]; count: number }[];
  /** The next tier in one line: "Five more students owe 4 each."; null when there is none. */
  more: string | null;
};

/**
 * Rule (§3.4, "Most to do"): the three students with the highest count (the number in the
 * gradebook's pill; the roster's order on a tie), then one line for the next tier: the students
 * who share the next-highest count. Null when nobody owes anything, and the card is omitted.
 */
export function mostToDo(rows: Pick<GradebookViewRow, "student" | "toDo">[]): MostToDo | null {
  const owing = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.toDo > 0)
    .sort((a, b) => b.r.toDo - a.r.toDo || a.i - b.i)
    .map((x) => x.r);
  if (owing.length === 0) return null;
  const rest = owing.slice(3);
  const tier = rest.length ? rest.filter((r) => r.toDo === rest[0].toDo) : [];
  const n = tier.length;
  return {
    top: owing.slice(0, 3).map((r) => ({ student: r.student, count: r.toDo })),
    more:
      n === 0
        ? null
        : n === 1
          ? `One more student owes ${tier[0].toDo}.`
          : `${countWord(n)} more students owe ${tier[0].toDo} each.`,
  };
}

// ---------------------------------------------------------------------------
// Column labels and unit groups
// ---------------------------------------------------------------------------

/** Title words that say what kind of assessment it is, most specific first. */
const KIND_WORDS: [RegExp, string][] = [
  [/\blab practical\b/i, "Lab practical"],
  [/\blab quiz\b/i, "Lab quiz"],
  [/\bretake test\b/i, "Retake test"],
  [/\bpractice test\b/i, "Practice test"],
  [/\bexam\b/i, "Exam"],
  [/\btest\b/i, "Test"],
  [/\bquiz\b/i, "Quiz"],
  [/\bpractice\b/i, "Practice"],
];
const TYPE_WORD: Record<ClassGradebookColumn["type"], string> = {
  formative: "Quiz",
  summative: "Test",
  practice: "Practice",
};

type LabelColumn = Pick<ClassGradebookColumn, "title" | "type" | "unit">;

/**
 * Rule (§4, column labels): under its unit a column reads by kind, "Quiz", "Quiz 2", "Test": the
 * kind word from the title (else the type's), numbered within the unit from the oldest, which
 * keeps the plain word. Columns come newest first. The full title stays on hover.
 */
export function kindLabels(columns: LabelColumn[]): string[] {
  const labels = columns.map(
    (c) => KIND_WORDS.find(([re]) => re.test(c.title))?.[1] ?? TYPE_WORD[c.type]
  );
  const seen = new Map<string, number>();
  for (let i = columns.length - 1; i >= 0; i--) {
    const key = `${columns[i].unit?.id ?? ""}|${labels[i]}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) labels[i] = `${labels[i]} ${n}`;
  }
  return labels;
}

export type UnitGroup = {
  unitId: string | null;
  name: string;
  rows: {
    assignmentId: string;
    title: string;
    label: string;
    average: number | null;
    done: number;
    enrolled: number;
  }[];
};

/**
 * Rule (§3.4, "Where the period stands"): the shown columns grouped by unit, newest unit first
 * (the columns' own order), each with its assessments oldest first and the class average the
 * gradebook's class row shows (`footer.average`). A test nobody has turned in yet is left out.
 */
export function unitGroups(
  columns: (LabelColumn & Pick<ClassGradebookColumn, "assignmentId" | "footer">)[]
): UnitGroup[] {
  const labels = kindLabels(columns);
  const groups = new Map<string, UnitGroup>();
  columns.forEach((c, i) => {
    if (c.footer.done === 0) return;
    const key = c.unit?.id ?? "";
    const g = groups.get(key) ?? {
      unitId: c.unit?.id ?? null,
      name: c.unit?.name ?? "No unit",
      rows: [],
    };
    groups.set(key, g);
    g.rows.unshift({
      assignmentId: c.assignmentId,
      title: c.title,
      label: labels[i],
      average: c.footer.average,
      done: c.footer.done,
      enrolled: c.footer.enrolled,
    });
  });
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// One gradebook cell
// ---------------------------------------------------------------------------

/** How a cell is drawn (§4, the cells table). Every state in the old key has its own look. */
export type CellLook =
  | "done"
  | "owes"
  | "testing"
  | "paused"
  | "missing"
  | "your_move"
  | "your_ok"
  | "not_started"
  | "empty";

/**
 * Rule (§4): testing now, paused and missing by their tag; not started is a dash; a test not open
 * yet is empty; the teacher's moves (asked to finish included) are "your move"; an optional OK is
 * outlined; what the student owes is filled; quiet and done are plain numbers. A retake state on
 * a closed test (it can't be taken) is plain too, as it was grey before.
 */
export function cellLook(tag: Pick<CellTag, "kind" | "group" | "closed">): CellLook {
  switch (tag.kind) {
    case "taking":
      return "testing";
    case "paused":
      return "paused";
    case "missing":
      return "missing";
    case "not_started":
      return "not_started";
    case "opens":
      return "empty";
  }
  if (tag.closed) return "done";
  if (tag.group === "your_move") return "your_move";
  if (tag.group === "your_ok") return "your_ok";
  if (tag.group === "owes") return "owes";
  return "done";
}

/**
 * What a cell shows (§4): answered of served while testing, "Paused", "Missing", an en dash for
 * not started, else the counting score as a whole number. With "Hide scores" on, the fill stays
 * and the number becomes a dot. A cell with no score yet says what it waits on in a word.
 */
export function cellText(
  cell: Pick<ClassGradebookCell, "tag" | "score">,
  opts: { hideScores: boolean }
): { text: string; dot: boolean; small: boolean } {
  const t = cell.tag;
  const word = (text: string) => ({ text, dot: false, small: true });
  switch (cellLook(t)) {
    case "testing":
      return {
        text: t.progress ? `${t.progress.answered}/${t.progress.total}` : "Testing",
        dot: false,
        small: !t.progress,
      };
    case "paused":
      return word("Paused");
    case "missing":
      return word("Missing");
    case "not_started":
      return { text: "–", dot: false, small: false };
    case "empty":
      return { text: "", dot: false, small: false };
  }
  if (cell.score)
    return opts.hideScores
      ? { text: "", dot: true, small: false }
      : { text: String(Math.round(cell.score.percent)), dot: false, small: false };
  if (t.kind === "asked") return word("Asked");
  if (t.kind === "to_grade") return word("Grade");
  if (t.kind === "out_of_time") return word("Time up");
  return { text: "", dot: true, small: false };
}
