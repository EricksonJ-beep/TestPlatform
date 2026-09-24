/**
 * Server-only attempt lifecycle: build and store the served set, grade a
 * submission with the pure grading library, and keep the "highest counts"
 * final score current. Every score in the database is written here, never by
 * a student-facing action directly (PHASE1.md: "every score is written by
 * server code").
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ServedQuestion } from "@/db/types";
import { buildQuestionSet } from "@/lib/assessments/serve";
import { attemptDueAt } from "@/lib/assignments";
import {
  computeFinalScore,
  gradeResponse,
  scoreAttempt,
  type Answer,
  type AttemptScore,
  type AttemptSummary,
  type ResponseRecord,
} from "@/lib/grading";
import { recomputeGates } from "@/lib/gates";
import { loadBuilderSections } from "@/lib/queries/assessments";
import { loadGradableQuestions } from "@/lib/queries/attempts";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Create the next attempt for a student: the exact question set (fixed items,
 * pool draws avoiding questions seen on earlier attempts, randomization per the
 * assessment), option order, and the deadline with accommodations.
 */
export async function createAttempt(input: {
  assignmentId: string;
  studentId: string;
  scope?: string[] | null;
  now?: Date;
}): Promise<{ attemptId: string; number: number; dueAt: Date | null }> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      assessmentId: schema.assignments.assessmentId,
      classId: schema.assignments.classId,
      timeLimitMinutes: schema.assignments.timeLimitMinutes,
      closesAt: schema.assignments.closesAt,
      randomizeQuestions: schema.assessments.randomizeQuestions,
      randomizeOptions: schema.assessments.randomizeOptions,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, input.assignmentId))
    .limit(1);
  if (!row) throw new Error("assignment not found");

  const prior = await db
    .select({ number: schema.attempts.number, questionSet: schema.attempts.questionSet })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, input.assignmentId),
        eq(schema.attempts.studentId, input.studentId)
      )
    );
  const seen = new Set(prior.flatMap((p) => p.questionSet.map((q) => q.questionId)));
  const number = prior.reduce((n, p) => Math.max(n, p.number), 0) + 1;

  const sections = await loadBuilderSections(row.assessmentId);
  const served = buildQuestionSet(sections, {
    randomizeQuestions: row.randomizeQuestions,
    scope: input.scope ?? null,
    avoidQuestionIds: seen,
  });
  if (served.length === 0) throw new Error("empty");

  // Option order: shuffled for choice types when the assessment says so; always for ordering and matching.
  const types = await db
    .select({ id: schema.questions.id, type: schema.questions.type })
    .from(schema.questions)
    .where(
      inArray(
        schema.questions.id,
        served.map((s) => s.questionId)
      )
    );
  const optionRows = await db
    .select({ id: schema.questionOptions.id, questionId: schema.questionOptions.questionId })
    .from(schema.questionOptions)
    .where(
      inArray(
        schema.questionOptions.questionId,
        served.map((s) => s.questionId)
      )
    )
    .orderBy(schema.questionOptions.sortOrder);
  const typeBy = new Map(types.map((t) => [t.id, t.type]));
  const optionsBy = new Map<string, string[]>();
  for (const o of optionRows)
    (optionsBy.get(o.questionId) ?? optionsBy.set(o.questionId, []).get(o.questionId)!).push(o.id);
  const questionSet: ServedQuestion[] = served.map((s) => {
    const type = typeBy.get(s.questionId);
    const always = type === "ordering" || type === "matching";
    const shufflable = type === "multiple_choice" || type === "multiple_select";
    const ids = optionsBy.get(s.questionId) ?? [];
    return always || (shufflable && row.randomizeOptions) ? { ...s, optionOrder: shuffle(ids) } : s;
  });

  const enrollment = await db.query.enrollments.findFirst({
    columns: { extraTimePercent: true },
    where: and(
      eq(schema.enrollments.classId, row.classId),
      eq(schema.enrollments.studentId, input.studentId)
    ),
  });
  const dueAt = attemptDueAt({
    startedAt: now,
    timeLimitMinutes: row.timeLimitMinutes,
    extraTimePercent: enrollment?.extraTimePercent ?? 0,
    closesAt: row.closesAt,
  });
  const [attempt] = await db
    .insert(schema.attempts)
    .values({
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      number,
      scope: input.scope ?? null,
      questionSet,
      startedAt: now,
      dueAt,
    })
    .returning({ id: schema.attempts.id });
  return { attemptId: attempt.id, number, dueAt };
}

/**
 * Grade every served question (blank = wrong), write response scores, the
 * attempt totals, per-target scores, and the assignment's final score.
 * Idempotent: safe to call again after a manual grade or override.
 */
