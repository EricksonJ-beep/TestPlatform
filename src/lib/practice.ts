/**
 * Server-only practice lifecycle (PLAN.md §3.7, Ticket 1.13): serve a practice
 * set, grade each answer the moment it lands (instant feedback with the
 * explanation), mark the attempt complete when every question has been
 * answered once, record activity completions, and recompute retake gates
 * after each completion. Nothing here is a grade: practice never counts.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompletionEvidence, ServedQuestion } from "@/db/types";
import { drawFromPool, type PoolQuestion } from "@/lib/assessments/serve";
import { recomputeGates, recomputeGatesForStudent } from "@/lib/gates";
import {
  correctAnswerText,
  gradeResponse,
  type Answer,
  type GradableQuestion,
} from "@/lib/grading";
import {
  checkActivityCompletion,
  practiceProgress,
  type CompletionCheck,
  type PracticeAnswer,
  type PracticeProgress,
} from "@/lib/practice-rules";
import { loadGradableQuestions } from "@/lib/queries/attempts";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Live questions in a pool with what a draw needs. */
export async function loadPoolQuestions(poolId: string): Promise<PoolQuestion[]> {
  const rows = await db
    .select({
      questionId: schema.questions.id,
      points: schema.questions.points,
      stimulusId: schema.questions.stimulusId,
    })
    .from(schema.poolQuestions)
    .innerJoin(
      schema.questions,
      and(
        eq(schema.poolQuestions.questionId, schema.questions.id),
        eq(schema.questions.isArchived, false)
      )
    )
    .where(eq(schema.poolQuestions.poolId, poolId));
  if (rows.length === 0) return [];
  const tRows = await db
    .select({
      questionId: schema.questionTargets.questionId,
      learningTargetId: schema.questionTargets.learningTargetId,
    })
    .from(schema.questionTargets)
    .where(
      inArray(
        schema.questionTargets.questionId,
        rows.map((r) => r.questionId)
      )
    );
  const tBy = new Map<string, string[]>();
  for (const t of tRows)
    (tBy.get(t.questionId) ?? tBy.set(t.questionId, []).get(t.questionId)!).push(
      t.learningTargetId
    );
  return rows.map((r) => ({ ...r, targetIds: tBy.get(r.questionId) ?? [] }));
}

/**
 * Start (or resume) a practice attempt. Rule: a fixed set serves every
 * question in the teacher's order; a pool set draws `drawCount`, preferring
 * questions this student hasn't seen on earlier attempts of the set. Ordering
 * and matching options are shuffled; choice options keep the author's order.
 */
export async function startPracticeAttempt(
  practiceSetId: string,
  studentId: string
): Promise<{ attemptId: string; resumed: boolean }> {
  const open = await db.query.practiceAttempts.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.practiceAttempts.practiceSetId, practiceSetId),
      eq(schema.practiceAttempts.studentId, studentId),
      isNull(schema.practiceAttempts.completedAt)
    ),
    orderBy: (t, { desc }) => [desc(t.startedAt)],
  });
  if (open) return { attemptId: open.id, resumed: true };

  const set = await db.query.practiceSets.findFirst({
    where: eq(schema.practiceSets.id, practiceSetId),
  });
  if (!set) throw new Error("practice set not found");
  const setTargets = new Set(
    (
      await db.query.practiceSetTargets.findMany({
        columns: { learningTargetId: true },
        where: eq(schema.practiceSetTargets.practiceSetId, practiceSetId),
      })
    ).map((t) => t.learningTargetId)
  );

  let picked: PoolQuestion[];
  if (set.poolId) {
    const pool = await db.query.questionPools.findFirst({
      columns: { drawStimulusGroups: true },
      where: eq(schema.questionPools.id, set.poolId),
    });
    const questions = await loadPoolQuestions(set.poolId);
    const prior = await db.query.practiceAttempts.findMany({
      columns: { questionSet: true },
      where: and(
        eq(schema.practiceAttempts.practiceSetId, practiceSetId),
        eq(schema.practiceAttempts.studentId, studentId)
      ),
    });
    const avoid = new Set(prior.flatMap((p) => p.questionSet.map((q) => q.questionId)));
    picked = drawFromPool(questions, set.drawCount ?? questions.length, {
      drawStimulusGroups: pool?.drawStimulusGroups ?? false,
      rng: Math.random,
      avoid,
    });
  } else {
    const rows = await db
      .select({
        questionId: schema.questions.id,
        points: schema.questions.points,
        stimulusId: schema.questions.stimulusId,
      })
      .from(schema.practiceSetQuestions)
      .innerJoin(
        schema.questions,
        and(
          eq(schema.practiceSetQuestions.questionId, schema.questions.id),
          eq(schema.questions.isArchived, false)
        )
      )
      .where(eq(schema.practiceSetQuestions.practiceSetId, practiceSetId))
      .orderBy(asc(schema.practiceSetQuestions.sortOrder));
    const ids = rows.map((r) => r.questionId);
    const tRows = ids.length
      ? await db
          .select({
            questionId: schema.questionTargets.questionId,
            learningTargetId: schema.questionTargets.learningTargetId,
          })
          .from(schema.questionTargets)
          .where(inArray(schema.questionTargets.questionId, ids))
      : [];
    picked = rows.map((r) => ({
      ...r,
      targetIds: tRows.filter((t) => t.questionId === r.questionId).map((t) => t.learningTargetId),
    }));
  }
  if (picked.length === 0) throw new Error("empty");

  const types = await db
    .select({ id: schema.questions.id, type: schema.questions.type })
    .from(schema.questions)
    .where(
      inArray(
        schema.questions.id,
        picked.map((p) => p.questionId)
      )
    );
  const optionRows = await db
    .select({ id: schema.questionOptions.id, questionId: schema.questionOptions.questionId })
    .from(schema.questionOptions)
    .where(
      inArray(
        schema.questionOptions.questionId,
        picked.map((p) => p.questionId)
      )
    )
    .orderBy(asc(schema.questionOptions.sortOrder));
  const typeBy = new Map(types.map((t) => [t.id, t.type]));
  const optionsBy = new Map<string, string[]>();
  for (const o of optionRows)
    (optionsBy.get(o.questionId) ?? optionsBy.set(o.questionId, []).get(o.questionId)!).push(o.id);

  const questionSet: ServedQuestion[] = picked.map((p, i) => {
    const type = typeBy.get(p.questionId);
    const always = type === "ordering" || type === "matching";
    // The item's target: one the set is tagged with when possible, else its first tag.
    const target = p.targetIds.find((t) => setTargets.has(t)) ?? p.targetIds[0] ?? null;
    const base: ServedQuestion = {
      questionId: p.questionId,
      sectionId: practiceSetId,
      learningTargetId: target,
      points: p.points,
      order: i + 1,
    };
    return always ? { ...base, optionOrder: shuffle(optionsBy.get(p.questionId) ?? []) } : base;
  });
  const [attempt] = await db
    .insert(schema.practiceAttempts)
    .values({ practiceSetId, studentId, questionSet, answers: {} })
    .returning({ id: schema.practiceAttempts.id });
  return { attemptId: attempt.id, resumed: false };
}

