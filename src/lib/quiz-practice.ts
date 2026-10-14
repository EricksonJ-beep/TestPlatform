/**
 * Quiz relearning (Jon, Oct 14 2026, docs/student-home-plan.md R3, decisions 5–6: "Required before
 * a retake… Score 80%+ on practice"). Before a quiz retake (or asking for one), the student
 * practises every learning target they missed, like the unit-test relearning checklist. Pure: the
 * query module (`src/lib/queries/quiz-practice.ts`) reads the rows; this decides. The student
 * card (`deriveCardState`), `startAttempt`, `requestRetake`, the class gradebook and the Needs
 * you inbox all call it, so they agree.
 */
import { creditsTarget } from "@/lib/worksheet-rules";
import type { CorrectionsRule } from "@/lib/retakes";

/** A target's practice is done at this score (decision 6), whatever the quiz's retake threshold. */
export const PRACTICE_PASS_PERCENT = 80;
/** A student-built practice (Build my practice) must cover the target with this many questions. */
export const BUILT_PRACTICE_MIN_QUESTIONS = 5;

/** A learning target on the quiz, with what practice exists for it. */
export type PracticeTargetInfo = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  /** A published practice set is tagged to it (`practice_set_targets`). */
  hasSet: boolean;
  /** Live questions tagged to it in its course's banks open for practice (Build my practice). */
  openQuestions: number;
};

/** One finished practice attempt, as far as quiz relearning reads it. */
export type PracticeResult = {
  completedAt: Date;
  /** The teacher's practice set it was on; null for a student-built practice. */
  practiceSetId: string | null;
  /** The targets that set is tagged to (empty for a built practice). */
  setTargetIds: string[];
  /**
   * Per target, over the served questions tagged to it: how many, and the points earned of the
   * points possible on the auto-graded ones (practice never grades written answers).
   */
  byTarget: Record<string, { questions: number; earned: number; possible: number }>;
  /** The whole attempt's percent (a worksheet-backed set has no Bloom questions, only this). */
  percent: number | null;
  /** A worksheet submit's credited targets; null = every target (`creditsTarget`). */
  creditedTargetIds: string[] | null;
};

/** What R3 reads for one student on one quiz. */
export type QuizPracticeData = {
  /** The latest finished attempt: when it was submitted and its per-target percents. */
  latest: { submittedAt: Date | null; targetPercents: Record<string, number> } | null;
  /** Names and practice content for (at least) the targets on that attempt. */
  targets: PracticeTargetInfo[];
  /** The student's finished practice, any course, any time (filtered here). */
  practice: PracticeResult[];
};

/** One missed target and where its practice stands. */
export type QuizPracticeTarget = {
  targetId: string;
  code: string;
  title: string;
  /** The target's percent on the latest finished quiz attempt. */
  scored: number;
  /** Best percent on that target in practice that counts, since that attempt; null when none. */
  best: number | null;
  done: boolean;
};

/** Percent of one practice attempt on one target, when it counts for that target; null otherwise. */
function countingPercent(
  r: PracticeResult,
  target: PracticeTargetInfo,
  after: Date | null
): number | null {
  if (after && r.completedAt.getTime() <= after.getTime()) return null;
  const on = r.byTarget[target.id];
  const pct = on && on.possible > 0 ? (on.earned / on.possible) * 100 : null;
  if (r.practiceSetId) {
    // A teacher's set tagged to the target counts at any size; one with no question on the target
    // (a worksheet, or a set tagged by hand) is read by its whole score and credited targets.
    if (!r.setTargetIds.includes(target.id)) return null;
    if (!creditsTarget(r.creditedTargetIds, target.id)) return null;
    return pct ?? r.percent;
  }
  // Build my practice: at least 5 questions on the target, or every open question it has when the
  // bank holds fewer, so a short bank can never block the retake for good.
  const min = Math.max(1, Math.min(BUILT_PRACTICE_MIN_QUESTIONS, target.openQuestions));
  return on && on.questions >= min ? pct : null;
}

/**
 * Rule (Jon, Oct 14 2026, R3): on a formative, every learning target under the assignment's
 * retake threshold on the latest finished attempt needs practice before a retake: a finished
 * practice completed after that attempt was submitted, scoring at least 80% on that target's
 * questions, on a published practice set tagged to the target (any size) or a student-built
 * practice with at least 5 of its questions. A target with no practice content (no published set
 * tagged to it, no open-practice question) doesn't block. Untagged questions make no targets.
 * Every course, CVTC included; not where corrections are the way to 100% (`to_full`: no retake)
 * and not on summatives (their gate rows). Targets in the course's order.
 */
export function quizPracticeNeeds(input: {
  type: "practice" | "formative" | "summative";
  rule: CorrectionsRule;
  threshold: number;
  data: QuizPracticeData | null;
}): QuizPracticeTarget[] {
  const { data } = input;
  if (input.type !== "formative" || input.rule === "to_full" || !data?.latest) return [];
  const { latest } = data;
  return data.targets
    .filter(
      (t) =>
        t.id in latest.targetPercents &&
        latest.targetPercents[t.id] < input.threshold &&
        (t.hasSet || t.openQuestions > 0)
    )
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, undefined, { numeric: true })
    )
    .map((t) => {
      const scores = data.practice
        .map((r) => countingPercent(r, t, latest.submittedAt))
        .filter((p): p is number => p !== null);
      const best = scores.length ? Math.max(...scores) : null;
      return {
        targetId: t.id,
        code: t.code,
        title: t.title,
        scored: latest.targetPercents[t.id],
        best: best === null ? null : Math.round(best * 10) / 10,
        done: best !== null && best >= PRACTICE_PASS_PERCENT,
      };
    });
}

/** Targets still waiting on practice. */
export function practiceOwed(list: QuizPracticeTarget[]): QuizPracticeTarget[] {
  return list.filter((t) => !t.done);
}

/** "U2.LT1", "U2.LT1 and U2.LT3", "U2.LT1, U2.LT2 and U2.LT3". */
export function targetList(codes: string[]): string {
  return codes.length <= 1
    ? (codes[0] ?? "")
    : `${codes.slice(0, -1).join(", ")} and ${codes.at(-1)}`;
}

/** Why a quiz retake (or a request for one) can't happen yet, in the student's words. */
export function practiceOwedText(owed: QuizPracticeTarget[]): string {
  return `Practice ${targetList(owed.map((t) => t.code))} first: score ${PRACTICE_PASS_PERCENT}% or better on a practice for ${owed.length === 1 ? "it" : "each"} to unlock your retake.`;
}
