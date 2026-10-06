/**
 * Teacher results reads: the gradebook, one attempt's review, the manual
 * grading queue, and the export rows. Callers pass the guards first.
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { QuestionType } from "@/db/types";
import { answerToText, correctAnswerText, type Answer, type GradableOption } from "@/lib/grading";
import type { StimulusInfo } from "@/lib/stimulus-groups";

export type GradebookAttempt = {
  id: string;
  number: number;
  status: "in_progress" | "submitted" | "graded";
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  tabSwitches: number;
  /** Target codes a targeted retake covered; null for a full attempt. */
  scopeCodes: string[] | null;
  pendingManual: number;
  corrections: {
    total: number;
    approved: number;
    submitted: number;
    returned: number;
    state: "in_progress" | "submitted" | "returned" | "approved";
  } | null;
};

export type GradebookRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  attempts: GradebookAttempt[];
  /** Highest attempt number the teacher has unlocked for this student (0 = none). */
  unlockedThrough: number;
  /** When the student asked for their next attempt; null when there is no pending request. */
  requestedAt: Date | null;
  /** The attempt whose total counts (formative/practice); null for summatives (per target) or none. */
  bestAttemptId: string | null;
  final: {
    totalEarned: number;
    totalPossible: number;
    percent: number;
    tier: number | null;
    targetsBelowThreshold: number;
  } | null;
};

