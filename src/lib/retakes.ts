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

/** One target of a student's summative retake picture, as the card, the start action, and the gradebook read it. */
export type RetakeTarget = {
  id: string;
  code: string;
  title: string;
  percent: number;
  required: boolean;
  optedIn: boolean;
  gate: GateFlags & { unlocked: boolean };
};

/** A stored `retake_gates` row, as far as the retake picture reads it. */
export type StoredGate = GateFlags & {
  learningTargetId: string;
  optedIn: boolean;
  unlockedAt: Date | null;
};

/**
 * Rule: the targets are the ones on the counting score (per-target best), in the course's target
 * order; required = below the threshold; flags come from the stored gate rows (a target with no
 * row has every gate shut). In a course with CVTC rules (Jon, Oct 13 2026) the corrections gate is
 * always open, even on rows written before the course turned the rules on. `getRetakeStatus` and
 * the class gradebook (`getClassGradebook`) both build the picture here, so they agree.
 */
export function retakeTargets(input: {
  perTarget: Record<string, { percent: number }>;
  /** The targets' names; a target missing here is left out. */
  names: { id: string; code: string; title: string; sortOrder: number }[];
  gates: StoredGate[];
  threshold: number;
  cvtcRules: boolean;
}): RetakeTarget[] {
  const gateBy = new Map(input.gates.map((g) => [g.learningTargetId, g]));
  return input.names
    .filter((t) => t.id in input.perTarget)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((t) => {
      const g = gateBy.get(t.id);
      const percent = input.perTarget[t.id].percent;
      const required = percent < input.threshold;
      const optedIn = g?.optedIn ?? false;
      const flags: GateFlags = {
        correctionsOk: input.cvtcRules ? true : (g?.correctionsOk ?? false),
        activityOk: g?.activityOk ?? false,
        practiceOk: g?.practiceOk ?? false,
      };
      return {
        id: t.id,
        code: t.code,
        title: t.title,
        percent,
        required,
        optedIn,
        gate: {
          ...flags,
          unlocked:
            !!g?.unlockedAt || (input.cvtcRules && (required || optedIn) && gateOpen(flags)),
        },
      };
    });
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
 * The role corrections play on one assignment, read by the student card (`cycleState`), by
 * `startAttempt` and by `requestRetake`, so they never disagree (Jon, Oct 13 2026):
 *   "none"     CVTC rules on the course: corrections earn no credit and are never owed; the only
 *              way up is a retake.
 *   "to_full"  capped formative with attempt 1 at or above the threshold: the student is directed
 *              to corrections, an approved set lifts the score to 100, and no retake is offered,
 *              with or without "Retakes need my OK" (decision 2 makes no exception for it).
 *   "gate"     everything else (PLAN.md §4): the last attempt's corrections come before the next
 *              attempt; under the cap, attempt 1's approved set lifts the score to the threshold
 *              and a retake is the way higher.
 * "Retakes need my OK" changes nothing here (Jon, Oct 14 2026, decision 4: "To-do, then ask"):
 * corrections are owed exactly as without it and come before the student may ask; the teacher's
 * unlock decides after that. There is no "optional" any more.
 */
export type CorrectionsRule = "none" | "to_full" | "gate";

export function correctionsRule(input: {
  type: "practice" | "formative" | "summative";
  /** The cap as it applies here (`correctionsCapOn`: formative, cap on, not a CVTC course). */
  capped: boolean;
  cvtcRules: boolean;
  /** Attempt 1's percent; null before the first finished attempt. */
  firstPercent: number | null;
  threshold: number;
}): CorrectionsRule {
  if (input.type === "practice" || input.cvtcRules) return "none";
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
 * to Retake available while attempts remain and the score is not perfect,
 * once every missed target is practised (`practiceOwed`, quiz relearning: Jon,
 * Oct 14 2026, decision 5), else Relearning. Done otherwise. When the retake is
 * otherwise ready but the teacher has not unlocked it (`needsUnlock`), the card
 * waits on the teacher instead. What corrections do comes from `correctionsRule`
 * (Jon, Oct 13 2026); "Retakes need my OK" no longer makes them optional (Oct 14).
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
  /** Formatives: a missed target still needs practice before a retake (`quizPracticeNeeds`). */
  practiceOwed?: boolean;
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
      cvtcRules: false,
      firstPercent: input.firstPercent ?? null,
      threshold: input.threshold ?? 80,
    });
  // CVTC rules: corrections never hold the card (Jon, Oct 13 2026).
  const corrections = rule === "none" ? "none" : input.corrections;
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
    // Quiz relearning (Jon, Oct 14 2026): practise every missed target before the retake.
    if (input.practiceOwed) return "relearning";
    return "retake_available";
  }
  const plan = input.plan;
  if (!plan) return "done";
  if (plan.selected.length && plan.locked.length) return "relearning";
  if (plan.required.length) return "retake_required";
  if (plan.optional.length) return "retake_available";
  return "done";
}

// ---------------------------------------------------------------------------
// First try → now
// ---------------------------------------------------------------------------

export type Growth = {
  /** Percent on attempt 1 (the whole test). */
  first: number;
  /** The counting percent now. */
  now: number;
  /** Summatives: each target a later attempt covered again, first try → counting percent. */
  targets: { learningTargetId: string; first: number; now: number }[];
};

/**
 * Rule (Jon, Oct 30 2026: "show the retake score verse the first scores to show the difference"):
 * once a student has more than one finished attempt, show attempt 1's percent beside the counting
 * percent; on a summative, also each target covered again, from the first attempt that had it to
 * its counting percent (the higher always counts, so `now` never drops below `first`). Null with
 * fewer than two finished attempts or no counting score. The results table, the mastery grid and
 * the class gradebook all read this, so they agree.
 */
export function growthFor(input: {
  /** Finished attempts, any order; `perTarget` is target id → percent on that attempt. */
  attempts: { number: number; percent: number | null; perTarget: Record<string, number> }[];
  /** The counting percent, and (summatives) the counting percent per target. */
  now: { percent: number; perTarget: Record<string, number> | null } | null;
}): Growth | null {
  const done = [...input.attempts].sort((a, b) => a.number - b.number);
  if (done.length < 2 || !input.now || done[0].percent === null) return null;
  const firstBy = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const a of done)
    for (const [id, p] of Object.entries(a.perTarget)) {
      if (!firstBy.has(id)) firstBy.set(id, p);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  const perTarget = input.now.perTarget;
  return {
    first: done[0].percent,
    now: input.now.percent,
    targets: perTarget
      ? [...firstBy]
          .filter(([id]) => (seen.get(id) ?? 0) > 1 && id in perTarget)
          .map(([learningTargetId, first]) => ({
            learningTargetId,
            first,
            now: perTarget[learningTargetId],
          }))
      : [],
  };
}
