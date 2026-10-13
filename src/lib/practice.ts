/**
 * Server-only practice lifecycle (PLAN.md §3.7, Ticket 1.13): serve a practice
 * set, check each answer the moment it lands (Apps Script style since Oct 13
 * 2026: try again after a miss, a hint after three, reveal any time), mark the
 * attempt complete when every question is closed, record activity
 * completions, and recompute retake gates after each completion. Nothing here
 * is a grade: practice never counts.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompletionEvidence, ServedQuestion } from "@/db/types";
import { dealByDifficulty, type PoolQuestion } from "@/lib/assessments/serve";
import { recomputeGates, recomputeGatesForStudent } from "@/lib/gates";
import {
  correctAnswerText,
  gradeResponse,
  type Answer,
  type GradableQuestion,
} from "@/lib/grading";
import {
  checkActivityCompletion,
  hintUnlocked,
  isClosed,
  practiceProgress,
  recordCheck,
  recordReveal,
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

type DealQuestion = PoolQuestion & { difficulty: number };

/** Attach each question's target ids; the draw uses them to label the served item. */
async function withTargets(
  rows: { questionId: string; points: number; stimulusId: string | null; difficulty: number }[]
): Promise<DealQuestion[]> {
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

/** Live questions in a pool with what a draw needs. */
export async function loadPoolQuestions(poolId: string): Promise<DealQuestion[]> {
  const rows = await db
    .select({
      questionId: schema.questions.id,
      points: schema.questions.points,
      stimulusId: schema.questions.stimulusId,
      difficulty: schema.questions.difficulty,
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
  return withTargets(rows);
}

/**
 * Live questions in a bank with what a draw needs (Jon, Oct 12 2026: a practice
 * set can deal from a whole bank). Archived rows, old versions among them, stay
 * out, so an edited question is served in its newest form.
 */
export async function loadBankQuestions(bankId: string): Promise<DealQuestion[]> {
  const rows = await db
    .select({
      questionId: schema.questions.id,
      points: schema.questions.points,
      stimulusId: schema.questions.stimulusId,
      difficulty: schema.questions.difficulty,
    })
    .from(schema.questions)
    .where(and(eq(schema.questions.bankId, bankId), eq(schema.questions.isArchived, false)));
  return withTargets(rows);
}

/**
 * Start (or resume) a practice attempt. Rule: a fixed set serves every
 * question in the teacher's order; a pool or bank set deals `drawCount`
 * across difficulty (easy → medium → hard, see dealByDifficulty), preferring
 * questions this student hasn't seen on earlier attempts of the set, so every
 * attempt is a fresh hand until the source runs out. Ordering
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
  const drawFrom = set.poolId
    ? { kind: "pool" as const, id: set.poolId }
    : set.bankId
      ? { kind: "bank" as const, id: set.bankId }
      : null;
  if (drawFrom) {
    const pool =
      drawFrom.kind === "pool"
        ? await db.query.questionPools.findFirst({
            columns: { drawStimulusGroups: true },
            where: eq(schema.questionPools.id, drawFrom.id),
          })
        : null;
    const questions =
      drawFrom.kind === "pool"
        ? await loadPoolQuestions(drawFrom.id)
        : await loadBankQuestions(drawFrom.id);
    const prior = await db.query.practiceAttempts.findMany({
      columns: { questionSet: true },
      where: and(
        eq(schema.practiceAttempts.practiceSetId, practiceSetId),
        eq(schema.practiceAttempts.studentId, studentId)
      ),
    });
    const avoid = new Set(prior.flatMap((p) => p.questionSet.map((q) => q.questionId)));
    picked = dealByDifficulty(questions, set.drawCount ?? questions.length, {
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
  const questionSet = await serveQuestions(picked, practiceSetId, setTargets);
  const [attempt] = await db
    .insert(schema.practiceAttempts)
    .values({ practiceSetId, studentId, questionSet, answers: {} })
    .returning({ id: schema.practiceAttempts.id });
  return { attemptId: attempt.id, resumed: false };
}

/**
 * Turn picked questions into the served list. Ordering and matching options
 * are shuffled; choice options keep the author's order. Each item's target is
 * one of `preferredTargets` when it carries one, else its first tag.
 */
export async function serveQuestions(
  picked: PoolQuestion[],
  sectionId: string,
  preferredTargets: Set<string>
): Promise<ServedQuestion[]> {
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

  return picked.map((p, i) => {
    const type = typeBy.get(p.questionId);
    const always = type === "ordering" || type === "matching";
    // The item's target: one the set is tagged with when possible, else its first tag.
    const target = p.targetIds.find((t) => preferredTargets.has(t)) ?? p.targetIds[0] ?? null;
    const base: ServedQuestion = {
      questionId: p.questionId,
      sectionId,
      learningTargetId: target,
      points: p.points,
      order: i + 1,
    };
    return always ? { ...base, optionOrder: shuffle(optionsBy.get(p.questionId) ?? []) } : base;
  });
}

export type PracticeFeedback = {
  questionId: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  pointsPossible: number;
  /** The answer key as text; null when there is no fixed key (essays) or the question is still open. */
  correctAnswer: string | null;
  /** Null while the question is still open. */
  explanation: string | null;
  /** Feedback written on the option(s) the student chose; empty while the question is still open. */
  optionFeedback: string[];
  detail?: Record<string, boolean>;
  note?: string;
  /** Right, revealed, or read by the teacher: the key and explanation are showing. */
  closed: boolean;
  revealed: boolean;
  misses: number;
  /** The teacher's hint, once the student has missed enough times. */
  hint: string | null;
};

type FeedbackQuestion = GradableQuestion & {
  explanation: string | null;
  hint: string | null;
  optionFeedback: Map<string, string | null>;
};

async function loadFeedbackQuestions(ids: string[]): Promise<Map<string, FeedbackQuestion>> {
  const gradable = await loadGradableQuestions(ids);
  if (ids.length === 0) return new Map();
  const extra = await db
    .select({
      id: schema.questions.id,
      explanation: schema.questions.explanation,
      hint: schema.questions.hint,
    })
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
      hint: extra.find((e) => e.id === id)?.hint ?? null,
      optionFeedback: new Map(fb.filter((f) => f.questionId === id).map((f) => [f.id, f.feedback])),
    });
  }
  return out;
}