export type PracticeFeedback = {
  questionId: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  pointsPossible: number;
  /** The answer key as text; null when there is no fixed key (essays). */
  correctAnswer: string | null;
  explanation: string | null;
  /** Feedback written on the option(s) the student chose. */
  optionFeedback: string[];
  detail?: Record<string, boolean>;
  note?: string;
};

type FeedbackQuestion = GradableQuestion & {
  explanation: string | null;
  optionFeedback: Map<string, string | null>;
};

async function loadFeedbackQuestions(ids: string[]): Promise<Map<string, FeedbackQuestion>> {
  const gradable = await loadGradableQuestions(ids);
  if (ids.length === 0) return new Map();
  const extra = await db
    .select({ id: schema.questions.id, explanation: schema.questions.explanation })
    .from(schema.questions)
    .where(inArray(schema.questions.id, ids));
  const fb = await db
    .select({
      id: schema.questionOptions.id,
      questionId: schema.questionOptions.questionId,
      feedback: schema.questionOptions.feedback,
    })
    .from(schema.questionOptions)
    .where(inArray(schema.questionOptions.questionId, ids));
  const out = new Map<string, FeedbackQuestion>();
  for (const [id, q] of gradable) {
    out.set(id, {
      ...q,
      explanation: extra.find((e) => e.id === id)?.explanation ?? null,
      optionFeedback: new Map(fb.filter((f) => f.questionId === id).map((f) => [f.id, f.feedback])),
    });
  }
  return out;
}

/** Grade one answer and describe it back: right or wrong, the key, the explanation, option feedback. */
export function buildFeedback(
  q: FeedbackQuestion,
  served: ServedQuestion,
  answer: Answer
): PracticeFeedback {
  const result = gradeResponse({ ...q, points: served.points }, answer);
  const chosen =
    answer?.kind === "choice"
      ? answer.optionId
        ? [answer.optionId]
        : []
      : answer?.kind === "multi"
        ? answer.optionIds
        : [];
  return {
    questionId: q.id,
    isCorrect: result.isCorrect,
    pointsEarned: result.pointsEarned,
    pointsPossible: result.pointsPossible,
    correctAnswer: correctAnswerText(q),
    explanation: q.explanation,
    optionFeedback: chosen
      .map((id) => q.optionFeedback.get(id) ?? null)
      .filter((x): x is string => !!x),
    detail: result.detail,
    note: result.note,
  };
}

/**
 * Record one answer on a practice attempt and return the feedback. Rule: one
 * answer per question per attempt; a second answer returns the first's
 * feedback unchanged. Completing the last question closes the attempt with its
 * percent and recomputes every retake gate the student has.
 */
