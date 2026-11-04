/**
 * Server-only practice checks (ticket R3; the rules are `src/lib/practice-check.ts` and
 * `src/lib/relearning-path.ts`): open the check the path asks for, deal its rounds from the
 * targets' Practice banks, keep each question's first answer, and when a round passes, mark the
 * check passed and recompute the final score (the path's raise and a test's gates follow).
 * Callers pass the guards first. Nothing here writes a score directly.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CheckAnswer, CheckServedQuestion, ServedQuestion } from "@/db/types";
import { recomputeFinalScore } from "@/lib/attempts";
import { bankKind } from "@/lib/bank-kinds";
import type { Answer } from "@/lib/grading";
import {
  buildFeedback,
  loadFeedbackQuestions,
  serveQuestions,
  type PracticeFeedback,
} from "@/lib/practice";
import { checkable, dealCheck, scoreRound, type CheckCandidate } from "@/lib/practice-check";
import { getPathState } from "@/lib/queries/relearning-path";

/** A refusal the student sees, with its HTTP status. */
export class CheckError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 = 409
  ) {
    super(message);
    this.name = "CheckError";
  }
}

/**
 * The questions a check may deal for these targets (P1): live, auto-graded questions tagged to a
 * target, in a Practice bank (`bankKind`) of the target's course; never Quiz, Test or Retake banks.
 */
export async function loadCheckCandidates(targetIds: string[]): Promise<CheckCandidate[]> {
  if (targetIds.length === 0) return [];
  const courses = await db
    .selectDistinct({ courseId: schema.learningTargets.courseId })
    .from(schema.learningTargets)
    .where(inArray(schema.learningTargets.id, targetIds));
  if (courses.length === 0) return [];
  const banks = (
    await db
      .select({
        id: schema.questionBanks.id,
        name: schema.questionBanks.name,
        kind: schema.questionBanks.kind,
      })
      .from(schema.questionBanks)
      .where(
        inArray(
          schema.questionBanks.courseId,
          courses.map((c) => c.courseId)
        )
      )
  ).filter((b) => bankKind(b) === "practice");
  if (banks.length === 0) return [];
  const rows = await db
    .select({
      questionId: schema.questions.id,
      points: schema.questions.points,
      difficulty: schema.questions.difficulty,
      type: schema.questions.type,
      grading: schema.questions.grading,
      targetId: schema.questionTargets.learningTargetId,
    })
    .from(schema.questions)
    .innerJoin(schema.questionTargets, eq(schema.questionTargets.questionId, schema.questions.id))
    .where(
      and(
        inArray(
          schema.questions.bankId,
          banks.map((b) => b.id)
        ),
        eq(schema.questions.isArchived, false),
        inArray(schema.questionTargets.learningTargetId, targetIds)
      )
    );
  const by = new Map<string, CheckCandidate>();
  for (const r of rows) {
    if (!checkable(r)) continue;
    const c = by.get(r.questionId);
    if (c) c.targetIds.push(r.targetId);
    else
      by.set(r.questionId, {
        questionId: r.questionId,
        points: r.points,
        difficulty: r.difficulty,
        type: r.type,
        targetIds: [r.targetId],
      });
  }
  return [...by.values()];
}

/** Every question this student has been served in a check, any check (P1: unseen first). */
async function seenInChecks(studentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ questionSet: schema.practiceCheckRounds.questionSet })
    .from(schema.practiceCheckRounds)
    .innerJoin(
      schema.practiceChecks,
      eq(schema.practiceCheckRounds.checkId, schema.practiceChecks.id)
    )
    .where(eq(schema.practiceChecks.studentId, studentId));
  return new Set(rows.flatMap((r) => r.questionSet.map((q) => q.questionId)));
}

/** A check round's served question, in the shape grading and the sanitizer read. */
export function asServed(checkId: string, q: CheckServedQuestion): ServedQuestion {
  return {
    questionId: q.questionId,
    sectionId: checkId,
    learningTargetId: q.learningTargetId,
    points: q.points,
    order: q.order,
    ...(q.optionOrder ? { optionOrder: q.optionOrder } : {}),
  };
}

/**
 * Open the check the path asks for, or the one already open, and make sure it has a round to
 * answer (a finished round that didn't pass waits for "Try a new 5"). Rules: the assignment is on
 * the path for this student; a path check follows a relearning bundle whose relearning is all
 * finished (`practice` current, P5); an attempt check is the fresh one before the next attempt
 * (Q6). One check per bundle and per attempt.
 */
