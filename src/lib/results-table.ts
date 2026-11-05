/**
 * The Results table (Jon, Nov 5 2026: "Be able to sort the assessment on the result page,
 * possibly make the cards small or more in a table so they are organized and more compact";
 * "more minimalistic but informative"). One row per assignment; pure rules for what each column
 * shows and how a header sorts it. No database, no clock of its own.
 */
import type { AssignmentStatus } from "@/lib/assignments";
import { SCHOOL_TIME_ZONE } from "@/lib/reopen";

export type ResultsRow = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  className: string;
  period: string | null;
  unitName: string | null;
  /** The unit's place in its course (the teacher's shelf order); null with no unit. */
  unitOrder: number | null;
  status: AssignmentStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  enrolled: number;
  /** Students with a finished attempt. */
  submitted: number;
  /** Students with an attempt started but none finished. */
  inProgress: number;
  /** Class average of the counting score (enrolled students with one), as on the results page. */
  average: number | null;
  median: number | null;
  /** Students the average is over. */
  scored: number;
  /** Responses waiting for a manual grade. */
  toGrade: number;
  /** Correction sets waiting for approval. */
  corrections: number;
  /** Retake requests waiting (current or leftover, as on the Dashboard). */
  requests: number;
  /** Paused tests whose student asked to finish. */
  asks: number;
};

export const SORT_KEYS = [
  "title",
  "class",
  "unit",
  "status",
  "turnedIn",
  "average",
  "needs",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type Sort = { key: SortKey; dir: SortDir };

/** Needs-you first (Jon's work), then what is live, newest first. */
export const DEFAULT_SORT: Sort = { key: "needs", dir: "desc" };

/** A header's first click: words A→Z, numbers biggest first. */
export function firstDir(key: SortKey): SortDir {
  return key === "turnedIn" || key === "average" || key === "needs" ? "desc" : "asc";
}

/** Clicking a header: the same one flips; another starts at its first direction. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir(key) };
}

/** "needs:desc" ↔ Sort, for remembering the choice; anything unreadable is the default. */
export function serializeSort(s: Sort): string {
  return `${s.key}:${s.dir}`;
}
export function parseSort(raw: string | null | undefined): Sort {
  const [key, dir] = (raw ?? "").split(":");
  if ((SORT_KEYS as readonly string[]).includes(key) && (dir === "asc" || dir === "desc"))
    return { key: key as SortKey, dir };
  return DEFAULT_SORT;
}

/** Everything waiting on the teacher for this assignment. */
export function needsCount(r: ResultsRow): number {
  return r.toGrade + r.corrections + r.requests + r.asks;
}

/** "P3" from the class period ("3", "Period 3", "p3"); the class name when there is none. */
export function periodLabel(r: Pick<ResultsRow, "period" | "className">): string {
  const p = periodOnly(r);
  return p ? `P${p}` : r.className;
}

function periodOnly(r: Pick<ResultsRow, "period">): string | null {
  return r.period?.trim().replace(/^p(eriod)?\s*/i, "") || null;
}

const STATUS_RANK: Record<AssignmentStatus, number> = { open: 0, scheduled: 1, closed: 2 };

const time = (d: Date | null) => (d ? d.getTime() : null);

/**
 * Compare two possibly-missing values: missing (null) always sorts last, whichever way the
 * column points; otherwise `dir` flips the order.
 */
function cmp<T extends number | string>(a: T | null, b: T | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const d =
    typeof a === "string"
      ? a.localeCompare(b as string, "en", { numeric: true, sensitivity: "base" })
      : (a as number) - (b as number);
  return dir === "asc" ? d : -d;
}

/**
 * Status order (ascending): open (closing soonest first, no close date last), then scheduled
 * (opening soonest first), then closed (most recently closed first).
 */
function cmpStatus(a: ResultsRow, b: ResultsRow, dir: SortDir): number {
  const rank = cmp(STATUS_RANK[a.status], STATUS_RANK[b.status], dir);
  if (rank !== 0) return rank;
  // Within a status the date order follows the status, not the arrow, so it always reads sensibly.
  if (a.status === "open") return cmp(time(a.closesAt), time(b.closesAt), "asc");
  if (a.status === "scheduled") return cmp(time(a.opensAt), time(b.opensAt), "asc");
  return cmp(time(a.closesAt), time(b.closesAt), "desc");
}

/** The order rows fall back to on a tie: by status, then the newest assignment first. */
function cmpDefault(a: ResultsRow, b: ResultsRow): number {
  return cmpStatus(a, b, "asc") || cmp(a.createdAt.getTime(), b.createdAt.getTime(), "desc");
}

const turnedIn = (r: ResultsRow) => (r.enrolled > 0 ? r.submitted / r.enrolled : null);

function cmpKey(a: ResultsRow, b: ResultsRow, { key, dir }: Sort): number {
  switch (key) {
    case "title":
      return cmp(a.title, b.title, dir);
    case "class":
      // By period ("P2" before "P10"); a class with no period after them, by name.
      return cmp(periodOnly(a), periodOnly(b), dir) || cmp(a.className, b.className, dir);
    case "unit":
      return cmp(a.unitOrder, b.unitOrder, dir) || cmp(a.unitName, b.unitName, dir);
    case "status":
      return cmpStatus(a, b, dir);
    case "turnedIn":
      return cmp(turnedIn(a), turnedIn(b), dir) || cmp(a.submitted, b.submitted, dir);
    case "average":
      return cmp(a.average, b.average, dir);
    case "needs":
      return cmp(needsCount(a), needsCount(b), dir);
  }
}

/**
 * Sort by a column: missing values last in either direction, ties fall back to the default order
 * (status, newest first), then to the order given (stable). Returns a new array.
 */
export function sortResults<T extends ResultsRow>(rows: readonly T[], sort: Sort): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => cmpKey(x.r, y.r, sort) || cmpDefault(x.r, y.r) || x.i - y.i)
    .map((x) => x.r);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: SCHOOL_TIME_ZONE });
const longDate = (d: Date) =>
  d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SCHOOL_TIME_ZONE,
  });

/**
 * The status cell: a short label ("2d left", "opens Nov 14", "closed Oct 30") and the full
 * words for its tooltip. `soon` marks an open test closing within a day.
 */
export function statusText(
  r: Pick<ResultsRow, "status" | "opensAt" | "closesAt">,
  now: Date
): { short: string; long: string; soon: boolean } {
  if (r.status === "scheduled" && r.opensAt)
    return {
      short: `opens ${shortDate(r.opensAt)}`,
      long: `Opens ${longDate(r.opensAt)}`,
      soon: false,
    };
  if (r.status === "closed" && r.closesAt)
    return {
      short: `closed ${shortDate(r.closesAt)}`,
      long: `Closed ${longDate(r.closesAt)}`,
      soon: false,
    };
  if (r.status === "open" && r.closesAt) {
    const left = r.closesAt.getTime() - now.getTime();
    const short =
      left < HOUR
        ? `${Math.max(1, Math.round(left / 60_000))}m left`
        : left < DAY
          ? `${Math.round(left / HOUR)}h left`
          : left < 7 * DAY
            ? `${Math.round(left / DAY)}d left`
            : `to ${shortDate(r.closesAt)}`;
    return { short, long: `Open · closes ${longDate(r.closesAt)}`, soon: left < DAY };
  }
  return { short: "open", long: "Open · no close date", soon: false };
}
