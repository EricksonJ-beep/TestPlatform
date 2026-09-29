/**
 * Live tier board and relearning monitor rules (PLAN.md §3.11, Ticket 1.15).
 * Pure: which relearning stage a student is in, whether they moved up, the
 * per-target readiness state and line, and the class's most-missed target.
 * Tiers themselves come from `tierFor` in the grading library.
 */
import type { CorrectionsSummary } from "@/lib/corrections";
import type { GateFlags, RetakePlan } from "@/lib/retakes";

export type RelearningStage =
  | "not_started"
  | "attempt_1_in_progress"
  | "proficient"
  | "corrections_not_started"
  | "corrections_in_progress"
  | "corrections_submitted"
  | "corrections_returned"
  | "relearning"
  | "retake_ready"
  | "retake_in_progress"
  | "retake_done"
  | "no_attempts_left";

export type StageInput = {
  tier: 1 | 2 | 3 | null;
  attemptsFinished: number;
  inProgress: boolean;
  corrections: Pick<CorrectionsSummary, "state" | "done" | "needed"> | null;
  plan: Pick<RetakePlan, "selected" | "locked" | "canStart" | "blocker"> | null;
};

/**
 * Rule (PLAN.md §3.11): attempt 1 done → corrections not started → corrections
 * in progress (n of m) → corrections submitted (awaiting approval) → relearning
 * (activity/practice gates) → retake ready → retake in progress → retake done.
 */
export function relearningStage(i: StageInput): RelearningStage {
  if (i.attemptsFinished === 0) return i.inProgress ? "attempt_1_in_progress" : "not_started";
  if (i.inProgress) return "retake_in_progress";
  if (i.tier === 1) return i.attemptsFinished > 1 ? "retake_done" : "proficient";
  const c = i.corrections;
  if (c && c.state === "needed")
    return c.done > 0 ? "corrections_in_progress" : "corrections_not_started";
  if (c && c.state === "submitted") return "corrections_submitted";
  if (c && c.state === "returned") return "corrections_returned";
  const p = i.plan;
  if (!p) return "proficient";
  if (p.blocker === "no_attempts") return "no_attempts_left";
  if (p.locked.length > 0) return "relearning";
  if (p.canStart) return "retake_ready";
  return "relearning";
}

export function stageLabel(
  stage: RelearningStage,
  corrections: Pick<CorrectionsSummary, "done" | "needed"> | null,
  reviewMode: "auto" | "teacher_approved"
): string {
  switch (stage) {
    case "not_started":
      return "Not started";
    case "attempt_1_in_progress":
      return "Attempt 1 in progress";
    case "proficient":
      return "Proficient";
    case "corrections_not_started":
      return `Corrections not started (0 of ${corrections?.needed ?? 0})`;
    case "corrections_in_progress":
      return `Corrections in progress (${corrections?.done ?? 0} of ${corrections?.needed ?? 0})`;
    case "corrections_submitted":
      return reviewMode === "teacher_approved"
        ? "Corrections submitted · awaiting approval"
        : "Corrections submitted";
    case "corrections_returned":
      return "Corrections returned";
    case "relearning":
      return "Relearning (activity / practice)";
    case "retake_ready":
      return "Retake ready";
    case "retake_in_progress":
      return "Retake in progress";
    case "retake_done":
      return "Retake done";
    case "no_attempts_left":
      return "No attempts left";
  }
}

/** Stages that still wait on the student, for the readiness sort. */
export const STAGE_ORDER: RelearningStage[] = [
  "corrections_not_started",
  "corrections_returned",
  "corrections_in_progress",
  "relearning",
  "corrections_submitted",
  "retake_ready",
  "retake_in_progress",
  "attempt_1_in_progress",
  "not_started",
  "no_attempts_left",
  "retake_done",
  "proficient",
];

export function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday 00:00 local. */
export function startOfWeek(now = new Date()): Date {
  const d = startOfToday(now);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

export type TierMove = {
  tier: number | null;
  previousTier: number | null;
  tierChangedAt: Date | null;
};

/** True when the last tier change was an improvement on or after `since`. */
export function movedUp(m: TierMove, since: Date): boolean {
  return (
    m.tier !== null &&
    m.previousTier !== null &&
    m.tier < m.previousTier &&
    m.tierChangedAt !== null &&
    m.tierChangedAt.getTime() >= since.getTime()
  );
}

export type ReadinessState = "proficient" | "ready" | "not_ready" | "retaken";

export type TargetReadiness = {
  id: string;
  code: string;
  percent: number;
  required: boolean;
  optedIn: boolean;
  gate: GateFlags & { unlocked: boolean };
  /** The best score came from a retake attempt. */
  retaken: boolean;
  correctionsDetail?: string | null;
  activityDetail?: string | null;
  practiceDetail?: string | null;
};

export function readinessState(t: TargetReadiness): ReadinessState {
  if (!t.required && !t.optedIn) return t.retaken ? "retaken" : "proficient";
  return t.gate.unlocked ? "ready" : "not_ready";
}

/** "LT4: corrections ✓ · activity ✓ (watched blood-flow video) · practice ✓ (best 85%) · retake unlocked" */
export function readinessLine(t: TargetReadiness): string {
  const mark = (ok: boolean, detail?: string | null) =>
    `${ok ? "✓" : "✗"}${detail ? ` (${detail})` : ""}`;
  const state = readinessState(t);
  if (state === "proficient") return `${t.code}: proficient (${Math.round(t.percent)}%)`;
  if (state === "retaken") return `${t.code}: retaken, now ${Math.round(t.percent)}%`;
  return [
    `${t.code}: corrections ${mark(t.gate.correctionsOk, t.correctionsDetail)}`,
    `activity ${mark(t.gate.activityOk, t.activityDetail)}`,
    `practice ${mark(t.gate.practiceOk, t.practiceDetail)}`,
    t.gate.unlocked ? "retake unlocked" : "retake locked",
  ].join(" · ");
}

/** Lower = call up first: most not-ready targets, then stage order. */
export function readinessSortKey(readiness: ReadinessState[], stage: RelearningStage): number {
  const notReady = readiness.filter((r) => r === "not_ready").length;
  const ready = readiness.filter((r) => r === "ready").length;
  return -(notReady * 100 + ready * 10) + STAGE_ORDER.indexOf(stage) / 100;
}

/** The target the most students sit below the threshold on; ties go to the lowest average. */
export function mostMissedTarget(
  finals: Record<string, { percent: number }>[],
  threshold: number
): { id: string; below: number; average: number } | null {
  const acc = new Map<string, { below: number; sum: number; n: number }>();
  for (const f of finals)
    for (const [id, t] of Object.entries(f)) {
      const a = acc.get(id) ?? { below: 0, sum: 0, n: 0 };
      a.below += t.percent < threshold ? 1 : 0;
      a.sum += t.percent;
      a.n++;
      acc.set(id, a);
    }
  let best: { id: string; below: number; average: number } | null = null;
  for (const [id, a] of acc) {
    const cand = { id, below: a.below, average: a.sum / a.n };
    if (
      !best ||
      cand.below > best.below ||
      (cand.below === best.below && cand.average < best.average)
    )
      best = cand;
  }
  return best && best.below > 0 ? best : null;
}

/** A stamp the board client compares to skip re-renders: the newest change across the tables. */
export function versionStamp(dates: (Date | string | null | undefined)[]): string {
  let max = 0;
  for (const d of dates) {
    if (!d) continue;
    const t = typeof d === "string" ? Date.parse(d) : d.getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return String(max);
}