export async function answerPracticeQuestion(
  attemptId: string,
  questionId: string,
  answer: Answer
): Promise<{ feedback: PracticeFeedback; progress: PracticeProgress; completed: boolean }> {
  const attempt = await db.query.practiceAttempts.findFirst({
    where: eq(schema.practiceAttempts.id, attemptId),
  });
  if (!attempt) throw new Error("practice attempt not found");
  const served = attempt.questionSet.find((s) => s.questionId === questionId);
  if (!served) throw new Error("not on attempt");
  const answers = attempt.answers as Record<string, PracticeAnswer>;
  const questions = await loadFeedbackQuestions([questionId]);
  const q = questions.get(questionId);
  if (!q) throw new Error("question missing");

  const prior = answers[questionId];
  if (prior) {
    return {
      feedback: buildFeedback(q, served, prior.answer as Answer),
      progress: practiceProgress(attempt.questionSet, answers),
      completed: false,
    };
  }
  const feedback = buildFeedback(q, served, answer);
  const next: Record<string, PracticeAnswer> = {
    ...answers,
    [questionId]: {
      answer,
      isCorrect: feedback.isCorrect,
      pointsEarned: feedback.pointsEarned,
      pointsPossible: feedback.pointsPossible,
      answeredAt: new Date().toISOString(),
    },
  };
  const progress = practiceProgress(attempt.questionSet, next);
  const completed = progress.complete && !attempt.completedAt;
  await db
    .update(schema.practiceAttempts)
    .set({
      answers: next,
      ...(completed
        ? {
            completedAt: new Date(),
            score: progress.score,
            maxScore: progress.maxScore,
            percent: progress.percent,
          }
        : {}),
    })
    .where(eq(schema.practiceAttempts.id, attemptId));
  if (completed) await recomputeGatesForStudent(attempt.studentId);
  return { feedback, progress, completed };
}

/** Feedback for every question already answered on an attempt (for resuming and the summary). */
export async function feedbackForAttempt(attempt: {
  questionSet: ServedQuestion[];
  answers: Record<string, unknown>;
}): Promise<Record<string, PracticeFeedback>> {
  const answers = attempt.answers as Record<string, PracticeAnswer>;
  const ids = Object.keys(answers);
  if (ids.length === 0) return {};
  const questions = await loadFeedbackQuestions(ids);
  const out: Record<string, PracticeFeedback> = {};
  for (const id of ids) {
    const q = questions.get(id);
    const served = attempt.questionSet.find((s) => s.questionId === id);
    if (q && served) out[id] = buildFeedback(q, served, answers[id].answer as Answer);
  }
  return out;
}

/**
 * Record an activity completion once the kind's rule is met. Rule: the
 * evidence is checked server-side; a re-completion refreshes the evidence but
 * never clears a teacher's verification.
 */
export async function completeActivity(
  activityId: string,
  studentId: string,
  evidence: CompletionEvidence
): Promise<CompletionCheck & { teacherVerified?: boolean; requiresTeacherVerification?: boolean }> {
  const activity = await db.query.relearningActivities.findFirst({
    columns: { kind: true, prompts: true, requiresTeacherVerification: true },
    where: eq(schema.relearningActivities.id, activityId),
  });
  if (!activity) throw new Error("activity not found");
  const check = checkActivityCompletion({
    kind: activity.kind,
    evidence,
    prompts: activity.prompts ?? null,
  });
  if (!check.ok) return check;
  const [row] = await db
    .insert(schema.activityCompletions)
    .values({ studentId, activityId, evidence: check.evidence, completedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.activityCompletions.studentId, schema.activityCompletions.activityId],
      set: { evidence: check.evidence, completedAt: new Date() },
    })
    .returning({ teacherVerified: schema.activityCompletions.teacherVerified });
  await recomputeGatesForStudent(studentId);
  return {
    ...check,
    teacherVerified: row.teacherVerified,
    requiresTeacherVerification: activity.requiresTeacherVerification,
  };
}

/** Teacher confirms (or un-confirms) a student's link activity; gates follow. */
export async function setCompletionVerified(
  activityId: string,
  studentId: string,
  verified: boolean
): Promise<void> {
  await db
    .update(schema.activityCompletions)
    .set({ teacherVerified: verified })
    .where(
      and(
        eq(schema.activityCompletions.activityId, activityId),
        eq(schema.activityCompletions.studentId, studentId)
      )
    );
  await recomputeGatesForStudent(studentId);
}

/** After a pin or publish change: every student with a final score on the assignment(s). */
export async function recomputeGatesForAssignment(assignmentId: string): Promise<void> {
  const rows = await db
    .select({ studentId: schema.assignmentFinalScores.studentId })
    .from(schema.assignmentFinalScores)
    .where(eq(schema.assignmentFinalScores.assignmentId, assignmentId));
  for (const r of rows) await recomputeGates(assignmentId, r.studentId);
}