export async function openPracticeCheck(input: {
  assignmentId: string;
  studentId: string;
  kind: "path" | "attempt";
  bundleId?: string | null;
}): Promise<{ checkId: string }> {
  const ctx = await getPathState(input.assignmentId, input.studentId);
  if (!ctx) throw new CheckError("This assignment doesn't use the relearning path.", 409);
  const { state } = ctx;
  let targetIds: string[];
  let bundleId: string | null = null;
  let unlocks: number | null = null;
  if (input.kind === "path") {
    const open = state.targets.filter(
      (t) => t.onPath && t.bundleId && (!input.bundleId || t.bundleId === input.bundleId)
    );
    // The bundle asked for, else the first one ready for its check, else one already passed.
    bundleId =
      input.bundleId ??
      open.find((t) => t.practice === "current")?.bundleId ??
      open.find((t) => t.practice === "done")?.bundleId ??
      null;
    const bundle = open.filter((t) => t.bundleId === bundleId);
    if (!bundleId || bundle.length === 0)
      throw new CheckError("Finish your relearning first; the practice check opens after it.");
    if (bundle.every((t) => t.practice === "done"))
      throw new CheckError("You already passed this practice check.");
    if (bundle.some((t) => t.practice === "locked"))
      throw new CheckError("Finish your relearning first; the practice check opens after it.");
    targetIds = bundle.map((t) => t.id);
  } else {
    const fresh = state.attemptCheck;
    if (!fresh || fresh.passed)
      throw new CheckError("There's no practice check to take before your next attempt.");
    targetIds = fresh.targetIds;
    unlocks = fresh.attemptNumber;
  }

  const c = schema.practiceChecks;
  const mine = and(eq(c.assignmentId, input.assignmentId), eq(c.studentId, input.studentId));
  const find = () =>
    db.query.practiceChecks.findFirst({
      where: and(
        mine,
        input.kind === "path"
          ? and(eq(c.purpose, "path"), eq(c.relearningBundleId, bundleId!))
          : and(eq(c.purpose, "attempt"), eq(c.unlocksAttemptNumber, unlocks!))
      ),
    });
  let check = await find();
  if (!check) {
    await db
      .insert(c)
      .values({
        assignmentId: input.assignmentId,
        studentId: input.studentId,
        purpose: input.kind,
        targetIds,
        relearningBundleId: bundleId,
        unlocksAttemptNumber: unlocks,
        passMark: ctx.assignment.passMark,
      })
      .onConflictDoNothing();
    check = await find();
  }
  if (!check) throw new Error("practice check not created");
  if (check.passedAt) throw new CheckError("You already passed this practice check.");
  const latest = await latestRound(check.id);
  if (!latest) await dealRound(check.id);
  return { checkId: check.id };
}

async function latestRound(checkId: string) {
  return db.query.practiceCheckRounds.findFirst({
    where: eq(schema.practiceCheckRounds.checkId, checkId),
    orderBy: [desc(schema.practiceCheckRounds.number)],
  });
}

/**
 * "Try a new 5" (P3): a fresh round once the last one is finished and didn't pass. Refused while a
 * round is still open, and once the check has passed.
 */
export async function nextRound(checkId: string): Promise<{ roundId: string }> {
  const check = await db.query.practiceChecks.findFirst({
    where: eq(schema.practiceChecks.id, checkId),
  });
  if (!check) throw new CheckError("That check doesn't exist.", 404);
  if (check.passedAt) throw new CheckError("You already passed this practice check.");
  const latest = await latestRound(checkId);
  if (latest && !latest.finishedAt) return { roundId: latest.id };
  return dealRound(checkId);
}

/** Deal and store the next round of a check. */
async function dealRound(checkId: string): Promise<{ roundId: string }> {
  const check = (await db.query.practiceChecks.findFirst({
    where: eq(schema.practiceChecks.id, checkId),
  }))!;
  const ctx = await getPathState(check.assignmentId, check.studentId);
  const percentOf = new Map(ctx?.state.targets.map((t) => [t.id, t.firstPercent]) ?? []);
  const orderOf = new Map(ctx?.state.targets.map((t) => [t.id, t.sortOrder]) ?? []);
  const [candidates, seen] = await Promise.all([
    loadCheckCandidates(check.targetIds),
    seenInChecks(check.studentId),
  ]);
  const deal = dealCheck({
    targets: check.targetIds.map((id) => ({
      id,
      percent: percentOf.get(id) ?? 0,
      sortOrder: orderOf.get(id) ?? 0,
    })),
    candidates,
    seen,
    rng: Math.random,
  });
  if (deal.questions.length === 0)
    throw new CheckError("There are no practice questions for this target yet. Tell your teacher.");
  // Ordering and matching options are shuffled, choice options keep the author's order (as practice).
  const served = await serveQuestions(
    deal.questions.map((q) => ({
      questionId: q.questionId,
      points: q.points,
      stimulusId: null,
      targetIds: [q.learningTargetId],
    })),
    checkId,
    new Set(check.targetIds)
  );
  const questionSet: CheckServedQuestion[] = served.map((s, i) => ({
    questionId: s.questionId,
    learningTargetId: deal.questions[i].learningTargetId,
    band: deal.questions[i].band,
    order: i + 1,
    points: s.points,
    ...(s.optionOrder ? { optionOrder: s.optionOrder } : {}),
  }));
  const latest = await latestRound(checkId);
  const [round] = await db
    .insert(schema.practiceCheckRounds)
    .values({ checkId, number: (latest?.number ?? 0) + 1, questionSet })
    .returning({ id: schema.practiceCheckRounds.id });
  return { roundId: round.id };
}

