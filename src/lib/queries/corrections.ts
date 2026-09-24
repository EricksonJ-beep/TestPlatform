/**
 * Corrections reads (Ticket 1.11): which questions on an attempt need a
 * correction, the student's form payload (sanitized: no keys, no explanations),
 * the set's state for cards and gates, and the teacher's approval queue.
 * Callers pass the guards first.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CorrectionStatus, QuestionType } from "@/db/types";
import {
  correctionsSummary,
  questionsNeedingCorrection,
  type CorrectionsSummary,
} from "@/lib/corrections";
import { answerToText, correctAnswerText, gradeResponse, type Answer } from "@/lib/grading";
import { loadGradableQuestions } from "@/lib/queries/attempts";
import type { StimulusInfo } from "@/lib/stimulus-groups";

type Scope = {
  attempt: {
    id: string;
    number: number;
    status: "in_progress" | "submitted" | "graded";
    studentId: string;
    assignmentId: string;
    questionSet: typeof schema.attempts.$inferSelect.questionSet;
  };
  assignment: {
    id: string;
    title: string;
    type: "practice" | "formative" | "summative";
    reviewMode: "auto" | "teacher_approved";
    retakeThreshold: number;
    className: string;
  };
  /** Question ids needing a correction, in served order. */
  needed: string[];
  responses: Map<string, typeof schema.responses.$inferSelect>;
  targetPercents: Record<string, number>;
};

/** Rule: scope is computed from stored scores only (never re-graded here), so it matches what the student saw. */
async function loadScope(attemptId: string): Promise<Scope | null> {
  const attempt = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) });
  if (!attempt) return null;
  const [asg] = await db
    .select({
      id: schema.assignments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      reviewMode: schema.assignments.reviewMode,
      retakeThreshold: schema.assignments.retakeThreshold,
      className: schema.classes.name,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.id, attempt.assignmentId))
    .limit(1);
  if (!asg) return null;
  const responses = await db
    .select()
    .from(schema.responses)
    .where(eq(schema.responses.attemptId, attemptId));
  const byQ = new Map(responses.map((r) => [r.questionId, r]));
  const targetRows = await db
    .select({
      learningTargetId: schema.attemptTargetScores.learningTargetId,
      percent: schema.attemptTargetScores.percent,
    })
    .from(schema.attemptTargetScores)
    .where(eq(schema.attemptTargetScores.attemptId, attemptId));
  const targetPercents = Object.fromEntries(targetRows.map((t) => [t.learningTargetId, t.percent]));
  const optedIn = await db
    .select({ learningTargetId: schema.retakeGates.learningTargetId })
    .from(schema.retakeGates)
    .where(
      and(
        eq(schema.retakeGates.studentId, attempt.studentId),
        eq(schema.retakeGates.assignmentId, attempt.assignmentId),
        eq(schema.retakeGates.optedIn, true)
      )
    );
  const needed =
    attempt.status === "in_progress"
      ? []
      : questionsNeedingCorrection({
          type: asg.type,
          items: attempt.questionSet.map((s) => {
            const r = byQ.get(s.questionId);
            const earned = r ? (r.manualScore ?? r.autoScore) : 0;
            return {
              questionId: s.questionId,
              learningTargetId: s.learningTargetId,
              points: s.points,
              earned,
            };
          }),
          targetPercents,
          threshold: asg.retakeThreshold,
          optedInTargetIds: optedIn.map((o) => o.learningTargetId),
        });
  return {
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      studentId: attempt.studentId,
      assignmentId: attempt.assignmentId,
      questionSet: attempt.questionSet,
    },
    assignment: asg,
    needed,
    responses: byQ,
    targetPercents,
  };
}

export type CorrectionsSetSummary = CorrectionsSummary & {
  attemptId: string;
  attemptNumber: number;
  /** The teacher's note on a returned set, if any. */
  reviewerNote: string | null;
};

/** The set's state for the student card, the retake gate, and the gradebook. */
export async function getCorrectionsSummary(
  attemptId: string
): Promise<CorrectionsSetSummary | null> {
  const scope = await loadScope(attemptId);
  if (!scope) return null;
  const rows = await db
    .select({
      questionId: schema.corrections.questionId,
      status: schema.corrections.status,
      reviewerNote: schema.corrections.reviewerNote,
    })
    .from(schema.corrections)
    .where(eq(schema.corrections.attemptId, attemptId));
  const summary = correctionsSummary(scope.needed, rows);
  const note = rows.find((r) => r.status === "returned" && r.reviewerNote)?.reviewerNote ?? null;
  return { ...summary, attemptId, attemptNumber: scope.attempt.number, reviewerNote: note };
}

/** Which questions need a correction and whether each one is settled (used by the actions). */
export async function getCorrectionScope(attemptId: string) {
  return loadScope(attemptId);
}

// ---------------------------------------------------------------------------
// Student form
// ---------------------------------------------------------------------------

