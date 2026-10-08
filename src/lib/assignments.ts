/**
 * Pure assignment rules (PLAN.md §2, §3.6): window status, whether a student may
 * start an attempt, the attempt deadline with accommodations, and defaults by
 * assessment type. No database, no clock of its own: every function takes `now`.
 */

export type AssignmentStatus = "scheduled" | "open" | "closed";

export type WindowLike = { opensAt: Date | null; closesAt: Date | null };

/** Scheduled before the window opens, closed once it has passed, open otherwise (no bounds = always open). */
export function assignmentStatus(a: WindowLike, now: Date = new Date()): AssignmentStatus {
  if (a.opensAt && now < a.opensAt) return "scheduled";
  if (a.closesAt && now >= a.closesAt) return "closed";
  return "open";
}

export type StartCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_open"
        | "closed"
        | "code_required"
        | "code_wrong"
        | "no_attempts_left"
        | "wait"
        | "needs_unlock"
        | "window_closed";
      /** For "wait": when the next attempt opens. */
      availableAt?: Date;
      /** For "window_closed": when retakes stopped being allowed. */
      closedAt?: Date;
    };

/**
 * Rule: a student may start an attempt only inside the window, with the access
 * code when one is set, while attempts remain (null = unlimited), after any
 * waiting period, and, when the assignment says retakes need the teacher's OK,
 * once the teacher has unlocked that attempt number (attempt 1 never needs one).
 */
export function canStartAttempt(input: {
  assignment: WindowLike & {
    accessCode: string | null;
    attemptsAllowed: number | null;
    /** Hours to wait after a submission before the next attempt (0 or undefined = none). */
    retakeWaitHours?: number;
    /** Every attempt after the first needs a teacher unlock (Jon, Oct 1 2026). */
    retakesNeedUnlock?: boolean;
    /** Retakes must start within this many days of the first attempt (corrections cap); null/0 = no limit. */
    retakeWindowDays?: number | null;
  };
  attemptsUsed: number;
  /** When the student's most recent finished attempt was submitted. */
  lastSubmittedAt?: Date | null;
  /** When the student's first finished attempt was submitted (the retake window counts from it). */
  firstSubmittedAt?: Date | null;
  /** Highest attempt number the teacher has unlocked for this student (0 = none). */
  unlockedThrough?: number;
  accessCode?: string | null;
  now?: Date;
}): StartCheck {
  const { assignment, attemptsUsed } = input;
  const now = input.now ?? new Date();
  const status = assignmentStatus(assignment, now);
  if (status === "scheduled") return { ok: false, reason: "not_open" };
  if (status === "closed") return { ok: false, reason: "closed" };
  if (assignment.accessCode) {
    const given = (input.accessCode ?? "").trim();
    if (!given) return { ok: false, reason: "code_required" };
    if (!codesMatch(given, assignment.accessCode)) return { ok: false, reason: "code_wrong" };
  }
  if (assignment.attemptsAllowed !== null && attemptsUsed >= assignment.attemptsAllowed) {
    return { ok: false, reason: "no_attempts_left" };
  }
  const wait = assignment.retakeWaitHours ?? 0;
  if (wait > 0 && input.lastSubmittedAt) {
    const availableAt = new Date(input.lastSubmittedAt.getTime() + wait * 3_600_000);
    if (now < availableAt) return { ok: false, reason: "wait", availableAt };
  }
  if (assignment.retakesNeedUnlock && needsUnlock(attemptsUsed, input.unlockedThrough ?? 0)) {
    return { ok: false, reason: "needs_unlock" };
  }
  const closedAt = retakeWindowEnd(assignment.retakeWindowDays, input.firstSubmittedAt);
  if (attemptsUsed > 0 && closedAt && now >= closedAt) {
    return { ok: false, reason: "window_closed", closedAt };
  }
  return { ok: true };
}

