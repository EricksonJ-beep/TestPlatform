/**
 * Retake rules (PLAN.md §2, §4, §5; PHASE1 Ticket 1.12). Pure: which targets a
 * summative retake must and may cover, whether a gate is open, what the retake
 * scope is, and which state the student's card is in. The gate rows themselves
 * are recomputed by `src/lib/gates.ts`.
 */
import type { CorrectionsState } from "@/lib/corrections";

export type GateFlags = { correctionsOk: boolean; activityOk: boolean; practiceOk: boolean };

/** All three gates open (PLAN.md §4: none can be skipped). */
export function gateOpen(g: GateFlags): boolean {
  return g.correctionsOk && g.activityOk && g.practiceOk;
}

export type RetakeTargetInput = {
  id: string;
  percent: number;
  optedIn: boolean;
  gate: GateFlags;
};

export type RetakeBlocker = "no_attempts" | "nothing_selected" | "gates";

export type RetakePlan = {
  /** Below the threshold: "Must retake". */
  required: string[];
  /** At or above the threshold: "Retake available" (only when the assignment allows optional retakes). */
  optional: string[];
  /** Required plus opted-in optional targets: the retake's scope. */
  selected: string[];
  /** Selected targets whose gate is still closed. */
  locked: string[];
  canStart: boolean;
  blocker: RetakeBlocker | null;
};

/**
 * Rule: required = below threshold; optional = the rest when optional retakes
 * are on; the retake covers required + opted-in targets and may start only
 * when every one of them has its gate open and an attempt remains.
 */
export function planRetake(input: {
  targets: RetakeTargetInput[];
  threshold: number;
  optionalRetakes: boolean;
  attemptsUsed: number;
  attemptsAllowed: number | null;
}): RetakePlan {
  const required = input.targets.filter((t) => t.percent < input.threshold).map((t) => t.id);
  const optional = input.optionalRetakes
    ? input.targets.filter((t) => t.percent >= input.threshold).map((t) => t.id)
    : [];
  const optionalSet = new Set(optional);
  const selected = [
    ...required,
    ...input.targets.filter((t) => t.optedIn && optionalSet.has(t.id)).map((t) => t.id),
  ];
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  const locked = selected.filter((id) => !gateOpen(byId.get(id)!.gate));
  const attemptsLeft = input.attemptsAllowed === null || input.attemptsUsed < input.attemptsAllowed;
  const blocker: RetakeBlocker | null = !attemptsLeft
    ? "no_attempts"
    : selected.length === 0
      ? "nothing_selected"
      : locked.length
        ? "gates"
        : null;
  return { required, optional, selected, locked, canStart: blocker === null, blocker };
}

export const BLOCKER_TEXT: Record<RetakeBlocker, string> = {
  no_attempts: "You've used every attempt.",
  nothing_selected: "Every target is proficient. Choose a target to retake it.",
  gates: "Finish the relearning checklist for every target you're retaking first.",
};

// ---------------------------------------------------------------------------
// Card state
// ---------------------------------------------------------------------------

export type CycleState =
  | "corrections_needed"
  | "corrections_optional"
  | "corrections_returned"
  | "corrections_submitted"
  | "relearning"
  | "retake_required"
  | "retake_available"
  | "awaiting_unlock"
  | "done";

/**
 * Rule (PLAN.md §5 screen 2): corrections come first; then, for summatives,
 * the relearning checklist, then Retake required / available; formatives go
 * straight to Retake available while attempts remain and the score is not
 * perfect. Done otherwise. When the retake is otherwise ready but the teacher
 * has not unlocked it (`needsUnlock`), the card waits on the teacher instead.
 */
export function cycleState(input: {
  type: "practice" | "formative" | "summative";
  corrections: CorrectionsState;
  attemptsUsed: number;
  attemptsAllowed: number | null;
  bestPercent: number | null;
  plan: RetakePlan | null;
  /** The assignment needs a teacher unlock for the next attempt and none has been given. */
  needsUnlock?: boolean;
  /**
   * Corrections cap (formatives, Jon Oct 8 2026): with attempt 1 at or above the threshold,
   * corrections are optional (they lift the score to 100); once the retake window has closed,
   * no retake is offered.
   */
  correctionsCap?: boolean;
  firstPercent?: number | null;
  threshold?: number;
  windowClosed?: boolean;
}): CycleState {
  const state = readyState(input);
  if (input.needsUnlock && (state === "retake_required" || state === "retake_available"))
    return "awaiting_unlock";
  return state;
}

function readyState(input: Parameters<typeof cycleState>[0]): CycleState {
  const capped = input.type === "formative" && !!input.correctionsCap;
  if (input.corrections === "needed") {
    const first = input.firstPercent ?? null;
    if (capped && first !== null && first >= (input.threshold ?? 80)) return "corrections_optional";
    return "corrections_needed";
  }
  if (input.corrections === "returned") return "corrections_returned";
  if (input.corrections === "submitted") return "corrections_submitted";
  const attemptsLeft = input.attemptsAllowed === null || input.attemptsUsed < input.attemptsAllowed;
  if (!attemptsLeft || input.type === "practice") return "done";
  if (input.type === "formative") {
    if (input.bestPercent !== null && input.bestPercent >= 100) return "done";
    if (capped && input.windowClosed) return "done";
    return "retake_available";
  }
  const plan = input.plan;
  if (!plan) return "done";
  if (plan.selected.length && plan.locked.length) return "relearning";
  if (plan.required.length) return "retake_required";
  if (plan.optional.length) return "retake_available";
  return "done";
}