export type CorrectionItem = {
  questionId: string;
  order: number;
  type: QuestionType;
  stem: string;
  mediaUrl: string | null;
  videoUrl: string | null;
  stimulus: StimulusInfo | null;
  target: { code: string; title: string; percent: number | null } | null;
  points: number;
  earned: number;
  /** Options in the order served, no correct flags. */
  options: { id: string; content: string }[];
  /** Option ids the student picked (choice / multi), to mark them wrong. */
  chosenOptionIds: string[];
  studentAnswerText: string;
  /** Short nudge, never the answer: per-option feedback or the grader's note. */
  hint: string | null;
  correction: {
    correctAnswer: string;
    explanation: string;
    status: CorrectionStatus;
    reviewerNote: string | null;
  } | null;
};

export type CorrectionsForm = {
  attempt: { id: string; number: number };
  assignment: {
    id: string;
    title: string;
    type: "practice" | "formative" | "summative";
    reviewMode: "auto" | "teacher_approved";
  };
  summary: CorrectionsSetSummary;
  items: CorrectionItem[];
  /** Whether the student may edit (draft or returned sets). */
  editable: boolean;
};

/** Rule: the student payload carries no answer key, explanation, or option feedback for unpicked options. */
export async function getCorrectionsForm(attemptId: string): Promise<CorrectionsForm | null> {
  const scope = await loadScope(attemptId);
  if (!scope) return null;
  const summary = (await getCorrectionsSummary(attemptId))!;
  const ids = scope.needed;
  const rows = ids.length
    ? await db
        .select({
          id: schema.questions.id,
          type: schema.questions.type,
          stem: schema.questions.stem,
          mediaUrl: schema.questions.mediaUrl,
          videoUrl: schema.questions.videoUrl,
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
  const gradable = await loadGradableQuestions(ids);
  const feedback = ids.length
    ? await db
        .select({
          id: schema.questionOptions.id,
          questionId: schema.questionOptions.questionId,
          feedback: schema.questionOptions.feedback,
        })
        .from(schema.questionOptions)
        .where(inArray(schema.questionOptions.questionId, ids))
    : [];
  const feedbackBy = new Map(feedback.map((f) => [f.id, f.feedback]));
  const targetIds = [
    ...new Set(
      scope.attempt.questionSet.map((s) => s.learningTargetId).filter((x): x is string => !!x)
    ),
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
  const corrections = await db
    .select()
    .from(schema.corrections)
    .where(eq(schema.corrections.attemptId, attemptId));
  const corrBy = new Map(corrections.map((c) => [c.questionId, c]));
  const qBy = new Map(rows.map((r) => [r.id, r]));

  const items: CorrectionItem[] = [];
  for (const s of scope.attempt.questionSet) {
    if (!ids.includes(s.questionId)) continue;
    const q = qBy.get(s.questionId);
    const g = gradable.get(s.questionId);
    if (!q || !g) continue;
    const r = scope.responses.get(s.questionId);
    const answer = (r?.answer as Answer) ?? null;
    let options = g.options;
    if (s.optionOrder) {
      const pos = new Map(s.optionOrder.map((id, i) => [id, i]));
      options = [...options].sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
    }
    const chosen =
      answer?.kind === "choice" && answer.optionId
        ? [answer.optionId]
        : answer?.kind === "multi"
          ? answer.optionIds
          : [];
    const picked = chosen.map((id) => feedbackBy.get(id)).find((f) => !!f) ?? null;
    const note = gradeResponse({ ...g, points: s.points }, answer).note ?? null;
    const t = s.learningTargetId ? targetBy.get(s.learningTargetId) : null;
    const c = corrBy.get(s.questionId);
    items.push({
      questionId: s.questionId,
      order: s.order,
      type: q.type,
      stem: q.stem,
      mediaUrl: q.mediaUrl,
      videoUrl: q.videoUrl,
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
      target: t
        ? {
            code: t.code,
            title: t.title,
            percent: s.learningTargetId ? (scope.targetPercents[s.learningTargetId] ?? null) : null,
          }
        : null,
      points: s.points,
      earned: r ? (r.manualScore ?? r.autoScore ?? 0) : 0,
      options: options.map((o) => ({ id: o.id, content: o.content })),
      chosenOptionIds: chosen,
      studentAnswerText: answerToText(g, answer),
      hint: picked ?? note,
      correction: c
        ? {
            correctAnswer: c.correctAnswer,
            explanation: c.explanation,
            status: c.status,
            reviewerNote: c.reviewerNote,
          }
        : null,
    });
  }
  return {
    attempt: { id: scope.attempt.id, number: scope.attempt.number },
    assignment: {
      id: scope.assignment.id,
      title: scope.assignment.title,
      type: scope.assignment.type,
      reviewMode: scope.assignment.reviewMode,
    },
    summary,
    items,
    editable: summary.state === "needed" || summary.state === "returned",
  };
}

// ---------------------------------------------------------------------------
// Teacher queue
// ---------------------------------------------------------------------------

export type QueueCorrection = {
  questionId: string;
  order: number;
  stem: string;
  target: { code: string; title: string } | null;
  studentAnswerText: string;
  keyText: string | null;
  teacherExplanation: string | null;
  correctAnswer: string;
  explanation: string;
  aiFlag: boolean;
  aiNote: string | null;
};

export type QueueCard = {
  attemptId: string;
  attemptNumber: number;
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  studentId: string;
  studentName: string;
  submittedAt: Date | null;
  targets: { code: string; title: string }[];
  aiFlag: boolean;
  corrections: QueueCorrection[];
};

/** One card per submitted set (attempt) on this teacher's assignments, oldest submission first. */
export async function listCorrectionsQueue(teacherId: string): Promise<QueueCard[]> {
  const rows = await db
    .select({
      id: schema.corrections.id,
      attemptId: schema.corrections.attemptId,
      questionId: schema.corrections.questionId,
      correctAnswer: schema.corrections.correctAnswer,
      explanation: schema.corrections.explanation,
      aiFlag: schema.corrections.aiFlag,
      aiNote: schema.corrections.aiNote,
      submittedAt: schema.corrections.submittedAt,
      attemptNumber: schema.attempts.number,
      questionSet: schema.attempts.questionSet,
      studentId: schema.attempts.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      assignmentId: schema.assignments.id,
      assignmentTitle: schema.assessments.title,
      className: schema.classes.name,
      stem: schema.questions.stem,
      teacherExplanation: schema.questions.explanation,
    })
    .from(schema.corrections)
    .innerJoin(schema.attempts, eq(schema.corrections.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .innerJoin(schema.questions, eq(schema.corrections.questionId, schema.questions.id))
    .where(
      and(eq(schema.assignments.ownerId, teacherId), eq(schema.corrections.status, "submitted"))
    )
    .orderBy(asc(schema.corrections.submittedAt), asc(schema.users.lastName));
  if (rows.length === 0) return [];

  const attemptIds = [...new Set(rows.map((r) => r.attemptId))];
  const questionIds = [...new Set(rows.map((r) => r.questionId))];
  const gradable = await loadGradableQuestions(questionIds);
  const responses = await db
    .select({
      attemptId: schema.responses.attemptId,
      questionId: schema.responses.questionId,
      answer: schema.responses.answer,
    })
    .from(schema.responses)
    .where(
      and(
        inArray(schema.responses.attemptId, attemptIds),
        inArray(schema.responses.questionId, questionIds)
      )
    );
  const answerBy = new Map(responses.map((r) => [`${r.attemptId}:${r.questionId}`, r.answer]));
  const targetIds = [
    ...new Set(
      rows
        .flatMap((r) => r.questionSet.map((s) => s.learningTargetId))
        .filter((x): x is string => !!x)
    ),
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
  const targetBy = new Map(targets.map((t) => [t.id, { code: t.code, title: t.title }]));

  const cards = new Map<string, QueueCard>();
  for (const r of rows) {
    let card = cards.get(r.attemptId);
    if (!card) {
      card = {
        attemptId: r.attemptId,
        attemptNumber: r.attemptNumber,
        assignmentId: r.assignmentId,
        assignmentTitle: r.assignmentTitle,
        className: r.className,
        studentId: r.studentId,
        studentName: `${r.firstName} ${r.lastName}`,
        submittedAt: r.submittedAt,
        targets: [],
        aiFlag: false,
        corrections: [],
      };
      cards.set(r.attemptId, card);
    }
    const served = r.questionSet.find((s) => s.questionId === r.questionId);
    const g = gradable.get(r.questionId);
    const target = served?.learningTargetId
      ? (targetBy.get(served.learningTargetId) ?? null)
      : null;
    if (target && !card.targets.some((t) => t.code === target.code)) card.targets.push(target);
    if (r.aiFlag) card.aiFlag = true;
    if (r.submittedAt && (!card.submittedAt || r.submittedAt < card.submittedAt))
      card.submittedAt = r.submittedAt;
    const answer = (answerBy.get(`${r.attemptId}:${r.questionId}`) as Answer) ?? null;
    card.corrections.push({
      questionId: r.questionId,
      order: served?.order ?? 0,
      stem: r.stem,
      target,
      studentAnswerText: g ? answerToText(g, answer) : "—",
      keyText: g ? correctAnswerText(g) : null,
      teacherExplanation: r.teacherExplanation,
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      aiFlag: r.aiFlag,
      aiNote: r.aiNote,
    });
  }
  for (const card of cards.values()) card.corrections.sort((a, b) => a.order - b.order);
  return [...cards.values()].sort(
    (a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0)
  );
}

/** Submitted sets waiting on this teacher (one per attempt). */
export async function countCorrectionsAwaiting(teacherId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${schema.corrections.attemptId})::int` })
    .from(schema.corrections)
    .innerJoin(schema.attempts, eq(schema.corrections.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(
      and(eq(schema.assignments.ownerId, teacherId), eq(schema.corrections.status, "submitted"))
    );
  return row?.n ?? 0;
}

/** The student's latest finished attempt on an assignment, for card state and the retake gate. */
export async function latestFinishedAttemptId(
  assignmentId: string,
  studentId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.attempts.id })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        sql`${schema.attempts.status} <> 'in_progress'`
      )
    )
    .orderBy(desc(schema.attempts.number))
    .limit(1);
  return row?.id ?? null;
}