/** When the retake window shuts: first submission + the window; null when there is no window yet. */
export function retakeWindowEnd(
  retakeWindowDays: number | null | undefined,
  firstSubmittedAt: Date | null | undefined
): Date | null {
  if (!retakeWindowDays || !firstSubmittedAt) return null;
  return new Date(firstSubmittedAt.getTime() + retakeWindowDays * 86_400_000);
}

/** The next attempt (used + 1) needs an unlock unless it is the first or the teacher already unlocked it. */
export function needsUnlock(attemptsUsed: number, unlockedThrough: number): boolean {
  return attemptsUsed > 0 && unlockedThrough < attemptsUsed + 1;
}

/** Human text for a refused start, including when a waiting period ends. */
export function startReasonText(check: Exclude<StartCheck, { ok: true }>): string {
  const fmt = (d: Date) =>
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });
  if (check.reason === "wait" && check.availableAt) {
    return `Your next attempt opens ${fmt(check.availableAt)}.`;
  }
  if (check.reason === "window_closed" && check.closedAt) {
    return `Retakes on this quiz closed ${fmt(check.closedAt)}.`;
  }
  return START_REASON_TEXT[check.reason];
}

/** When the next attempt may start under the wait rule; null when no wait applies. */
export function nextAttemptAt(retakeWaitHours: number, lastSubmittedAt: Date | null): Date | null {
  if (!retakeWaitHours || !lastSubmittedAt) return null;
  return new Date(lastSubmittedAt.getTime() + retakeWaitHours * 3_600_000);
}

export const START_REASON_TEXT: Record<Exclude<StartCheck, { ok: true }>["reason"], string> = {
  not_open: "This assignment isn't open yet.",
  closed: "This assignment has closed.",
  code_required: "Enter the access code from your teacher.",
  code_wrong: "That access code isn't right.",
  no_attempts_left: "You've used every attempt.",
  wait: "You have to wait before your next attempt.",
  needs_unlock: "Your teacher opens each retake. Ask them to unlock your next attempt.",
  window_closed: "The retake window for this quiz has closed.",
};

/** Codes are compared case-insensitively, ignoring spaces and dashes. */
export function codesMatch(given: string, expected: string): boolean {
  const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
  return norm(given) === norm(expected);
}

/**
 * When the attempt must be in by: start + time limit scaled by the student's
 * extra-time accommodation, but never past the assignment's close. No limit and
 * no close means no deadline.
 */
export function attemptDueAt(input: {
  startedAt: Date;
  timeLimitMinutes: number | null;
  extraTimePercent: number;
  closesAt: Date | null;
}): Date | null {
  const { startedAt, timeLimitMinutes, extraTimePercent, closesAt } = input;
  let due: Date | null = null;
  if (timeLimitMinutes && timeLimitMinutes > 0) {
    const minutes = timeLimitMinutes * (1 + Math.max(0, extraTimePercent) / 100);
    due = new Date(startedAt.getTime() + Math.round(minutes * 60_000));
  }
  if (closesAt && (!due || closesAt < due)) due = closesAt;
  return due;
}

/** Attempt defaults: practice unlimited, formative 3, summative 1 (Jon, Sept 28 2026; PLAN.md §2 said 1 + 1 retake). */
export function defaultAttempts(type: "practice" | "formative" | "summative"): number | null {
  return type === "practice" ? null : type === "formative" ? 3 : 1;
}

/**
 * Parse a browser `datetime-local` value ("2026-09-22T08:00") using the browser's
 * UTC offset in minutes (from `Date.prototype.getTimezoneOffset`), so the wall
 * time the teacher typed is the wall time students get.
 */
export function parseLocalDateTime(value: string, tzOffsetMinutes: number): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const date = new Date(utc + tzOffsetMinutes * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The reverse: a Date as a `datetime-local` string in the given offset, for edit forms. */
export function toLocalDateTimeValue(date: Date, tzOffsetMinutes: number): string {
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** Six characters students can read off a projector without ambiguity. */
export function generateAccessCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}