export type CheckAnswerResult = {
  feedback: PracticeFeedback;
  /** The question already had its first answer: nothing changed (P2). */
  alreadyAnswered: boolean;
  round: {
    answered: number;
    total: number;
    finished: boolean;
    score: number | null;
    passed: boolean;
  };
};

/**
 * Take a question's first answer (P2): graded on the spot, right or wrong shown with the
 * explanation, never changed afterwards. Answering the last question finishes the round; a round
 * at the pass mark passes the check, and the final score is recomputed so the path moves on.
 */
export async function answerCheckQuestion(
  roundId: string,
  questionId: string,
  answer: Answer
): Promise<CheckAnswerResult> {
  const round = await db.query.practiceCheckRounds.findFirst({
    where: eq(schema.practiceCheckRounds.id, roundId),
  });
  if (!round) throw new CheckError("That round doesn't exist.", 404);
  const check = (await db.query.practiceChecks.findFirst({
    where: eq(schema.practiceChecks.id, round.checkId),
  }))!;
  const item = round.questionSet.find((q) => q.questionId === questionId);
  if (!item) throw new CheckError("That question isn't in this round.", 404);
  const q = (await loadFeedbackQuestions([questionId])).get(questionId);
  if (!q) throw new Error("question missing");
  const served = asServed(check.id, item);
  const answers = round.answers as Record<string, CheckAnswer>;
  const ids = round.questionSet.map((s) => s.questionId);
  const status = (a: Record<string, CheckAnswer>) => {
    const s = scoreRound(ids, a, check.passMark);
    return {
      answered: s.answered,
      total: ids.length,
      finished: s.finished,
      score: s.score,
      passed: s.passed,
    };
  };
  const prior = answers[questionId];
  if (prior)
    return {
      feedback: buildFeedback(q, served, prior.answer as Answer),
      alreadyAnswered: true,
      round: status(answers),
    };
  if (round.finishedAt) throw new CheckError("This round is finished.");

  const feedback = buildFeedback(q, served, answer);
  const now = new Date();
  const updated: Record<string, CheckAnswer> = {
    ...answers,
    [questionId]: { answer, correct: feedback.isCorrect === true, answeredAt: now.toISOString() },
  };
  const s = status(updated);
  await db
    .update(schema.practiceCheckRounds)
    .set({
      answers: updated,
      ...(s.finished ? { score: s.score, finishedAt: now } : {}),
    })
    .where(eq(schema.practiceCheckRounds.id, roundId));
  if (s.finished && s.passed && !check.passedAt) {
    await db
      .update(schema.practiceChecks)
      .set({ passedAt: now })
      .where(eq(schema.practiceChecks.id, check.id));
    await recomputeFinalScore(check.assignmentId, check.studentId);
  }
  return { feedback, alreadyAnswered: false, round: s };
}

/** Rounds of a student's checks on one assignment, newest first (the relearning monitor, R5). */
export async function listCheckRounds(assignmentId: string, studentId: string) {
  return db
    .select({
      checkId: schema.practiceChecks.id,
      purpose: schema.practiceChecks.purpose,
      targetIds: schema.practiceChecks.targetIds,
      passedAt: schema.practiceChecks.passedAt,
      number: schema.practiceCheckRounds.number,
      score: schema.practiceCheckRounds.score,
      finishedAt: schema.practiceCheckRounds.finishedAt,
    })
    .from(schema.practiceCheckRounds)
    .innerJoin(
      schema.practiceChecks,
      eq(schema.practiceCheckRounds.checkId, schema.practiceChecks.id)
    )
    .where(
      and(
        eq(schema.practiceChecks.assignmentId, assignmentId),
        eq(schema.practiceChecks.studentId, studentId),
        isNotNull(schema.practiceCheckRounds.finishedAt)
      )
    )
    .orderBy(asc(schema.practiceCheckRounds.finishedAt));
}
