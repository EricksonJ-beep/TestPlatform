/**
 * The course switch for the relearning path (relearning revamp L1; plan "Teacher side": "New
 * relearning path from [date]"). Pure: what a picked date means and where a course stands. A quiz
 * or test is on the path when its attempt 1 finishes at or after the course's
 * `relearning_path_from` (`usesPathRules`), so the switch never reaches back: today means now
 * (attempts already in today keep the old rules, decision 26), a later day means its first moment
 * in the school's time zone, and a past day is refused.
 */
import { schoolDate, schoolOffset } from "@/lib/reopen";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** When a picked date ("2026-11-18") switches the course on, or why it can't. */
export function pathSwitchAt(date: string, now: Date): { at: Date } | { error: string } {
  const m = DAY.exec(date);
  if (!m) return { error: "Pick a date." };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return { error: "Pick a date." };
  const today = schoolDate(now);
  const key = (x: { y: number; m: number; d: number }) => x.y * 10_000 + x.m * 100 + x.d;
  const picked = key({ y, m: mo, d });
  if (picked < key(today))
    return {
      error:
        "Pick today or a later date. Tests already taken finish on the old rules, so the switch can't reach back.",
    };
  if (picked === key(today)) return { at: now };
  // Midnight that day on the school's clock.
  const wallMidnight = Date.UTC(y, mo - 1, d);
  return { at: new Date(wallMidnight - schoolOffset(new Date(wallMidnight))) };
}

export type PathSwitchState = "off" | "scheduled" | "on";

/** Off (null), scheduled (a later moment), or on (in effect). */
export function pathSwitchState(from: Date | null, now: Date): PathSwitchState {
  if (!from) return "off";
  return from.getTime() > now.getTime() ? "scheduled" : "on";
}
