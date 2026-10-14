/**
 * Live Dashboard (Jon, Oct 13 2026, dashboard plan build step 5). Pure rules for the version
 * stamp the Dashboard polls and for when it polls:
 *
 * - The stamp is built from coarse signals only (an attempt starting, submitting, pausing, being
 *   asked about or reopened; corrections, unlocks, final scores, activity check-offs, the newest
 *   log row). Never `attempts.updated_at` or `last_active_at` as values: those move on every
 *   heartbeat and every answer save, and the whole page would reload every few seconds while a
 *   class tests (research notes, Design 2).
 * - Two things change with the clock alone, so the stamp works them out in code: which open tests
 *   are paused right now (`currentPause`, an idle test pauses with no write), and, while someone
 *   in the class is actually testing, the minute, so "18 min left" and answered counts stay
 *   current with at most one reload a minute.
 * - The page polls every 15 s while its tab is visible, and stops after 45 minutes without the
 *   teacher touching it (a click, a key, a scroll, or coming back to the tab starts it again).
 */
import { currentPause, IDLE_PAUSE_MS, outOfTime } from "@/lib/pause";

export const POLL_MS = 15_000;
export const LIVE_IDLE_MS = 45 * 60_000;

/** A short, stable fingerprint of the stamp's parts (FNV-1a); equal parts give an equal stamp. */
export function stampOf(parts: (string | number | null | undefined)[]): string {
  const text = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}.${text.length.toString(36)}`;
}

export type OpenAttemptLite = {
  id: string;
  status: string;
  startedAt: Date;
  dueAt: Date | null;
  pausedAt: Date | null;
  pauseReason: string | null;
  lastActiveAt: Date | null;
  closesAt: Date | null;
};

/**
 * Rule: someone is testing right now when an open test is not paused (stored or worked out), its
 * deadline hasn't passed, and its last sign of work (or its start) is under 10 minutes old. A
 * test left open past its time, or one from before activity stamps, never keeps the tick going.
 */
export function testingNow(rows: OpenAttemptLite[], now: Date): boolean {
  return rows.some(
    (r) =>
      r.status === "in_progress" &&
      !currentPause(r, r.closesAt, now) &&
      !outOfTime(r, r.closesAt, now) &&
      now.getTime() - (r.lastActiveAt ?? r.startedAt).getTime() < IDLE_PAUSE_MS
  );
}

/**
 * The class's open tests as the stamp sees them: each one paused or not (so an idle pause shows up
 * without anyone writing it), plus the minute while someone is testing.
 */
export function openTestsPart(rows: OpenAttemptLite[], now: Date): string {
  const each = rows
    .filter((r) => r.status === "in_progress")
    .map((r) => `${r.id}:${currentPause(r, r.closesAt, now) ? "p" : "t"}`)
    .sort();
  const tick = testingNow(rows, now) ? `m${Math.floor(now.getTime() / 60_000)}` : "";
  return [...each, tick].join(",");
}

/** What the Live indicator shows. Only "live" polls. */
export type LiveState = "live" | "off" | "idle" | "hidden";

/**
 * Rule: polling runs only while the teacher has it on, the tab is visible, and they have touched
 * the page in the last 45 minutes.
 */
export function liveState(input: {
  on: boolean;
  visible: boolean;
  lastUseAt: number;
  now: number;
}): LiveState {
  if (!input.on) return "off";
  if (input.now - input.lastUseAt >= LIVE_IDLE_MS) return "idle";
  if (!input.visible) return "hidden";
  return "live";
}
