/**
 * Practice check reads (ticket R3): what the check screen shows for one check, sanitized like
 * every student payload (no keys or explanations until a question has its answer). Callers pass
 * the guards first.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CheckAnswer } from "@/db/types";
import type { Answer } from "@/lib/grading";
import { buildFeedback, loadFeedbackQuestions, type PracticeFeedback } from "@/lib/practice";
import { scoreRound } from "@/lib/practice-check";
import { asServed } from "@/lib/practice-check-server";
import { sanitizedQuestions, type StudentQuestion } from "@/lib/queries/attempts";

export type CheckRunnerPayload = {
  check: {
    id: string;
    purpose: "path" | "attempt";
    passMark: number;
    passed: boolean;
    unlocksAttemptNumber: number | null;
  };
  assignment: { id: string; title: string; type: "practice" | "formative" | "summative" };
  targets: { id: string; code: string; title: string }[];
  /** The latest round; null before the first is dealt. */
  round: {
    id: string;
    number: number;
    finished: boolean;
    score: number | null;
    passed: boolean;
  } | null;
  questions: StudentQuestion[];
  /** Answered questions: the first answer and its feedback (right or wrong, key, why). */
  answered: Record<string, { answer: Answer; feedback: PracticeFeedback }>;
  /** The counting score now, for "Your 80% is in" after a pass on a quiz. */
  finalPercent: number | null;
  fontScale: number;
};

export async function getCheckPayload(checkId: string): Promise<CheckRunnerPayload | null> {
  const check = await db.query.practiceChecks.findFirst({
    where: eq(schema.practiceChecks.id, checkId),
  });
  if (!check) return null;
  const [asg] = await db
    .select({
      id: schema.assignments.id,
      classId: schema.assignments.classId,
      title: schema.assessments.title,
      type: schema.assessments.type,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, check.assignmentId))
    .limit(1);
  if (!asg) return null;
  const [targets, round, final, enrollment] = await Promise.all([
    check.targetIds.length
      ? db
          .select({
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
            sortOrder: schema.learningTargets.sortOrder,
          })
          .from(schema.learningTargets)
          .where(inArray(schema.learningTargets.id, check.targetIds))
      : [],
    db.query.practiceCheckRounds.findFirst({
      where: eq(schema.practiceCheckRounds.checkId, checkId),
      orderBy: [desc(schema.practiceCheckRounds.number)],
    }),
    db.query.assignmentFinalScores.findFirst({
      columns: { percent: true },
      where: and(
        eq(schema.assignmentFinalScores.assignmentId, check.assignmentId),
        eq(schema.assignmentFinalScores.studentId, check.studentId)
      ),
    }),
    db.query.enrollments.findFirst({
      columns: { fontScale: true },
      where: and(
        eq(schema.enrollments.classId, asg.classId),
        eq(schema.enrollments.studentId, check.studentId)
      ),
    }),
  ]);
  let questions: StudentQuestion[] = [];
  const answered: CheckRunnerPayload["answered"] = {};
  let roundView: CheckRunnerPayload["round"] = null;
  if (round) {
    const served = round.questionSet.map((q) => asServed(check.id, q));
    const ids = served.map((s) => s.questionId);
    const sanitized = await sanitizedQuestions(ids, served, round.id);
    questions = served
      .map((s) => sanitized.get(s.questionId))
      .filter((q): q is StudentQuestion => !!q);
    const answers = round.answers as Record<string, CheckAnswer>;
    const done = ids.filter((id) => answers[id]);
    if (done.length) {
      const full = await loadFeedbackQuestions(done);
      for (const id of done) {
        const q = full.get(id);
        const s = served.find((x) => x.questionId === id);
        if (q && s)
          answered[id] = {
            answer: answers[id].answer as Answer,
            feedback: buildFeedback(q, s, answers[id].answer as Answer),
          };
      }
    }
    const score = scoreRound(ids, answers, check.passMark);
    roundView = {
      id: round.id,
      number: round.number,
      finished: score.finished,
      score: score.score,
      passed: score.passed,
    };
  }
  return {
    check: {
      id: check.id,
      purpose: check.purpose,
      passMark: check.passMark,
      passed: !!check.passedAt,
      unlocksAttemptNumber: check.unlocksAttemptNumber,
    },
    assignment: { id: asg.id, title: asg.title, type: asg.type },
    targets: [...targets]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, undefined, { numeric: true })
      )
      .map(({ id, code, title }) => ({ id, code, title })),
    round: roundView,
    questions,
    answered,
    finalPercent: final?.percent ?? null,
    fontScale: enrollment?.fontScale ?? 100,
  };
}
