/**
 * Server-only attempt lifecycle: build and store the served set, grade a
 * submission with the pure grading library, and keep the "highest counts"
 * final score current. Every score in the database is written here, never by
 * a student-facing action directly (PHASE1.md: "every score is written by
 * server code").
 */
import { and, asc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ServedQuestion } from "@/db/types";
import { buildQuestionSet } from "@/lib/assessments/serve";
import { attemptDueAt } from "@/lib/assignments";
import {
  computeFinalScore,
  correctionsCapOn,
  gradeResponse,
  scoreAttempt,
  type Answer,
  type AttemptScore,
  type AttemptSummary,
  type FinalScore,
  type ResponseRecord,
} from "@/lib/grading";
import { recomputeGates } from "@/lib/gates";
import { loadBuilderSections } from "@/lib/queries/assessments";
import { loadGradableQuestions } from "@/lib/queries/attempts";
import { getCorrectionsSummary } from "@/lib/queries/corrections";
import { getPathState } from "@/lib/queries/relearning-path";
import { openUntilFor } from "@/lib/queries/reopen";
import { usesPathRules } from "@/lib/relearning-path";
import { effectiveClose } from "@/lib/reopen";

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
 * assessment), option order, and the deadline with accommodations, capped at the
 * student's close: a retake the teacher approved after the close runs to its
 * reopen's end, never already past due (Jon, Oct 14 2026, R5).
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
  const openUntil = row.closesAt
    ? await openUntilFor(input.assignmentId, input.studentId, number)
    : null;
  const dueAt = attemptDueAt({
    startedAt: now,
    timeLimitMinutes: row.timeLimitMinutes,
    extraTimePercent: enrollment?.extraTimePercent ?? 0,
    closesAt: effectiveClose(row.closesAt, openUntil),
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
      lastActiveAt: now,
    })
    .returning({ id: schema.attempts.id });
  return { attemptId: attempt.id, number, dueAt };
}

/** How long a claim (below) is left alone before someone else may finish the grading. */
export const CLAIM_STALE_MS = 20_000;

export type ClaimOutcome = "claimed" | "busy" | "done" | "paused" | "missing";

/**
 * Claim an open attempt for grading (H1.4, Nov 9 2026). One conditional UPDATE, so of two
 * submits (two tabs, a double-click, the countdown and the button) exactly one grades.
 *
 * The claim is `submitted_at` set while the status is still in progress, with `last_active_at`
 * as its clock. A claim whose grading never finished (the database dropped midway) goes stale
 * after 20 seconds and can be claimed again, so the attempt is finished by the student's next
 * submit, their next visit, or the sweep. A claimed attempt takes no more answers and never pauses.
 */
