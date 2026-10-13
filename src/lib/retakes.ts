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
// What corrections do on one assignment
// ---------------------------------------------------------------------------

/**
 * The role corrections play on one assignment, read by the student card (`cycleState`) and by
 * `startAttempt` so the two never disagree (Jon, Oct 13 2026):
 *   "none"     CVTC rules on the course: corrections earn no credit and are never owed; the only
 *              way up is a retake.
 *   "optional" "Retakes need my OK" (Jon, Oct 1 2026): corrections stay open but never gate; the
 *              teacher's unlock is the only gate.
 *   "to_full"  capped formative with attempt 1 at or above the threshold: the student is directed
 *              to corrections, an approved set lifts the score to 100, and no retake is offered.
 *   "gate"     everything else (PLAN.md §4): the last attempt's corrections come before the next
 *              attempt; under the cap, attempt 1's approved set lifts the score to the threshold
 *              and a retake is the way higher.
 */
export type CorrectionsRule = "none" | "optional" | "to_full" | "gate";

export function correctionsRule(input: {
  type: "practice" | "formative" | "summative";
  /** The cap as it applies here (`correctionsCapOn`: formative, cap on, not a CVTC course). */
  capped: boolean;
  retakesNeedUnlock: boolean;
  cvtcRules: boolean;
  /** Attempt 1's percent; null before the first finished attempt. */
  firstPercent: number | null;
  threshold: number;
}): CorrectionsRule {
  if (input.type === "practice" || input.cvtcRules) return "none";
  if (input.retakesNeedUnlock) return "optional";
  if (input.capped && input.firstPercent !== null && input.firstPercent >= input.threshold)
    return "to_full";
  return "gate";
}

export const TO_FULL_TEXT = {
  pending: "Do your corrections to raise this quiz to 100%. There's no retake at your score.",
  done: "Your corrections raised this quiz to 100%. There's nothing to retake.",
} as const;

// ---------------------------------------------------------------------------
// Card state
// ---------------------------------------------------------------------------

export type CycleState =
  | "corrections_needed"
  | "corrections_to_full"
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
 * What corrections do comes from `correctionsRule` (Jon, Oct 13 2026).
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
   * corrections are the way up (they lift the score to 100); once the retake window has closed,
   * no retake is offered.
   */
  correctionsCap?: boolean;
  firstPercent?: number | null;
  threshold?: number;
  windowClosed?: boolean;
  /** From `correctionsRule`; when absent it is worked out from the cap inputs above. */
  rule?: CorrectionsRule;
}): CycleState {
  const state = readyState(input);
  if (input.needsUnlock && (state === "retake_required" || state === "retake_available"))
    return "awaiting_unlock";
  return state;
}

function readyState(input: Parameters<typeof cycleState>[0]): CycleState {
  const capped = input.type === "formative" && !!input.correctionsCap;
  const rule =
    input.rule ??
    correctionsRule({
      type: input.type,
      capped,
      retakesNeedUnlock: false,
      cvtcRules: false,
      firstPercent: input.firstPercent ?? null,
      threshold: input.threshold ?? 80,
    });
  // CVTC rules or teacher unlocks: corrections never hold the card (Jon, Oct 1 and Oct 13 2026).
  const corrections = rule === "none" || rule === "optional" ? "none" : input.corrections;
  if (corrections === "needed")
    return rule === "to_full" ? "corrections_to_full" : "corrections_needed";
  if (corrections === "returned") return "corrections_returned";
  if (corrections === "submitted") return "corrections_submitted";
  // At or above the threshold under the cap, corrections are the only way up: no retake (Oct 13 2026).
  if (rule === "to_full") return "done";
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
