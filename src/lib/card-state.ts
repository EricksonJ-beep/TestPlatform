/**
 * Who owes what on one assignment (Jon, Oct 13 2026; docs/dashboard-plan.md build step 3): the one
 * rule that turns a student's stored work on an assignment into the state their card shows. The
 * student home (`listStudentAssignments`) and the teacher's class gradebook (`getClassGradebook`)
 * both call it, so a gradebook cell and the student's own card always agree. Pure: callers read
 * the rows, this decides. No database, no clock of its own.
 */
import {
  assignmentStatus,
  capRetakeWindow,
  needsUnlock,
  type AssignmentStatus,
} from "@/lib/assignments";
import type { CorrectionsState } from "@/lib/corrections";
import { correctionsCapOn } from "@/lib/grading";
import {
  practiceOwed,
  quizPracticeNeeds,
  type QuizPracticeData,
  type QuizPracticeTarget,
} from "@/lib/quiz-practice";
import { approvedUntil, effectiveClose, reopenedUntil } from "@/lib/reopen";
import {
  correctionsRule,
  cycleState,
  type CorrectionsRule,
  type CycleState,
  type RetakePlan,
} from "@/lib/retakes";

export type StudentCardState =
  | "upcoming"
  | "not_started"
  | "in_progress"
  | "awaiting_grade"
  | "closed"
  /**
   * A closed test the student may ask to retake (Jon, Oct 14 2026, R6), or an open one whose cap
   * retake window has passed ("Let them ask while it's still open too", Oct 14 2026).
   */
  | "ask_to_retake"
  | CycleState;

/**
 * The corrections states, which a closed test keeps on the student's card (Jon, Oct 14 2026, R1):
 * corrections stay open after a close and have no due date, so they stay on the student's list.
 */
export const CORRECTIONS_STATES: ReadonlySet<CycleState> = new Set<CycleState>([
  "corrections_needed",
  "corrections_to_full",
  "corrections_returned",
  "corrections_submitted",
]);

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
  /** The student asked for the next attempt (used + 1) and the teacher hasn't answered yet. */
  requestedNext: boolean;
  /**
   * An approved reopen for the attempt in play (`attempt_unlocks.open_until`, Jon Oct 14 2026,
   * R5): the open attempt, or the next one when none is open. Null when there is none.
   */
  openUntil: Date | null;
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
  /** Formatives: what quiz relearning reads (R3, `quizPracticeNeeds`); null before any attempt. */
  quizPractice: QuizPracticeData | null;
};

export type CardState = {
  /** The window as it stands for this student: the assignment's close, or a later reopen (R5). */
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
   * Under the cap: the last moment a retake may start without asking; null before attempt 1, with
   * no window, at or above the threshold (`to_full`: no retake is offered there), on a closed test,
   * and while an approved retake's end is ahead (`approvedUntil`).
   */
  retakeBy: Date | null;
  /**
   * The cap's window has passed on a test still open to the student: a ready retake is asked for
   * (`ask_to_retake`), as on a closed test (Jon, Oct 14 2026: "Let them ask while it's still open
   * too").
   */
  windowClosed: boolean;
  /**
   * Quiz relearning (Jon, Oct 14 2026, R3): the targets missed on the latest finished attempt that
   * need practice before a retake, done or not; empty where it doesn't apply.
   */
  quizPractice: QuizPracticeTarget[];
  /** The test closed and the teacher reopened it for this student until then (R4–R5). */
  reopenedUntil: Date | null;
  /**
   * The cap's window passed on a test still open and the teacher approved the retake: it may
   * start until then, the end of the next school day (`open_until`; Oct 14 2026). Null otherwise,
   * and while the approval reopens a closed test (that is `reopenedUntil`).
   */
  retakeOpenUntil: Date | null;
  /**
   * The student's request for the next attempt is current: asked, not answered, on a test that
   * needs the teacher's OK, has closed, or is past the cap's window (the Needs you inbox's
   * `staleRequest` rule).
   */
  retakeRequested: boolean;
  /**
   * "Ask to retake" is a counted to-do (R6): the retake would be required if the test were open (a
   * summative with targets below the line); otherwise it is optional ("Want a higher score?").
   */
  askCounts: boolean;
};