export async function claimAttempt(
  attemptId: string,
  submittedAt: Date,
  now = new Date()
): Promise<ClaimOutcome> {
  const stale = new Date(now.getTime() - CLAIM_STALE_MS);
  const [row] = await db
    .update(schema.attempts)
    .set({
      submittedAt: sql`coalesce(${schema.attempts.submittedAt}, ${submittedAt.toISOString()}::timestamptz)`,
      lastActiveAt: now,
    })
    .where(
      and(
        eq(schema.attempts.id, attemptId),
        eq(schema.attempts.status, "in_progress"),
        isNull(schema.attempts.pausedAt),
        or(isNull(schema.attempts.submittedAt), lt(schema.attempts.lastActiveAt, stale))
      )
    )
    .returning({ id: schema.attempts.id });
  if (row) return "claimed";
  const cur = await db.query.attempts.findFirst({
    columns: { status: true, pausedAt: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!cur) return "missing";
  if (cur.status !== "in_progress") return "done";
  return cur.pausedAt ? "paused" : "busy";
}

/**
 * An attempt that was claimed but never graded is finished here. Returns what the attempt is
 * now: `open` (never claimed: carry on), `finished`, or `grading` (someone is on it right now).
 */
export async function finishIfClaimed(
  attemptId: string,
  now = new Date()
): Promise<"open" | "finished" | "grading"> {
  const cur = await db.query.attempts.findFirst({
    columns: { status: true, submittedAt: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!cur || cur.status !== "in_progress") return "finished";
  if (!cur.submittedAt) return "open";
  const outcome = await claimAttempt(attemptId, cur.submittedAt, now);
  if (outcome === "claimed") {
    await finalizeAttempt(attemptId, cur.submittedAt);
    return "finished";
  }
  return outcome === "done" ? "finished" : "grading";
}

/** True for Postgres's unique-violation error, whichever driver raised it. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    const o = e as { code?: unknown; cause?: unknown };
    if (o.code === "23505") return true;
    e = o.cause;
  }
  return false;
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

  // Every response score in one statement, then the target scores, and the status last
  // (H1.4, Nov 9 2026): a failure partway leaves the attempt still open to be finished by the
  // next submit or the sweep, never "graded" with scores missing.
  const records = new Map<string, ResponseRecord>();
  const graded: Array<{
    attemptId: string;
    questionId: string;
    answer: null;
    autoScore: number | null;
    isCorrect: boolean | null;
  }> = [];
  for (const item of items) {
    const q = questions.get(item.questionId);
    if (!q) continue;
    const prev = byQ.get(item.questionId);
    const answer = (prev?.answer as Answer | null) ?? null;
    const result = gradeResponse({ ...q, points: item.points }, answer);
    const autoScore = result.pointsEarned;
    graded.push({
      attemptId,
      questionId: item.questionId,
      answer: null,
      autoScore,
      isCorrect: result.isCorrect,
    });
    records.set(item.questionId, {
      questionId: item.questionId,
      answer,
      autoScore,
      manualScore: prev?.manualScore ?? null,
    });
  }
  // A row that exists keeps its answer; only the scores are written.
  for (let i = 0; i < graded.length; i += 200) {
    await db
      .insert(schema.responses)
      .values(graded.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: { autoScore: sql`excluded.auto_score`, isCorrect: sql`excluded.is_correct` },
      });
  }

  const score = scoreAttempt(items, records);
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
  await recomputeFinalScore(attempt.assignmentId, attempt.studentId);
  return score;
}

/**
 * Highest counts (PLAN.md §2): per target for summatives, best attempt otherwise; the corrections
 * cap on formatives, never in a course with CVTC rules (Jon, Oct 13 2026). A quiz on the
 * relearning path (Nov 4 2026) counts per target, with the path's raises (`pathFor`, Q1–Q2).
 */
export async function recomputeFinalScore(assignmentId: string, studentId: string): Promise<void> {
  const [asg] = await db
    .select({
      type: schema.assessments.type,
      retakeThreshold: schema.assignments.retakeThreshold,
      tier2Max: schema.assignments.tier2Max,
      correctionsCap: schema.assignments.correctionsCap,
      cvtcRules: schema.courses.cvtcRules,
      relearningPathFrom: schema.courses.relearningPathFrom,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg) return;
  const attempts = await db
    .select({
      id: schema.attempts.id,
      number: schema.attempts.number,
      score: schema.attempts.score,
      maxScore: schema.attempts.maxScore,
      submittedAt: schema.attempts.submittedAt,
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
    // Nothing finished: no final score, and no retake gates (they hang off attempt 1).
    await db
      .delete(schema.assignmentFinalScores)
      .where(
        and(
          eq(schema.assignmentFinalScores.assignmentId, assignmentId),
          eq(schema.assignmentFinalScores.studentId, studentId)
        )
      );
    await db
      .delete(schema.retakeGates)
      .where(
        and(
          eq(schema.retakeGates.assignmentId, assignmentId),
          eq(schema.retakeGates.studentId, studentId)
        )
      );
    // The score trail starts again with the next attempt 1 (R7).
    await db
      .delete(schema.scoreHistory)
      .where(
        and(
          eq(schema.scoreHistory.assignmentId, assignmentId),
          eq(schema.scoreHistory.studentId, studentId)
        )
      );
    return;
  }
  const firstNumber = Math.min(...attempts.map((a) => a.number));
  const firstAttempt = attempts.find((a) => a.number === firstNumber)!;
  // The relearning path (Nov 4 2026): a quiz on it counts per target with the path's raises; the
  // loader leaves out an untagged quiz, which keeps the v2 count below.
  const onPath =
    asg.type === "formative" &&
    usesPathRules({
      type: asg.type,
      cvtcRules: asg.cvtcRules,
      relearningPathFrom: asg.relearningPathFrom,
      firstSubmittedAt: firstAttempt.submittedAt,
    });
  const pathFinal = onPath ? (await getPathState(assignmentId, studentId))?.state.final : null;
  let final: FinalScore;
  if (pathFinal) {
    final = {
      totalEarned: pathFinal.totalEarned,
      totalPossible: pathFinal.totalPossible,
      percent: pathFinal.percent,
      perTarget: pathFinal.perTarget,
      bestAttemptId: pathFinal.bestAttemptId,
      targetsBelowThreshold: [],
      tier: null,
      basis: pathFinal.basis,
    };
  } else {
    const targetRows = await db
      .select()
      .from(schema.attemptTargetScores)
      .where(
        inArray(
          schema.attemptTargetScores.attemptId,
          attempts.map((a) => a.id)
        )
      );
    // Corrections cap (Jon, Oct 8 2026): attempt 1's finished corrections lift its score, except in
    // a course with CVTC rules, where corrections earn no credit (Jon, Oct 13 2026).
    const capped = correctionsCapOn(asg);
    let firstApproved = false;
    if (capped) {
      const summary = await getCorrectionsSummary(firstAttempt.id);
      firstApproved = summary?.state === "approved";
    }
    const summaries: AttemptSummary[] = attempts.map((a) => ({
      attemptId: a.id,
      number: a.number,
      totalEarned: a.score ?? 0,
      totalPossible: a.maxScore ?? 0,
      correctionsApproved: capped && a.number === firstNumber ? firstApproved : false,
      perTarget: targetRows
        .filter((t) => t.attemptId === a.id)
        .map((t) => ({
          learningTargetId: t.learningTargetId,
          pointsEarned: t.pointsEarned,
          pointsPossible: t.pointsPossible,
          percent: t.percent,
        })),
    }));
    final = computeFinalScore(asg.type, summaries, {
      threshold: asg.retakeThreshold,
      tier2Max: asg.tier2Max,
      correctionsCap: capped,
    });
  }
  const existing = await db.query.assignmentFinalScores.findFirst({
    columns: { tier: true, previousTier: true, tierChangedAt: true, percent: true },
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, assignmentId),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  });
  const now = new Date();
  // A tier change is remembered (PLAN.md §3.11 "moved up today"); a recompute that keeps the tier keeps the history.
  const tierChanged = !!existing && existing.tier !== null && existing.tier !== final.tier;
  const values = {
    perTarget: final.perTarget,
    totalEarned: final.totalEarned,
    totalPossible: final.totalPossible,
    percent: final.percent,
    tier: final.tier,
    previousTier: tierChanged ? existing!.tier : (existing?.previousTier ?? null),
    tierChangedAt: tierChanged ? now : (existing?.tierChangedAt ?? null),
    targetsBelowThreshold: final.targetsBelowThreshold.length,
    basis: final.basis,
    computedAt: now,
  };
  await db
    .insert(schema.assignmentFinalScores)
    .values({ assignmentId, studentId, ...values })
    .onConflictDoUpdate({
      target: [schema.assignmentFinalScores.assignmentId, schema.assignmentFinalScores.studentId],
      set: values,
    });
  // The score trail (R7, G1): every change to the counting percent, with how it came about.
  if (!existing || Math.abs(existing.percent - final.percent) >= 0.005)
    await db
      .insert(schema.scoreHistory)
      .values({ assignmentId, studentId, percent: final.percent, basis: final.basis, at: now });
  await recomputeGates(assignmentId, studentId);
}

/**
 * Remove one attempt entirely (a student started the test again by accident,
 * or a run needs wiping). Responses, per-target scores, and corrections go
 * with it by cascade; later attempts move down a number so "attempt 1" keeps
 * meaning the first one; the final score and retake gates recompute from what
 * is left. Callers pass the teacher guard first.
 */
export async function deleteAttempt(
  attemptId: string
): Promise<{ assignmentId: string; studentId: string; number: number }> {
  const attempt = await db.query.attempts.findFirst({
    columns: { id: true, assignmentId: true, studentId: true, number: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new Error("attempt not found");
  await db.delete(schema.attempts).where(eq(schema.attempts.id, attemptId));
  const later = await db
    .select({ id: schema.attempts.id, number: schema.attempts.number })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, attempt.assignmentId),
        eq(schema.attempts.studentId, attempt.studentId),
        gt(schema.attempts.number, attempt.number)
      )
    )
    .orderBy(asc(schema.attempts.number));
  // Ascending order: each move lands on the number just freed, so the unique index never trips.
  for (const a of later) {
    await db
      .update(schema.attempts)
      .set({ number: a.number - 1 })
      .where(eq(schema.attempts.id, a.id));
  }
  await recomputeFinalScore(attempt.assignmentId, attempt.studentId);
  return {
    assignmentId: attempt.assignmentId,
    studentId: attempt.studentId,
    number: attempt.number,
  };
}
