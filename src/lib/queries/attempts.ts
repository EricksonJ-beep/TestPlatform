/**
 * Attempt reads: what the test screen needs (sanitized), what grading needs
 * (full), and the teacher's results view. Callers pass the guards first.
 */
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { QuestionType, ServedQuestion } from "@/db/types";
import { seededRng } from "@/lib/assessments/serve";
import type { Answer, GradableQuestion } from "@/lib/grading";
import type { StimulusInfo } from "@/lib/stimulus-groups";

/** Everything the grader needs, keyed by question id (includes correct flags: server only). */
export async function loadGradableQuestions(
  questionIds: string[]
): Promise<Map<string, GradableQuestion>> {
  if (questionIds.length === 0) return new Map();
  const qs = await db
    .select({
      id: schema.questions.id,
      type: schema.questions.type,
      points: schema.questions.points,
      grading: schema.questions.grading,
      gradingConfig: schema.questions.gradingConfig,
    })
    .from(schema.questions)
    .where(inArray(schema.questions.id, questionIds));
  const opts = await db
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
    .orderBy(asc(schema.questionOptions.sortOrder));
  const out = new Map<string, GradableQuestion>();
  for (const q of qs) out.set(q.id, { ...q, options: [] });
  for (const o of opts) out.get(o.questionId)?.options.push(o);
  return out;
}

/** A question as served to a student: no correct flags, no explanation, options in served order. */
export type StudentQuestion = {
  id: string;
  order: number;
  type: QuestionType;
  stem: string;
  points: number;
  mediaUrl: string | null;
  videoUrl: string | null;
  stimulus: StimulusInfo | null;
  target: { code: string; title: string } | null;
  /** Choice types, ordering (shuffled), and matching (left column). */
  options: { id: string; content: string }[];
  /** Matching only: the right-hand texts to choose from, shuffled. */
  choices: string[];
  unit: string | null;
};

export type SavedResponse = { questionId: string; answer: Answer; flagged: boolean };

export type RunnerPayload = {
  attempt: {
    id: string;
    number: number;
    status: "in_progress" | "submitted" | "graded";
    startedAt: Date;
    dueAt: Date | null;
    tabSwitches: number;
  };
  assignment: {
    id: string;
    title: string;
    teacherName: string;
    allowBacktrack: boolean;
    resultsReleased: boolean;
  };
  fontScale: number;
  questions: StudentQuestion[];
  responses: SavedResponse[];
  serverNow: Date;
};

/** Small deterministic hash so shuffles are stable across refreshes without storing them. */
function hashSeed(...parts: string[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export async function getRunnerPayload(attemptId: string): Promise<RunnerPayload | null> {
  const attempt = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) });
  if (!attempt) return null;
  const [asg] = await db
    .select({
      id: schema.assignments.id,
      classId: schema.assignments.classId,
      resultsReleased: schema.assignments.resultsReleased,
      title: schema.assessments.title,
      allowBacktrack: schema.assessments.allowBacktrack,
      teacherFirst: schema.users.firstName,
      teacherLast: schema.users.lastName,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.users, eq(schema.assignments.ownerId, schema.users.id))
    .where(eq(schema.assignments.id, attempt.assignmentId))
    .limit(1);
  if (!asg) return null;
  const enrollment = await db.query.enrollments.findFirst({
    columns: { fontScale: true },
    where: and(
      eq(schema.enrollments.classId, asg.classId),
      eq(schema.enrollments.studentId, attempt.studentId)
    ),
  });

  const set = attempt.questionSet;
  const ids = set.map((s) => s.questionId);
  const questions = await sanitizedQuestions(ids, set, attemptId);
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
  const targetBy = new Map(targets.map((t) => [t.id, { code: t.code, title: t.title }]));
  for (const s of set) {
    const q = questions.get(s.questionId);
    if (q && s.learningTargetId) q.target = targetBy.get(s.learningTargetId) ?? q.target;
  }
  const responses = await db
    .select({
      questionId: schema.responses.questionId,
      answer: schema.responses.answer,
      flagged: schema.responses.flagged,
    })
    .from(schema.responses)
    .where(eq(schema.responses.attemptId, attemptId));

  return {
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      startedAt: attempt.startedAt,
      dueAt: attempt.dueAt,
      tabSwitches: attempt.tabSwitches,
    },
    assignment: {
      id: asg.id,
      title: asg.title,
      teacherName: `${asg.teacherFirst} ${asg.teacherLast}`,
      allowBacktrack: asg.allowBacktrack,
      resultsReleased: asg.resultsReleased,
    },
    fontScale: enrollment?.fontScale ?? 100,
    questions: set.map((s) => questions.get(s.questionId)!).filter(Boolean),
    responses: responses.map((r) => ({
      questionId: r.questionId,
      answer: (r.answer as Answer) ?? null,
      flagged: r.flagged,
    })),
    serverNow: new Date(),
  };
}

