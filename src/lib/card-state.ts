/**
 * Who owes what on one assignment (Jon, Oct 13 2026; docs/dashboard-plan.md build step 3): the one
 * rule that turns a student's stored work on an assignment into the state their card shows. The
 * student home (`listStudentAssignments`) and the teacher's class gradebook (`getClassGradebook`)
 * both call it, so a gradebook cell and the student's own card always agree. Pure: callers read
 * the rows, this decides. No database, no clock of its own.
 */
import {
  assignmentStatus,
  needsUnlock,
  retakeWindowEnd,
  type AssignmentStatus,
} from "@/lib/assignments";
import type { CorrectionsState } from "@/lib/corrections";
import { correctionsCapOn } from "@/lib/grading";
import {
  correctionsRule,
  cycleState,
  type CorrectionsRule,
  type CycleState,
  type RetakePlan,
} from "@/lib/retakes";

export type StudentCardState =
  "upcoming" | "not_started" | "in_progress" | "awaiting_grade" | "closed" | CycleState;

/**
 * Jon, Oct 14 2026: while the teacher still has written answers to grade, the student's card says
 * "Waiting for your grade" instead of a partial score, and nothing else starts until it's graded.
 */
export const AWAITING_GRADE_TEXT =
  "Your teacher hasn't graded your last attempt yet. You can start the next one once it's graded.";

export type CardInput = {
  type: "practice" | "formative" | "summative";
  opensAt: Date | null;
  closesAt: Date | null;
  attemptsAllowed: number | null;
  retakeThreshold: number;
  retakesNeedUnlock: boolean;
  /** The assignment's own cap switch; whether the cap applies is worked out here. */
  correctionsCap: boolean;
  retakeWindowDays: number;
  /** The assessment's course has CVTC rules on. */
  cvtcRules: boolean;
  /** Attempts the student has, finished or not. */
  attemptsUsed: number;
  /** An attempt is still open (in progress or paused). */
  inProgress: boolean;
  /** A finished attempt still has answers waiting for the teacher's grade (status "submitted"). */
  awaitingGrade: boolean;
  /** Highest attempt number the teacher has unlocked for this student (0 = none). */
  unlockedThrough: number;
  /** Attempt 1's percent and when it was submitted (the cap and its retake window read them). */
  firstPercent: number | null;
  firstSubmittedAt: Date | null;
  /** The best finished attempt, and the counting score from `assignment_final_scores`. */
  bestPercent: number | null;
  finalPercent: number | null;
  /** The latest finished attempt's corrections set; "none" when nothing is in scope. */
  corrections: CorrectionsState;
  /** Summatives: the retake plan from the stored gates; null otherwise. */
  plan: RetakePlan | null;
};

export type CardState = {
  status: AssignmentStatus;
  /** What the student's card shows. */
  state: StudentCardState;
  /**
   * The learning cycle after the last finished attempt, worked out even once the test has closed
   * (research notes A2: corrections stay open after a close, so the teacher still sees them);
   * null before any attempt and while one is open.
   */
  cycle: CycleState | null;
  /** The corrections cap as it applies here (`correctionsCapOn`). */
  capped: boolean;
  rule: CorrectionsRule;
  /**
   * Under the cap: the last moment a retake may start; null before attempt 1, with no window, or
   * at or above the threshold (`to_full`: no retake is offered there).
   */
  retakeBy: Date | null;
  windowClosed: boolean;
};

/**
 * Rules: a test that hasn't opened is "upcoming"; an open attempt keeps the card "in progress",
 * even past the close (Finish later, Oct 13 2026: it is finished in class); answers still waiting
 * for the teacher's grade make it "awaiting grade", open or closed (Oct 14 2026: no partial score,
 * no retake until it's graded); a closed test reads "closed" on the student's card; otherwise the learning cycle decides (`cycleState`, with what
 * corrections do from `correctionsRule`: CVTC rules, teacher unlocks, the cap; Jon, Oct 13 2026),
 * or "not started" before attempt 1. The cap's retake window counts from attempt 1.
 */
export function deriveCardState(input: CardInput, now: Date): CardState {
  const status = assignmentStatus(input, now);
  // Corrections cap (Jon, Oct 8 2026): formatives only, never in a CVTC course (Oct 13 2026).
  const capped = correctionsCapOn(input);
  const rule = correctionsRule({
    type: input.type,
    capped,
    retakesNeedUnlock: input.retakesNeedUnlock,
    cvtcRules: input.cvtcRules,
    firstPercent: input.firstPercent,
    threshold: input.retakeThreshold,
  });
  // The window bounds a retake, so it means nothing where no retake is offered: at or above the
  // threshold under the cap, corrections are the way up (decision 2).
  const retakeBy =
    capped && rule !== "to_full"
      ? retakeWindowEnd(input.retakeWindowDays, input.firstSubmittedAt)
      : null;
  const windowClosed = retakeBy !== null && now >= retakeBy;
  const cycle =
    input.attemptsUsed > 0 && !input.inProgress
      ? cycleState({
          type: input.type,
          // Teacher unlocks (Oct 1) and CVTC rules (Oct 13 2026): the rule keeps corrections off the gate.
          corrections: input.corrections,
          rule,
          attemptsUsed: input.attemptsUsed,
          attemptsAllowed: input.attemptsAllowed,
          bestPercent:
            capped && input.finalPercent !== null ? input.finalPercent : input.bestPercent,
          plan: input.plan,
          needsUnlock:
            input.retakesNeedUnlock && needsUnlock(input.attemptsUsed, input.unlockedThrough),
          correctionsCap: capped,
          firstPercent: input.firstPercent,
          threshold: input.retakeThreshold,
          windowClosed,
        })
      : null;
  let state: StudentCardState;
  if (status === "scheduled") state = "upcoming";
  else if (input.inProgress) state = "in_progress";
  else if (input.awaitingGrade) state = "awaiting_grade";
  else if (status === "closed") state = "closed";
  else state = cycle ?? "not_started";
  return { status, state, cycle, capped, rule, retakeBy, windowClosed };
}