/**
 * Grade one answer and describe it back: right or wrong, the key, the
 * explanation, option feedback. This is the closed form; `feedbackFor` hides
 * the key while the question is still open.
 */
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
    closed: true,
    revealed: false,
    misses: 0,
    hint: null,
  };
}

/**
 * What the student sees for a stored item. Rule: an open item shows only that
 * the last check missed (and the hint once it is unlocked), never the key,
 * the explanation, or option feedback; a closed item shows everything.
 */
export function feedbackFor(
  q: FeedbackQuestion,
  served: ServedQuestion,
  entry: PracticeAnswer
): PracticeFeedback {
  const full = buildFeedback(q, served, entry.answer as Answer);
  const closed = isClosed(entry);
  const shared = {
    questionId: q.id,
    isCorrect: entry.isCorrect,
    pointsEarned: entry.pointsEarned,
    pointsPossible: entry.pointsPossible,
    closed,
    revealed: !!entry.revealed,
    misses: entry.misses ?? 0,
    hint: hintUnlocked(entry) ? q.hint : null,
  };
  if (closed) return { ...full, ...shared };
  return {
    ...shared,
    correctAnswer: null,
    explanation: null,
    optionFeedback: [],
    note: full.note,
  };
}

type PracticeResult = {
  feedback: PracticeFeedback;
  progress: PracticeProgress;
  completed: boolean;
};

/**
 * Apply one change to one item on a practice attempt and return what the
 * student sees. Rule: a closed item never changes; closing the last open item
 * completes the attempt with its percent and recomputes every retake gate the
 * student has.
 */
async function updatePracticeItem(
  attemptId: string,
  questionId: string,
  next: (
    q: FeedbackQuestion,
    served: ServedQuestion,
    prior: PracticeAnswer | undefined
  ) => PracticeAnswer
): Promise<PracticeResult> {
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
  if (prior && isClosed(prior)) {
    return {
      feedback: feedbackFor(q, served, prior),
      progress: practiceProgress(attempt.questionSet, answers),
      completed: false,
    };
  }
  const entry = next(q, served, prior);
  const updated: Record<string, PracticeAnswer> = { ...answers, [questionId]: entry };
  const progress = practiceProgress(attempt.questionSet, updated);
  const completed = progress.complete && !attempt.completedAt;
  await db
    .update(schema.practiceAttempts)
    .set({
      answers: updated,
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
  return { feedback: feedbackFor(q, served, entry), progress, completed };
}

/**
 * Check one answer. Rule: a wrong check adds a miss and leaves the question
 * open to try again (the hint unlocks after three); a right one, or one only a
 * teacher can read, closes it.
 */
export async function answerPracticeQuestion(
  attemptId: string,
  questionId: string,
  answer: Answer
): Promise<PracticeResult> {
  return updatePracticeItem(attemptId, questionId, (q, served, prior) => {
    const graded = buildFeedback(q, served, answer);
    return recordCheck(
      prior,
      {
        answer,
        isCorrect: graded.isCorrect,
        pointsEarned: graded.pointsEarned,
        pointsPossible: graded.pointsPossible,
      },
      new Date().toISOString()
    );
  });
}

/** Show the answer: closes the question as not correct and shows the key and explanation. */
export async function revealPracticeAnswer(
  attemptId: string,
  questionId: string
): Promise<PracticeResult> {
  return updatePracticeItem(attemptId, questionId, (q, served, prior) =>
    recordReveal(
      prior,
      served.points,
      new Date().toISOString(),
      buildFeedback(q, served, null).isCorrect === null
    )
  );
}

/** What the student sees for every item already touched on an attempt (for resuming and the summary). */
export async function feedbackForAttempt(attempt: {
  questionSet: ServedQuestion[];
  answers: Record<string, unknown>;
}): Promise<Record<string, PracticeFeedback>> {
  const answers = attempt.answers as Record<string, PracticeAnswer>;
  const ids = attempt.questionSet.map((s) => s.questionId).filter((id) => answers[id]);
  if (ids.length === 0) return {};
  const questions = await loadFeedbackQuestions(ids);
  const out: Record<string, PracticeFeedback> = {};
  for (const id of ids) {
    const q = questions.get(id);
    const served = attempt.questionSet.find((s) => s.questionId === id);
    if (q && served) out[id] = feedbackFor(q, served, answers[id]);
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