/**
 * Rules: a test that hasn't opened is "upcoming"; an open attempt keeps the card "in progress",
 * even past the close (Finish later, Oct 13 2026: it is finished in class); answers still waiting
 * for the teacher's grade make it "awaiting grade", open or closed (Oct 14 2026: no partial score,
 * no retake until it's graded); a closed test keeps its corrections states (Jon, Oct 14 2026, R1:
 * corrections stay open after a close), reads "ask to retake" once a retake is otherwise ready
 * (R6: attempts left; corrections, a quiz's practice, a summative's gates done) or "awaiting
 * unlock" once the student has asked, and otherwise reads "closed"; an open one follows the
 * learning cycle (`cycleState`, with what corrections do from `correctionsRule`: CVTC rules, the
 * cap; and quiz relearning from `quizPracticeNeeds`), or "not started" before attempt 1. The
 * student's close is the assignment's or a later approved reopen (R5, `effectiveClose`). The cap's
 * retake window counts from attempt 1 and bounds a retake on an open test only: a closed test's
 * retake is the teacher's call, and while reopened the window doesn't apply (decision 2). Once the
 * window has passed on an open test, a ready retake is asked for as on a closed one, and the
 * teacher's approval lifts the window until its end (Jon, Oct 14 2026: "Let them ask while it's
 * still open too"); the steps before it (corrections, a quiz's practice) show as usual.
 */
export function deriveCardState(input: CardInput, now: Date): CardState {
  const status = assignmentStatus(
    { opensAt: input.opensAt, closesAt: effectiveClose(input.closesAt, input.openUntil) },
    now
  );
  const reopened = reopenedUntil(input.closesAt, input.openUntil, now);
  // Corrections cap (Jon, Oct 8 2026): formatives only, never in a CVTC course (Oct 13 2026).
  const capped = correctionsCapOn(input);
  const rule = correctionsRule({
    type: input.type,
    capped,
    cvtcRules: input.cvtcRules,
    firstPercent: input.firstPercent,
    threshold: input.retakeThreshold,
  });
  // Quiz relearning (Jon, Oct 14 2026, decision 5): practice on every missed target first.
  const quizPractice =
    input.attemptsUsed > 0
      ? quizPracticeNeeds({
          type: input.type,
          rule,
          threshold: input.retakeThreshold,
          data: input.quizPractice,
        })
      : [];
  // The window bounds a retake, so it means nothing where no retake is offered: at or above the
  // threshold under the cap, corrections are the way up (decision 2). Nor on a closed test, where
  // the student asks and the teacher decides, or while a retake the teacher approved is open
  // (Oct 14 2026). Past it on an open test, the student asks too ("Let them ask while it's still
  // open too").
  const { retakeBy, passed: windowClosed } = capRetakeWindow({
    capped,
    rule,
    open: status === "open",
    retakeWindowDays: input.retakeWindowDays,
    firstSubmittedAt: input.firstSubmittedAt,
    openUntil: input.openUntil,
    now,
  });
  const approved = approvedUntil(input.openUntil, now);
  const cycleInput: Parameters<typeof cycleState>[0] = {
    type: input.type,
    // CVTC rules (Oct 13 2026): the rule keeps corrections off the gate.
    corrections: input.corrections,
    rule,
    attemptsUsed: input.attemptsUsed,
    attemptsAllowed: input.attemptsAllowed,
    bestPercent: capped && input.finalPercent !== null ? input.finalPercent : input.bestPercent,
    plan: input.plan,
    needsUnlock: input.retakesNeedUnlock && needsUnlock(input.attemptsUsed, input.unlockedThrough),
    correctionsCap: capped,
    firstPercent: input.firstPercent,
    threshold: input.retakeThreshold,
    // The window no longer ends the cycle: past it, the retake is asked for (below).
    windowClosed: false,
    practiceOwed: practiceOwed(quizPractice).length > 0,
  };
  const finished = input.attemptsUsed > 0 && !input.inProgress;
  const cycle = finished ? cycleState(cycleInput) : null;
  // Where the cycle stands with the teacher's OK left aside: a retake ready to ask for.
  const ready = finished ? cycleState({ ...cycleInput, needsUnlock: false }) : null;
  const retakeReady = ready === "retake_required" || ready === "retake_available";
  // Where the retake is asked for whatever the setting: a closed test (R4), or past the cap's window.
  const asks = status === "closed" || windowClosed;
  const retakeRequested = input.requestedNext && (input.retakesNeedUnlock || asks);
  let state: StudentCardState;
  if (status === "scheduled") state = "upcoming";
  else if (input.inProgress) state = "in_progress";
  else if (input.awaitingGrade) state = "awaiting_grade";
  else if (status === "closed")
    state =
      cycle && CORRECTIONS_STATES.has(cycle)
        ? cycle
        : retakeReady
          ? retakeRequested
            ? "awaiting_unlock"
            : "ask_to_retake"
          : "closed";
  else if (windowClosed && retakeReady)
    state = retakeRequested ? "awaiting_unlock" : "ask_to_retake";
  else state = cycle ?? "not_started";
  return {
    status,
    state,
    cycle,
    capped,
    rule,
    retakeBy,
    windowClosed,
    quizPractice,
    reopenedUntil: reopened,
    retakeOpenUntil: approved && !reopened && status === "open" ? approved : null,
    retakeRequested,
    askCounts: state === "ask_to_retake" && ready === "retake_required",
  };
}
