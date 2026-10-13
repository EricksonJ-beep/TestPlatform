/**
 * Finish later (Jon, Oct 13 2026: "students run out of time in class or during
 * Seminar and need to continue at a later time. I still want the testing to
 * take place in my room"). Pure rules for pausing and resuming an attempt:
 *
 * - A test pauses when the student clicks Finish later, after 10 minutes with
 *   no sign of work, or when its window closes while it is still open.
 * - While paused the questions stay hidden and the clock is stopped; every
 *   question already answered is locked for good.
 * - It reopens with the teacher's resume code (good for one class period) or
 *   the teacher's OK.
 */

export const IDLE_PAUSE_MS = 10 * 60_000;
export const RESUME_CODE_MS = 50 * 60_000;

export type PauseReason = "student" | "idle" | "closed";

export const PAUSE_REASON_TEXT: Record<PauseReason, string> = {
  student: "You chose Finish later.",
  idle: "It paused after 10 minutes without any work.",
  closed: "It paused when the test window closed.",
};

type Pausable = {
  status: string;
  startedAt: Date;
  dueAt: Date | null;
  pausedAt: Date | null;
  lastActiveAt: Date | null;
};

/**
 * Whether an open attempt should already be paused, and from when. Rules:
 * - idle: 10 minutes after the last sign of work (a save or the test page's
 *   heartbeat). An attempt with no recorded activity yet (started before this
 *   feature) is never idle-paused until it is touched.
 * - closed: the window closed while the student was still in the test (their
 *   last work was before the close). A student let back in after the close is
 *   not paused again for it.
 * The earlier of the two wins, once its moment has passed. A time limit that
 * runs out first is not a pause: that attempt is out of time and is submitted.
 * The deadline is capped at the window's close, so a deadline that equals the
 * close is the window closing, not the time limit.
 */
export function pausePoint(
  a: Pausable,
  closesAt: Date | null,
  now: Date
): { at: Date; reason: PauseReason } | null {
  if (a.status !== "in_progress" || a.pausedAt) return null;
  const candidates: { at: Date; reason: PauseReason }[] = [];
  if (a.lastActiveAt)
    candidates.push({ at: new Date(a.lastActiveAt.getTime() + IDLE_PAUSE_MS), reason: "idle" });
  const seen = a.lastActiveAt ?? a.startedAt;
  if (closesAt && seen.getTime() < closesAt.getTime())
    candidates.push({ at: closesAt, reason: "closed" });
  const due = candidates
    .filter((c) => c.at.getTime() <= now.getTime())
    .sort((x, y) => x.at.getTime() - y.at.getTime())[0];
  if (!due) return null;
  if (a.dueAt) {
    // A deadline equal to the close is the window closing (deadlines are capped at it).
    const isClose = due.reason === "closed" && sameMoment(a.dueAt, due.at);
    if (!isClose && a.dueAt.getTime() <= due.at.getTime()) return null;
  }
  return due;
}

/**
 * The time-limit minutes still owed when a test pauses because its window
 * closed. The stored deadline was capped at the close, so the time limit is
 * worked out again from the start (with the student's extra time). No time
 * limit means no clock after the pause.
 */
export function remainingAtClose(input: {
  startedAt: Date;
  timeLimitMinutes: number | null;
  extraTimePercent: number;
  closesAt: Date;
}): number | null {
  const { startedAt, timeLimitMinutes, extraTimePercent, closesAt } = input;
  if (!timeLimitMinutes || timeLimitMinutes <= 0) return null;
  const minutes = timeLimitMinutes * (1 + Math.max(0, extraTimePercent) / 100);
  const limitDue = startedAt.getTime() + Math.round(minutes * 60_000);
  return Math.max(0, limitDue - closesAt.getTime());
}

/** Two stored moments that are the same instant (database round trips can shift sub-second digits). */
export function sameMoment(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}

/** The time left on the clock at the pause; null when the test has no time limit. */
export function remainingAt(dueAt: Date | null, at: Date): number | null {
  return dueAt ? Math.max(0, dueAt.getTime() - at.getTime()) : null;
}

/** The new deadline when a paused attempt reopens: the time that was left, from now. */
export function resumedDueAt(remainingMs: number | null, now: Date): Date | null {
  return remainingMs === null ? null : new Date(now.getTime() + remainingMs);
}

/** Locked answers only grow: the ones locked before plus everything answered now. */
export function lockAnswered(locked: string[], answeredIds: string[]): string[] {
  return [...new Set([...locked, ...answeredIds])];
}