export async function finalizeAttempt(attemptId: string, now = new Date()): Promise<AttemptScore> {
  const attempt = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) });
  if (!attempt) throw new Error("attempt not found");
  const items = attempt.questionSet;
  const questions = await loadGradableQuestions(items.map((i) => i.questionId));
  const existing = await db
    .select()
    .from(schema.responses)
    .where(eq(schema.responses.attemptId, attemptId));
  const byQ = new Map(existing.map((r) => [r.questionId, r]));

  const records = new Map<string, ResponseRecord>();
  for (const item of items) {
    const q = questions.get(item.questionId);
    if (!q) continue;
    const prev = byQ.get(item.questionId);
    const answer = (prev?.answer as Answer | null) ?? null;
    const result = gradeResponse({ ...q, points: item.points }, answer);
    const autoScore = result.pointsEarned;
    if (prev) {
      await db
        .update(schema.responses)
        .set({ autoScore, isCorrect: result.isCorrect })
        .where(eq(schema.responses.id, prev.id));
    } else {
      await db.insert(schema.responses).values({
        attemptId,
        questionId: item.questionId,
        answer: null,
        autoScore,
        isCorrect: result.isCorrect,
      });
    }
    records.set(item.questionId, {
      questionId: item.questionId,
      answer,
      autoScore,
      manualScore: prev?.manualScore ?? null,
    });
  }

  const score = scoreAttempt(items, records);
  await db
    .update(schema.attempts)
    .set({
      score: score.totalEarned,
      maxScore: score.totalPossible,
      percent: score.percent,
      status: score.pendingManual > 0 ? "submitted" : "graded",
      submittedAt: attempt.submittedAt ?? now,
      gradedAt: score.pendingManual > 0 ? null : now,
    })
    .where(eq(schema.attempts.id, attemptId));
  await db
    .delete(schema.attemptTargetScores)
    .where(eq(schema.attemptTargetScores.attemptId, attemptId));
  if (score.perTarget.length) {
    await db.insert(schema.attemptTargetScores).values(
      score.perTarget.map((t) => ({
        attemptId,
        learningTargetId: t.learningTargetId,
        pointsEarned: t.pointsEarned,
        pointsPossible: t.pointsPossible,
        percent: t.percent,
      }))
    );
  }
  await recomputeFinalScore(attempt.assignmentId, attempt.studentId);
  return score;
}

/** Highest counts (PLAN.md §2): per target for summatives, best attempt otherwise. */
export async function recomputeFinalScore(assignmentId: string, studentId: string): Promise<void> {
  const [asg] = await db
    .select({
      type: schema.assessments.type,
      retakeThreshold: schema.assignments.retakeThreshold,
      tier2Max: schema.assignments.tier2Max,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg) return;
  const attempts = await db
    .select({
      id: schema.attempts.id,
      number: schema.attempts.number,
      score: schema.attempts.score,
      maxScore: schema.attempts.maxScore,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    );
  if (attempts.length === 0) {
    await db
      .delete(schema.assignmentFinalScores)
      .where(
        and(
          eq(schema.assignmentFinalScores.assignmentId, assignmentId),
          eq(schema.assignmentFinalScores.studentId, studentId)
        )
      );
    return;
  }
  const targetRows = await db
    .select()
    .from(schema.attemptTargetScores)
    .where(
      inArray(
        schema.attemptTargetScores.attemptId,
        attempts.map((a) => a.id)
      )
    );
  const summaries: AttemptSummary[] = attempts.map((a) => ({
    attemptId: a.id,
    number: a.number,
    totalEarned: a.score ?? 0,
    totalPossible: a.maxScore ?? 0,
    perTarget: targetRows
      .filter((t) => t.attemptId === a.id)
      .map((t) => ({
        learningTargetId: t.learningTargetId,
        pointsEarned: t.pointsEarned,
        pointsPossible: t.pointsPossible,
        percent: t.percent,
      })),
  }));
  const final = computeFinalScore(asg.type, summaries, {
    threshold: asg.retakeThreshold,
    tier2Max: asg.tier2Max,
  });
  const values = {
    perTarget: final.perTarget,
    totalEarned: final.totalEarned,
    totalPossible: final.totalPossible,
    percent: final.percent,
    tier: final.tier,
    targetsBelowThreshold: final.targetsBelowThreshold.length,
    computedAt: new Date(),
  };
  await db
    .insert(schema.assignmentFinalScores)
    .values({ assignmentId, studentId, ...values })
    .onConflictDoUpdate({
      target: [schema.assignmentFinalScores.assignmentId, schema.assignmentFinalScores.studentId],
      set: values,
    });
  await recomputeGates(assignmentId, studentId);
}