/** Rule: the student payload never carries isCorrect, matchText pairs, correctPosition, explanation, or option feedback. */
async function sanitizedQuestions(
  ids: string[],
  set: ServedQuestion[],
  attemptId: string
): Promise<Map<string, StudentQuestion>> {
  const out = new Map<string, StudentQuestion>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      id: schema.questions.id,
      type: schema.questions.type,
      stem: schema.questions.stem,
      mediaUrl: schema.questions.mediaUrl,
      videoUrl: schema.questions.videoUrl,
      gradingConfig: schema.questions.gradingConfig,
      stimulusId: schema.stimuli.id,
      stimulusKind: schema.stimuli.kind,
      stimulusTitle: schema.stimuli.title,
      stimulusContent: schema.stimuli.content,
      stimulusMediaUrl: schema.stimuli.mediaUrl,
    })
    .from(schema.questions)
    .leftJoin(schema.stimuli, eq(schema.questions.stimulusId, schema.stimuli.id))
    .where(inArray(schema.questions.id, ids));
  const opts = await db
    .select({
      id: schema.questionOptions.id,
      questionId: schema.questionOptions.questionId,
      content: schema.questionOptions.content,
      matchText: schema.questionOptions.matchText,
    })
    .from(schema.questionOptions)
    .where(inArray(schema.questionOptions.questionId, ids))
    .orderBy(asc(schema.questionOptions.sortOrder));
  const qTargets = await db
    .select({
      questionId: schema.questionTargets.questionId,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.questionTargets)
    .innerJoin(
      schema.learningTargets,
      eq(schema.questionTargets.learningTargetId, schema.learningTargets.id)
    )
    .where(inArray(schema.questionTargets.questionId, ids));
  const optsBy = new Map<string, typeof opts>();
  for (const o of opts)
    (optsBy.get(o.questionId) ?? optsBy.set(o.questionId, []).get(o.questionId)!).push(o);
  const served = new Map(set.map((s) => [s.questionId, s]));

  for (const r of rows) {
    const s = served.get(r.id)!;
    let options = optsBy.get(r.id) ?? [];
    if (s.optionOrder) {
      const pos = new Map(s.optionOrder.map((id, i) => [id, i]));
      options = [...options].sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
    }
    let choices: string[] = [];
    if (r.type === "matching") {
      const rng = seededRng(hashSeed(attemptId, r.id));
      choices = options.map((o) => o.matchText ?? "").filter(Boolean);
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
    }
    const qt = qTargets.find((t) => t.questionId === r.id);
    out.set(r.id, {
      id: r.id,
      order: s.order,
      type: r.type,
      stem: r.stem,
      points: s.points,
      mediaUrl: r.mediaUrl,
      videoUrl: r.videoUrl,
      stimulus:
        r.stimulusId && r.stimulusKind
          ? {
              id: r.stimulusId,
              kind: r.stimulusKind,
              title: r.stimulusTitle ?? null,
              content: r.stimulusContent ?? null,
              mediaUrl: r.stimulusMediaUrl ?? null,
            }
          : null,
      target: qt ? { code: qt.code, title: qt.title } : null,
      options: options.map((o) => ({ id: o.id, content: o.content })),
      choices,
      unit: ((r.gradingConfig as { unit?: string | null } | null)?.unit ?? null) || null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type AttemptResultRow = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  number: number;
  status: "in_progress" | "submitted" | "graded";
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  tabSwitches: number;
};

/** Every attempt on an assignment, newest students first by name (teacher results). */
export async function listAssignmentAttempts(assignmentId: string): Promise<AttemptResultRow[]> {
  return db
    .select({
      id: schema.attempts.id,
      studentId: schema.attempts.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      number: schema.attempts.number,
      status: schema.attempts.status,
      score: schema.attempts.score,
      maxScore: schema.attempts.maxScore,
      percent: schema.attempts.percent,
      startedAt: schema.attempts.startedAt,
      submittedAt: schema.attempts.submittedAt,
      tabSwitches: schema.attempts.tabSwitches,
    })
    .from(schema.attempts)
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .where(eq(schema.attempts.assignmentId, assignmentId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName), asc(schema.attempts.number));
}

export async function listFinalScores(assignmentId: string) {
  return db
    .select({
      studentId: schema.assignmentFinalScores.studentId,
      totalEarned: schema.assignmentFinalScores.totalEarned,
      totalPossible: schema.assignmentFinalScores.totalPossible,
      percent: schema.assignmentFinalScores.percent,
      tier: schema.assignmentFinalScores.tier,
      targetsBelowThreshold: schema.assignmentFinalScores.targetsBelowThreshold,
    })
    .from(schema.assignmentFinalScores)
    .where(eq(schema.assignmentFinalScores.assignmentId, assignmentId));
}

/** A student's own finished attempts on one assignment, for the assignment page. */
export async function listStudentAttempts(assignmentId: string, studentId: string) {
  return db
    .select({
      id: schema.attempts.id,
      number: schema.attempts.number,
      status: schema.attempts.status,
      score: schema.attempts.score,
      maxScore: schema.attempts.maxScore,
      percent: schema.attempts.percent,
      submittedAt: schema.attempts.submittedAt,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(desc(schema.attempts.number));
}
