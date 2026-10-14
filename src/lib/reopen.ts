/**
 * Ask to retake on a closed test (Jon, Oct 14 2026, decisions 1–2; docs/student-home-plan.md R4,
 * R5): the student asks, the teacher approves, and the test opens again for that one student
 * "through tomorrow", to the end of the next school day. Pure: when a reopen ends, and the close
 * a student actually has. No database, no clock of its own.
 */

/** Bloom's school time zone (the gradebook's and `startReasonText`'s times are written in it). */
export const SCHOOL_TIME_ZONE = "America/Chicago";

const DAY_MS = 86_400_000;

/** The calendar date `at` falls on in the school's time zone. */
function schoolDate(at: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: n("year"), m: n("month"), d: n("day") };
}

/** How far the school's wall clock is ahead of UTC at `at`, in ms (negative: Central is behind). */
function schoolOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * When an approved reopen ends (Jon, Oct 14 2026, decision 2: "Through tomorrow"): 11:59:59.999
 * PM America/Chicago on the next school day (Mon–Fri) after today's date there. Approved Monday
 * to Thursday, it runs to the end of the next day; Friday, Saturday or Sunday, to the end of
 * Monday. Holidays aren't known, so a long weekend's Monday counts.
 */
export function endOfNextSchoolDay(now: Date): Date {
  const today = schoolDate(now);
  // Calendar arithmetic on a UTC noon stand-in, so no daylight-saving edge can shift the date.
  let day = Date.UTC(today.y, today.m - 1, today.d, 12) + DAY_MS;
  while ([0, 6].includes(new Date(day).getUTCDay())) day += DAY_MS;
  const date = new Date(day);
  const wall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  );
  // The offset at that wall time; read twice so a guess on the wrong side of a change settles.
  const guess = wall - schoolOffset(new Date(wall));
  return new Date(wall - schoolOffset(new Date(guess)));
}

/**
 * Rule (R5): a student's close on an assignment is the later of the assignment's close and an
 * approved reopen (`attempt_unlocks.open_until`) for the attempt in play: the open one, or the
 * next one when none is open (finished attempts + 1). No close means always open, whatever the
 * reopen says. Every place that reads a student's close goes through this (the card, starting,
 * the attempt's deadline, the window-close pause, saving answers, asking to retake).
 */
export function effectiveClose(closesAt: Date | null, openUntil: Date | null): Date | null {
  if (!closesAt) return null;
  if (!openUntil) return closesAt;
  return openUntil.getTime() > closesAt.getTime() ? openUntil : closesAt;
}

/**
 * The test is open for this student only because the teacher approved a retake on it after it
 * closed (`effectiveClose` past the assignment's close, and not over yet). While it is, the cap's
 * retake window doesn't apply to that retake (decision 2: the teacher approved it).
 */
export function reopenedUntil(
  closesAt: Date | null,
  openUntil: Date | null,
  now: Date
): Date | null {
  if (!closesAt || !openUntil) return null;
  if (now.getTime() < closesAt.getTime() || now.getTime() >= openUntil.getTime()) return null;
  return openUntil;
}

/**
 * A retake the teacher approved with an end (`open_until`) that hasn't come yet: until then the
 * cap's retake window doesn't apply to it (decision 2: the teacher approved it), whether the
 * approval reopened a closed test (R4) or came after the window passed on a test still open (Jon,
 * Oct 14 2026: "Let them ask while it's still open too"). Null when there is none or it has ended.
 */
export function approvedUntil(openUntil: Date | null | undefined, now: Date): Date | null {
  return openUntil && now.getTime() < openUntil.getTime() ? openUntil : null;
}