export async function getGradebook(assignmentId: string): Promise<GradebookRow[]> {
  const asg = await db.query.assignments.findFirst({
    columns: { classId: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!asg) return [];
  const roster = await db
    .select({
      studentId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      unlockedThrough: sql<number>`(select coalesce(max(u.attempt_number), 0)::int from ${schema.attemptUnlocks} u where u.assignment_id = ${assignmentId} and u.student_id = ${schema.users.id} and u.granted_at is not null)`,
      requestedAt: sql<Date | null>`(select max(u.requested_at) from ${schema.attemptUnlocks} u where u.assignment_id = ${assignmentId} and u.student_id = ${schema.users.id} and u.granted_at is null)`,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(eq(schema.enrollments.classId, asg.classId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
  const attempts = await db
    .select({
      id: schema.attempts.id,
      studentId: schema.attempts.studentId,
      number: schema.attempts.number,
      status: schema.attempts.status,
      score: schema.attempts.score,
      maxScore: schema.attempts.maxScore,
      percent: schema.attempts.percent,
      startedAt: schema.attempts.startedAt,
      submittedAt: schema.attempts.submittedAt,
      tabSwitches: schema.attempts.tabSwitches,
      scope: schema.attempts.scope,
      pendingManual: sql<number>`(select count(*)::int from ${schema.responses} r where r.attempt_id = attempts.id and r.auto_score is null and r.manual_score is null)`,
      correctionsTotal: sql<number>`(select count(*)::int from ${schema.corrections} c where c.attempt_id = attempts.id)`,
      correctionsApproved: sql<number>`(select count(*)::int from ${schema.corrections} c where c.attempt_id = attempts.id and c.status = 'approved')`,
      correctionsSubmitted: sql<number>`(select count(*)::int from ${schema.corrections} c where c.attempt_id = attempts.id and c.status = 'submitted')`,
      correctionsReturned: sql<number>`(select count(*)::int from ${schema.corrections} c where c.attempt_id = attempts.id and c.status = 'returned')`,
    })
    .from(schema.attempts)
    .where(eq(schema.attempts.assignmentId, assignmentId))
    .orderBy(asc(schema.attempts.number));
  const finals = await db
    .select()
    .from(schema.assignmentFinalScores)
    .where(eq(schema.assignmentFinalScores.assignmentId, assignmentId));
  const finalBy = new Map(finals.map((f) => [f.studentId, f]));
  const scopeIds = [...new Set(attempts.flatMap((a) => a.scope ?? []))];
  const codes = scopeIds.length
    ? await db
        .select({ id: schema.learningTargets.id, code: schema.learningTargets.code })
        .from(schema.learningTargets)
        .where(inArray(schema.learningTargets.id, scopeIds))
    : [];
  const codeBy = new Map(codes.map((c) => [c.id, c.code]));

  return roster.map((s) => {
    const mine = attempts
      .filter((a) => a.studentId === s.studentId)
      .map(
        ({
          correctionsTotal,
          correctionsApproved,
          correctionsSubmitted,
          correctionsReturned,
          scope,
          ...a
        }): GradebookAttempt => ({
          ...a,
          scopeCodes: scope ? scope.map((id) => codeBy.get(id) ?? "?") : null,
          corrections: correctionsTotal
            ? {
                total: correctionsTotal,
                approved: correctionsApproved,
                submitted: correctionsSubmitted,
                returned: correctionsReturned,
                state:
                  correctionsSubmitted > 0
                    ? "submitted"
                    : correctionsReturned > 0
                      ? "returned"
                      : correctionsApproved === correctionsTotal
                        ? "approved"
                        : "in_progress",
              }
            : null,
        })
      );
    const finished = mine.filter((a) => a.status !== "in_progress" && a.score !== null);
    const best = finished.reduce<GradebookAttempt | null>(
      (b, a) => (b === null || (a.score ?? 0) > (b.score ?? 0) ? a : b),
      null
    );
    const f = finalBy.get(s.studentId);
    return {
      ...s,
      requestedAt: s.requestedAt ? new Date(s.requestedAt) : null,
      attempts: mine,
      bestAttemptId: best?.id ?? null,
      final: f
        ? {
            totalEarned: f.totalEarned,
            totalPossible: f.totalPossible,
            percent: f.percent,
            tier: f.tier,
            targetsBelowThreshold: f.targetsBelowThreshold,
          }
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Mastery grid: students × learning targets, highest counts
// ---------------------------------------------------------------------------

export type MasteryTarget = { id: string; code: string; title: string };

export type MasteryRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  /** Target id → best percent; a target the student hasn't been scored on is absent. */
  percents: Record<string, number>;
  overall: number | null;
};

export type MasteryGrid = { targets: MasteryTarget[]; rows: MasteryRow[] };

/**
 * Per-target percent for every enrolled student. Summatives use the per-target
 * best already stored on the final score; formatives/practice use the target
 * scores of the attempt that counts (the best total), so the grid always
 * matches the gradebook.
 */
export async function getMasteryGrid(assignmentId: string): Promise<MasteryGrid> {
  const asg = await db
    .select({
      classId: schema.assignments.classId,
      type: schema.assessments.type,
      assessmentId: schema.assessments.id,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, assignmentId))
    .then((r) => r[0]);
  if (!asg) return { targets: [], rows: [] };

  // Targets in section order, so the columns read like the test does.
  const targets = await db
    .selectDistinctOn([schema.learningTargets.id], {
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.assessmentSections.sortOrder,
    })
    .from(schema.assessmentSections)
    .innerJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(eq(schema.assessmentSections.assessmentId, asg.assessmentId))
    .orderBy(schema.learningTargets.id, schema.assessmentSections.sortOrder)
    .then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder));

  const roster = await db
    .select({
      studentId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      unlockedThrough: sql<number>`(select coalesce(max(u.attempt_number), 0)::int from ${schema.attemptUnlocks} u where u.assignment_id = ${assignmentId} and u.student_id = ${schema.users.id} and u.granted_at is not null)`,
      requestedAt: sql<Date | null>`(select max(u.requested_at) from ${schema.attemptUnlocks} u where u.assignment_id = ${assignmentId} and u.student_id = ${schema.users.id} and u.granted_at is null)`,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(eq(schema.enrollments.classId, asg.classId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
  const finals = await db
    .select()
    .from(schema.assignmentFinalScores)
    .where(eq(schema.assignmentFinalScores.assignmentId, assignmentId));
  const finalBy = new Map(finals.map((f) => [f.studentId, f]));

  const percentsBy = new Map<string, Record<string, number>>();
  if (asg.type === "summative") {
    for (const f of finals)
      percentsBy.set(
        f.studentId,
        Object.fromEntries(Object.entries(f.perTarget).map(([id, t]) => [id, t.percent]))
      );
  } else {
    // The attempt that counts is the best total; tie → the later attempt (computeFinalScore).
    const attempts = await db
      .select({
        id: schema.attempts.id,
        studentId: schema.attempts.studentId,
        number: schema.attempts.number,
        score: schema.attempts.score,
      })
      .from(schema.attempts)
      .where(
        and(
          eq(schema.attempts.assignmentId, assignmentId),
          ne(schema.attempts.status, "in_progress")
        )
      );
    const bestBy = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) {
      const cur = bestBy.get(a.studentId);
      if (
        !cur ||
        (a.score ?? 0) > (cur.score ?? 0) ||
        ((a.score ?? 0) === (cur.score ?? 0) && a.number > cur.number)
      )
        bestBy.set(a.studentId, a);
    }
    const bestIds = [...bestBy.values()].map((a) => a.id);
    const scores = bestIds.length
      ? await db
          .select({
            attemptId: schema.attemptTargetScores.attemptId,
            learningTargetId: schema.attemptTargetScores.learningTargetId,
            percent: schema.attemptTargetScores.percent,
          })
          .from(schema.attemptTargetScores)
          .where(inArray(schema.attemptTargetScores.attemptId, bestIds))
      : [];
    const studentByAttempt = new Map([...bestBy].map(([s, a]) => [a.id, s]));
    for (const s of scores) {
      const studentId = studentByAttempt.get(s.attemptId)!;
      const rec = percentsBy.get(studentId) ?? {};
      rec[s.learningTargetId] = s.percent;
      percentsBy.set(studentId, rec);
    }
  }

  return {
    targets: targets.map((t) => ({ id: t.id, code: t.code, title: t.title })),
    rows: roster.map((s) => ({
      ...s,
      percents: percentsBy.get(s.studentId) ?? {},
      overall: finalBy.get(s.studentId)?.percent ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Item analysis: how the class did on each question
// ---------------------------------------------------------------------------

export type ItemStat = {
  questionId: string;
  bankId: string;
  stem: string;
  type: QuestionType;
  targetCode: string | null;
  /** Finished attempts that served the question and have a score for it. */
  answered: number;
  correct: number;
  /** correct / answered; null until someone has a scored response. */
  rate: number | null;
};

/**
 * Correct rate per question across every finished attempt. A served question
 * with no response counts as answered wrong; one still waiting on manual
 * grading is left out of the count. Manually graded items count as correct
 * at full points.
 */
export async function getItemAnalysis(assignmentId: string): Promise<ItemStat[]> {
  const attempts = await db
    .select({ id: schema.attempts.id, questionSet: schema.attempts.questionSet })
    .from(schema.attempts)
    .where(
      and(eq(schema.attempts.assignmentId, assignmentId), ne(schema.attempts.status, "in_progress"))
    );
  if (attempts.length === 0) return [];
  const attemptIds = attempts.map((a) => a.id);
  const responses = await db
    .select({
      attemptId: schema.responses.attemptId,
      questionId: schema.responses.questionId,
      autoScore: schema.responses.autoScore,
      manualScore: schema.responses.manualScore,
      isCorrect: schema.responses.isCorrect,
    })
    .from(schema.responses)
    .where(inArray(schema.responses.attemptId, attemptIds));
  const responseBy = new Map(responses.map((r) => [`${r.attemptId}:${r.questionId}`, r]));

  const stats = new Map<
    string,
    { answered: number; correct: number; order: number; learningTargetId: string | null }
  >();
  for (const a of attempts) {
    for (const item of a.questionSet) {
      const s = stats.get(item.questionId) ?? {
        answered: 0,
        correct: 0,
        order: item.order,
        learningTargetId: item.learningTargetId,
      };
      const r = responseBy.get(`${a.id}:${item.questionId}`);
      const pending = r && r.autoScore === null && r.manualScore === null;
      if (!pending) {
        s.answered++;
        const earned = r ? (r.manualScore ?? r.autoScore ?? 0) : 0;
        if (r?.isCorrect || (r?.manualScore !== null && earned >= item.points)) s.correct++;
      }
      stats.set(item.questionId, s);
    }
  }
  const questionIds = [...stats.keys()];
  const questions = await db
    .select({
      id: schema.questions.id,
      bankId: schema.questions.bankId,
      stem: schema.questions.stem,
      type: schema.questions.type,
    })
    .from(schema.questions)
    .where(inArray(schema.questions.id, questionIds));
  const targetIds = [...new Set([...stats.values()].flatMap((s) => s.learningTargetId ?? []))];
  const codes = targetIds.length
    ? await db
        .select({ id: schema.learningTargets.id, code: schema.learningTargets.code })
        .from(schema.learningTargets)
        .where(inArray(schema.learningTargets.id, targetIds))
    : [];
  const codeBy = new Map(codes.map((c) => [c.id, c.code]));

  return questions
    .sort((a, b) => stats.get(a.id)!.order - stats.get(b.id)!.order)
    .map((q): ItemStat => {
      const s = stats.get(q.id)!;
      return {
        questionId: q.id,
        bankId: q.bankId,
        stem: q.stem,
        type: q.type,
        targetCode: s.learningTargetId ? (codeBy.get(s.learningTargetId) ?? null) : null,
        answered: s.answered,
        correct: s.correct,
        rate: s.answered > 0 ? s.correct / s.answered : null,
      };
    });
}

// ---------------------------------------------------------------------------
// One attempt, question by question
// ---------------------------------------------------------------------------

export type ReviewItem = {
  order: number;
  questionId: string;
  type: QuestionType;
  stem: string;
  points: number;
  grading: "auto" | "manual";
  gradingConfig: unknown;
  explanation: string | null;
  mediaUrl: string | null;
  stimulus: StimulusInfo | null;
  options: GradableOption[];
  target: { code: string; title: string } | null;
  response: {
    answer: Answer;
    autoScore: number | null;
    manualScore: number | null;
    isCorrect: boolean | null;
    flagged: boolean;
    graderNote: string | null;
    gradedAt: Date | null;
  } | null;
  correction: {
    correctAnswer: string;
    explanation: string;
    status: "draft" | "submitted" | "approved" | "returned";
    reviewerNote: string | null;
    aiFlag: boolean;
  } | null;
};

export type AttemptReview = {
  attempt: {
    id: string;
    number: number;
    status: "in_progress" | "submitted" | "graded";
    score: number | null;
    maxScore: number | null;
    percent: number | null;
    startedAt: Date;
    submittedAt: Date | null;
    tabSwitches: number;
  };
  student: { id: string; firstName: string; lastName: string };
  assignment: {
    id: string;
    title: string;
    type: "practice" | "formative" | "summative";
    className: string;
    resultsReleased: boolean;
  };
  items: ReviewItem[];
  perTarget: {
    code: string;
    title: string;
    pointsEarned: number;
    pointsPossible: number;
    percent: number;
  }[];
};

export async function getAttemptReview(attemptId: string): Promise<AttemptReview | null> {
  const attempt = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) });
  if (!attempt) return null;
  const [head] = await db
    .select({
      studentId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      assignmentId: schema.assignments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      className: schema.classes.name,
      resultsReleased: schema.assignments.resultsReleased,
    })
    .from(schema.attempts)
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.attempts.id, attemptId))
    .limit(1);
  if (!head) return null;

  const set = attempt.questionSet;
  const ids = set.map((s) => s.questionId);
  const qs = ids.length
    ? await db
        .select({
          id: schema.questions.id,
          type: schema.questions.type,
          stem: schema.questions.stem,
          grading: schema.questions.grading,
          gradingConfig: schema.questions.gradingConfig,
          explanation: schema.questions.explanation,
          mediaUrl: schema.questions.mediaUrl,
          stimulusId: schema.stimuli.id,
          stimulusKind: schema.stimuli.kind,
          stimulusTitle: schema.stimuli.title,
          stimulusContent: schema.stimuli.content,
          stimulusMediaUrl: schema.stimuli.mediaUrl,
        })
        .from(schema.questions)
        .leftJoin(schema.stimuli, eq(schema.questions.stimulusId, schema.stimuli.id))
        .where(inArray(schema.questions.id, ids))
    : [];
  const opts = ids.length
    ? await db
        .select({
          id: schema.questionOptions.id,
          questionId: schema.questionOptions.questionId,
          content: schema.questionOptions.content,
          isCorrect: schema.questionOptions.isCorrect,
          matchText: schema.questionOptions.matchText,
          correctPosition: schema.questionOptions.correctPosition,
        })
        .from(schema.questionOptions)
        .where(inArray(schema.questionOptions.questionId, ids))
        .orderBy(asc(schema.questionOptions.sortOrder))
    : [];
  const responses = await db
    .select()
    .from(schema.responses)
    .where(eq(schema.responses.attemptId, attemptId));
  const corrections = await db
    .select()
    .from(schema.corrections)
    .where(eq(schema.corrections.attemptId, attemptId));
  const cBy = new Map(corrections.map((c) => [c.questionId, c]));
  const targetIds = [
    ...new Set(set.map((s) => s.learningTargetId).filter((x): x is string => !!x)),
  ];
  const targets = targetIds.length
    ? await db
        .select({
          id: schema.learningTargets.id,
          code: schema.learningTargets.code,
          title: schema.learningTargets.title,
        })
        .from(schema.learningTargets)
        .where(inArray(schema.learningTargets.id, targetIds))
    : [];
  const targetBy = new Map(targets.map((t) => [t.id, t]));
  const scores = await db
    .select()
    .from(schema.attemptTargetScores)
    .where(eq(schema.attemptTargetScores.attemptId, attemptId));

  const qBy = new Map(qs.map((q) => [q.id, q]));
  const rBy = new Map(responses.map((r) => [r.questionId, r]));
  const items: ReviewItem[] = [];
  for (const s of set) {
    const q = qBy.get(s.questionId);
    if (!q) continue;
    const r = rBy.get(s.questionId);
    const t = s.learningTargetId ? targetBy.get(s.learningTargetId) : null;
    let options = opts.filter((o) => o.questionId === q.id);
    if (s.optionOrder) {
      const pos = new Map(s.optionOrder.map((id, i) => [id, i]));
      options = [...options].sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
    }
    items.push({
      order: s.order,
      questionId: q.id,
      type: q.type,
      stem: q.stem,
      points: s.points,
      grading: q.grading,
      gradingConfig: q.gradingConfig,
      explanation: q.explanation,
      mediaUrl: q.mediaUrl,
      stimulus:
        q.stimulusId && q.stimulusKind
          ? {
              id: q.stimulusId,
              kind: q.stimulusKind,
              title: q.stimulusTitle ?? null,
              content: q.stimulusContent ?? null,
              mediaUrl: q.stimulusMediaUrl ?? null,
            }
          : null,
      options: options.map(({ questionId: _q, ...o }) => o),
      target: t ? { code: t.code, title: t.title } : null,
      response: r
        ? {
            answer: (r.answer as Answer) ?? null,
            autoScore: r.autoScore,
            manualScore: r.manualScore,
            isCorrect: r.isCorrect,
            flagged: r.flagged,
            graderNote: r.graderNote,
            gradedAt: r.gradedAt,
          }
        : null,
      correction: (() => {
        const c = cBy.get(s.questionId);
        return c
          ? {
              correctAnswer: c.correctAnswer,
              explanation: c.explanation,
              status: c.status,
              reviewerNote: c.reviewerNote,
              aiFlag: c.aiFlag,
            }
          : null;
      })(),
    });
  }

  return {
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percent: attempt.percent,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      tabSwitches: attempt.tabSwitches,
    },
    student: { id: head.studentId, firstName: head.firstName, lastName: head.lastName },
    assignment: {
      id: head.assignmentId,
      title: head.title,
      type: head.type,
      className: head.className,
      resultsReleased: head.resultsReleased,
    },
    items,
    perTarget: scores
      .map((sc) => {
        const t = targetBy.get(sc.learningTargetId);
        return t
          ? {
              code: t.code,
              title: t.title,
              pointsEarned: sc.pointsEarned,
              pointsPossible: sc.pointsPossible,
              percent: sc.percent,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// ---------------------------------------------------------------------------
// Manual grading queue
// ---------------------------------------------------------------------------

export type QueueItem = {
  attemptId: string;
  questionId: string;
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  courseId: string | null;
  studentName: string;
  attemptNumber: number;
  submittedAt: Date | null;
  type: QuestionType;
  stem: string;
  points: number;
  answer: Answer;
  gradingConfig: unknown;
};

/** Responses on this teacher's assignments still waiting for a human score, oldest submission first. */
export async function listGradingQueue(teacherId: string): Promise<QueueItem[]> {
  const rows = await db
    .select({
      attemptId: schema.responses.attemptId,
      questionId: schema.responses.questionId,
      answer: schema.responses.answer,
      assignmentId: schema.assignments.id,
      assignmentTitle: schema.assessments.title,
      className: schema.classes.name,
      courseId: schema.assessments.courseId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      attemptNumber: schema.attempts.number,
      submittedAt: schema.attempts.submittedAt,
      questionSet: schema.attempts.questionSet,
      type: schema.questions.type,
      stem: schema.questions.stem,
      gradingConfig: schema.questions.gradingConfig,
    })
    .from(schema.responses)
    .innerJoin(schema.attempts, eq(schema.responses.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .innerJoin(schema.questions, eq(schema.responses.questionId, schema.questions.id))
    .where(
      and(
        eq(schema.assignments.ownerId, teacherId),
        ne(schema.attempts.status, "in_progress"),
        isNull(schema.responses.autoScore),
        isNull(schema.responses.manualScore)
      )
    )
    .orderBy(asc(schema.attempts.submittedAt), asc(schema.users.lastName));
  return rows.map(({ questionSet, firstName, lastName, ...r }) => ({
    ...r,
    studentName: `${firstName} ${lastName}`,
    answer: (r.answer as Answer) ?? null,
    points: questionSet.find((s) => s.questionId === r.questionId)?.points ?? 1,
  }));
}

export async function countPendingByAssignment(teacherId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      assignmentId: schema.attempts.assignmentId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.responses)
    .innerJoin(schema.attempts, eq(schema.responses.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(
      and(
        eq(schema.assignments.ownerId, teacherId),
        ne(schema.attempts.status, "in_progress"),
        isNull(schema.responses.autoScore),
        isNull(schema.responses.manualScore)
      )
    )
    .groupBy(schema.attempts.assignmentId);
  return new Map(rows.map((r) => [r.assignmentId, r.n]));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportRow = {
  lastName: string;
  firstName: string;
  email: string | null;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  attempts: number;
};

/** One row per enrolled student with the score that counts (highest); blank when they have no finished attempt. */
export async function highestScoresRows(assignmentId: string): Promise<ExportRow[]> {
  const asg = await db.query.assignments.findFirst({
    columns: { classId: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!asg) return [];
  return db
    .select({
      lastName: schema.users.lastName,
      firstName: schema.users.firstName,
      email: schema.users.email,
      score: schema.assignmentFinalScores.totalEarned,
      maxScore: schema.assignmentFinalScores.totalPossible,
      percent: schema.assignmentFinalScores.percent,
      attempts: sql<number>`(select count(*)::int from ${schema.attempts} a where a.assignment_id = ${assignmentId} and a.student_id = ${schema.users.id} and a.status <> 'in_progress')`,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .leftJoin(
      schema.assignmentFinalScores,
      and(
        eq(schema.assignmentFinalScores.studentId, schema.users.id),
        eq(schema.assignmentFinalScores.assignmentId, assignmentId)
      )
    )
    .where(eq(schema.enrollments.classId, asg.classId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName), desc(schema.users.email));
}

// ---------------------------------------------------------------------------
// Review with the class (Jon, Oct 1 2026): each question with what students picked
// ---------------------------------------------------------------------------

export type ClassReviewOption = {
  id: string;
  content: string;
  isCorrect: boolean;
  /** Finished attempts that chose this option. */
  picked: number;
};

export type ClassReviewAnswer = {
  text: string;
  count: number;
  /** null when it is still waiting on manual grading or mixed. */
  correct: boolean | null;
};

export type ClassReviewItem = ItemStat & {
  explanation: string | null;
  mediaUrl: string | null;
  /** Choice types: every option, with how many picked it. */
  options: ClassReviewOption[];
  /** Other types: the most common answers, most frequent first (up to 6). */
  answers: ClassReviewAnswer[];
  /** The key, as text, when the type has one. */
  keyText: string | null;
  /** Served but left blank. */
  blank: number;
};

/**
 * Item analysis with the distribution of answers: which choice each student
 * picked, or the most common typed answers. Finished attempts only; the order
 * is the order served.
 */
export async function getClassReview(assignmentId: string): Promise<ClassReviewItem[]> {
  const stats = await getItemAnalysis(assignmentId);
  if (stats.length === 0) return [];
  const questionIds = stats.map((s) => s.questionId);
  const attempts = await db
    .select({ id: schema.attempts.id, questionSet: schema.attempts.questionSet })
    .from(schema.attempts)
    .where(
      and(eq(schema.attempts.assignmentId, assignmentId), ne(schema.attempts.status, "in_progress"))
    );
  const attemptIds = attempts.map((a) => a.id);
  const [responses, questions, options] = await Promise.all([
    db
      .select({
        attemptId: schema.responses.attemptId,
        questionId: schema.responses.questionId,
        answer: schema.responses.answer,
        isCorrect: schema.responses.isCorrect,
        autoScore: schema.responses.autoScore,
        manualScore: schema.responses.manualScore,
      })
      .from(schema.responses)
      .where(inArray(schema.responses.attemptId, attemptIds)),
    db
      .select({
        id: schema.questions.id,
        points: schema.questions.points,
        grading: schema.questions.grading,
        gradingConfig: schema.questions.gradingConfig,
        explanation: schema.questions.explanation,
        mediaUrl: schema.questions.mediaUrl,
      })
      .from(schema.questions)
      .where(inArray(schema.questions.id, questionIds)),
    db
      .select({
        id: schema.questionOptions.id,
        questionId: schema.questionOptions.questionId,
        content: schema.questionOptions.content,
        isCorrect: schema.questionOptions.isCorrect,
        matchText: schema.questionOptions.matchText,
        correctPosition: schema.questionOptions.correctPosition,
      })
      .from(schema.questionOptions)
      .where(inArray(schema.questionOptions.questionId, questionIds))
      .orderBy(asc(schema.questionOptions.sortOrder)),
  ]);
  const qBy = new Map(questions.map((q) => [q.id, q]));
  const optionsBy = new Map<string, GradableOption[]>();
  for (const o of options)
    (optionsBy.get(o.questionId) ?? optionsBy.set(o.questionId, []).get(o.questionId)!).push(o);
  const responseBy = new Map(responses.map((r) => [`${r.attemptId}:${r.questionId}`, r]));

  return stats.map((stat): ClassReviewItem => {
    const q = qBy.get(stat.questionId);
    const opts = optionsBy.get(stat.questionId) ?? [];
    const gradable = q
      ? {
          id: stat.questionId,
          type: stat.type,
          points: q.points,
          grading: q.grading,
          gradingConfig: q.gradingConfig,
          options: opts,
        }
      : null;
    const picked = new Map<string, number>();
    const texts = new Map<string, { text: string; count: number; right: number; wrong: number }>();
    let blank = 0;
    for (const a of attempts) {
      if (!a.questionSet.some((i) => i.questionId === stat.questionId)) continue;
      const r = responseBy.get(`${a.id}:${stat.questionId}`);
      const answer = (r?.answer as Answer | null) ?? null;
      if (!answer) {
        blank++;
        continue;
      }
      if (answer.kind === "choice") {
        if (!answer.optionId) blank++;
        else picked.set(answer.optionId, (picked.get(answer.optionId) ?? 0) + 1);
      } else if (answer.kind === "multi") {
        if (answer.optionIds.length === 0) blank++;
        for (const id of answer.optionIds) picked.set(id, (picked.get(id) ?? 0) + 1);
      } else if (gradable) {
        const text = answerToText(gradable, answer).trim();
        if (!text || text === "—") {
          blank++;
          continue;
        }
        const key = text.toLowerCase();
        const t = texts.get(key) ?? { text, count: 0, right: 0, wrong: 0 };
        t.count++;
        if (r?.isCorrect === true) t.right++;
        else if (r?.isCorrect === false) t.wrong++;
        texts.set(key, t);
      }
    }
    const isChoice =
      stat.type === "multiple_choice" ||
      stat.type === "multiple_select" ||
      stat.type === "true_false";
    return {
      ...stat,
      explanation: q?.explanation ?? null,
      mediaUrl: q?.mediaUrl ?? null,
      options: isChoice
        ? opts.map((o) => ({
            id: o.id,
            content: o.content,
            isCorrect: o.isCorrect,
            picked: picked.get(o.id) ?? 0,
          }))
        : [],
      answers: isChoice
        ? []
        : [...texts.values()]
            .sort((x, y) => y.count - x.count)
            .slice(0, 6)
            .map((t) => ({
              text: t.text,
              count: t.count,
              correct: t.right && !t.wrong ? true : t.wrong && !t.right ? false : null,
            })),
      keyText: gradable ? correctAnswerText(gradable) : null,
      blank,
    };
  });
}
