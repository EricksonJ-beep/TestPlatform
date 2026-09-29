/**
 * Practice reads (Ticket 1.13): the teacher's /app/practice lists and editors,
 * the student's Practice tab with "Needed before your retake", the practice
 * runner payload, and one activity for a student. Callers pass the guards first.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { studentCourseIds } from "@/lib/authz";
import type { ActivityKind, CompletionEvidence } from "@/db/types";
import type { Answer } from "@/lib/grading";
import { feedbackForAttempt, type PracticeFeedback } from "@/lib/practice";
import {
  practiceProgress,
  type PracticeAnswer,
  type PracticeItemState,
  type PracticeProgress,
} from "@/lib/practice-rules";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { sanitizedQuestions, type StudentQuestion } from "@/lib/queries/attempts";

export type TargetRef = { id: string; code: string; title: string };

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

export type PracticeSetSummary = {
  kind: "practice_set";
  id: string;
  title: string;
  courseId: string | null;
  courseName: string | null;
  isPublished: boolean;
  sortOrder: number;
  source: "fixed" | "pool";
  questions: number;
  targets: TargetRef[];
  /** Distinct students with a completed attempt. */
  completions: number;
  updatedAt: Date;
};

export type ActivitySummary = {
  kind: "activity";
  id: string;
  title: string;
  activityKind: ActivityKind;
  courseId: string | null;
  courseName: string | null;
  isPublished: boolean;
  sortOrder: number;
  targets: TargetRef[];
  completions: number;
  pendingVerification: number;
  updatedAt: Date;
};

async function targetsFor(
  table: "practice_set" | "activity",
  ids: string[]
): Promise<Map<string, TargetRef[]>> {
  const out = new Map<string, TargetRef[]>();
  if (ids.length === 0) return out;
  const rows =
    table === "practice_set"
      ? await db
          .select({
            itemId: schema.practiceSetTargets.practiceSetId,
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
            sortOrder: schema.learningTargets.sortOrder,
          })
          .from(schema.practiceSetTargets)
          .innerJoin(
            schema.learningTargets,
            eq(schema.practiceSetTargets.learningTargetId, schema.learningTargets.id)
          )
          .where(inArray(schema.practiceSetTargets.practiceSetId, ids))
      : await db
          .select({
            itemId: schema.activityTargets.activityId,
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
            sortOrder: schema.learningTargets.sortOrder,
          })
          .from(schema.activityTargets)
          .innerJoin(
            schema.learningTargets,
            eq(schema.activityTargets.learningTargetId, schema.learningTargets.id)
          )
          .where(inArray(schema.activityTargets.activityId, ids));
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  for (const r of rows)
    (out.get(r.itemId) ?? out.set(r.itemId, []).get(r.itemId)!).push({
      id: r.id,
      code: r.code,
      title: r.title,
    });
  return out;
}

const setQuestionCount = sql<number>`case when ${schema.practiceSets.poolId} is null
  then (select count(*)::int from ${schema.practiceSetQuestions} psq
        inner join ${schema.questions} q on q.id = psq.question_id and q.is_archived = false
        where psq.practice_set_id = ${schema.practiceSets.id})
  else least(coalesce(${schema.practiceSets.drawCount}, 1000000),
        (select count(*)::int from ${schema.poolQuestions} pq
         inner join ${schema.questions} q on q.id = pq.question_id and q.is_archived = false
         where pq.pool_id = ${schema.practiceSets.poolId}))
  end`;

/** Everything a teacher has built, both kinds, for /app/practice. */
export async function listPracticeContent(
  teacherId: string
): Promise<{ sets: PracticeSetSummary[]; activities: ActivitySummary[] }> {
  const setRows = await db
    .select({
      id: schema.practiceSets.id,
      title: schema.practiceSets.title,
      courseId: schema.practiceSets.courseId,
      courseName: schema.courses.name,
      isPublished: schema.practiceSets.isPublished,
      sortOrder: schema.practiceSets.sortOrder,
      poolId: schema.practiceSets.poolId,
      questions: setQuestionCount,
      completions: sql<number>`(select count(distinct pa.student_id)::int from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.completed_at is not null)`,
      updatedAt: schema.practiceSets.updatedAt,
    })
    .from(schema.practiceSets)
    .leftJoin(schema.courses, eq(schema.practiceSets.courseId, schema.courses.id))
    .where(eq(schema.practiceSets.ownerId, teacherId))
    .orderBy(asc(schema.practiceSets.sortOrder), asc(schema.practiceSets.title));
  const actRows = await db
    .select({
      id: schema.relearningActivities.id,
      title: schema.relearningActivities.title,
      activityKind: schema.relearningActivities.kind,
      courseId: schema.relearningActivities.courseId,
      courseName: schema.courses.name,
      isPublished: schema.relearningActivities.isPublished,
      sortOrder: schema.relearningActivities.sortOrder,
      completions: sql<number>`(select count(*)::int from ${schema.activityCompletions} c where c.activity_id = ${schema.relearningActivities.id})`,
      pendingVerification: sql<number>`case when ${schema.relearningActivities.requiresTeacherVerification} then (select count(*)::int from ${schema.activityCompletions} c where c.activity_id = ${schema.relearningActivities.id} and c.teacher_verified = false) else 0 end`,
      updatedAt: schema.relearningActivities.updatedAt,
    })
    .from(schema.relearningActivities)
    .leftJoin(schema.courses, eq(schema.relearningActivities.courseId, schema.courses.id))
    .where(eq(schema.relearningActivities.ownerId, teacherId))
    .orderBy(asc(schema.relearningActivities.sortOrder), asc(schema.relearningActivities.title));
  const [setTargets, actTargets] = await Promise.all([
    targetsFor(
      "practice_set",
      setRows.map((r) => r.id)
    ),
    targetsFor(
      "activity",
      actRows.map((r) => r.id)
    ),
  ]);
  return {
    sets: setRows.map(({ poolId, ...r }) => ({
      kind: "practice_set",
      ...r,
      source: poolId ? "pool" : "fixed",
      targets: setTargets.get(r.id) ?? [],
    })),
    activities: actRows.map((r) => ({
      kind: "activity",
      ...r,
      targets: actTargets.get(r.id) ?? [],
    })),
  };
}

export type PracticeSetQuestionRow = {
  id: string;
  type: (typeof schema.questionType.enumValues)[number];
  stem: string;
  points: number;
  sortOrder: number;
  isArchived: boolean;
  targets: TargetRef[];
};

export type PracticeSetDetail = {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  courseName: string | null;
  isPublished: boolean;
  sortOrder: number;
  worksheetId: string | null;
  pool: { id: string; name: string; size: number } | null;
  drawCount: number | null;
  targets: TargetRef[];
  questions: PracticeSetQuestionRow[];
  stats: { attempts: number; students: number; completed: number; averageBest: number | null };
};

export async function getPracticeSetDetail(setId: string): Promise<PracticeSetDetail | null> {
  const [set] = await db
    .select({
      id: schema.practiceSets.id,
      title: schema.practiceSets.title,
      description: schema.practiceSets.description,
      courseId: schema.practiceSets.courseId,
      courseName: schema.courses.name,
      isPublished: schema.practiceSets.isPublished,
      sortOrder: schema.practiceSets.sortOrder,
      worksheetId: schema.practiceSets.worksheetId,
      poolId: schema.practiceSets.poolId,
      poolName: schema.questionPools.name,
      drawCount: schema.practiceSets.drawCount,
    })
    .from(schema.practiceSets)
    .leftJoin(schema.courses, eq(schema.practiceSets.courseId, schema.courses.id))
    .leftJoin(schema.questionPools, eq(schema.practiceSets.poolId, schema.questionPools.id))
    .where(eq(schema.practiceSets.id, setId))
    .limit(1);
  if (!set) return null;
  const poolSize = set.poolId
    ? await db.$count(
        schema.poolQuestions,
        and(
          eq(schema.poolQuestions.poolId, set.poolId),
          inArray(
            schema.poolQuestions.questionId,
            db
              .select({ id: schema.questions.id })
              .from(schema.questions)
              .where(eq(schema.questions.isArchived, false))
          )
        )
      )
    : 0;
  const qRows = await db
    .select({
      id: schema.questions.id,
      type: schema.questions.type,
      stem: schema.questions.stem,
      points: schema.questions.points,
      sortOrder: schema.practiceSetQuestions.sortOrder,
      isArchived: schema.questions.isArchived,
    })
    .from(schema.practiceSetQuestions)
    .innerJoin(schema.questions, eq(schema.practiceSetQuestions.questionId, schema.questions.id))
    .where(eq(schema.practiceSetQuestions.practiceSetId, setId))
    .orderBy(asc(schema.practiceSetQuestions.sortOrder));
  const qTargets = qRows.length
    ? await db
        .select({
          questionId: schema.questionTargets.questionId,
          id: schema.learningTargets.id,
          code: schema.learningTargets.code,
          title: schema.learningTargets.title,
        })
        .from(schema.questionTargets)
        .innerJoin(
          schema.learningTargets,
          eq(schema.questionTargets.learningTargetId, schema.learningTargets.id)
        )
        .where(
          inArray(
            schema.questionTargets.questionId,
            qRows.map((q) => q.id)
          )
        )
    : [];
  const [targets, stats] = await Promise.all([
    targetsFor("practice_set", [setId]),
    db
      .select({
        attempts: sql<number>`count(*)::int`,
        students: sql<number>`count(distinct ${schema.practiceAttempts.studentId})::int`,
        completed: sql<number>`count(${schema.practiceAttempts.completedAt})::int`,
        averageBest: sql<
          number | null
        >`(select avg(best) from (select max(percent) best from ${schema.practiceAttempts} p2 where p2.practice_set_id = ${setId} and p2.completed_at is not null group by p2.student_id) b)`,
      })
      .from(schema.practiceAttempts)
      .where(eq(schema.practiceAttempts.practiceSetId, setId)),
  ]);
  const { poolId, poolName, ...rest } = set;
  return {
    ...rest,
    pool: poolId ? { id: poolId, name: poolName ?? "Pool", size: poolSize } : null,
    targets: targets.get(setId) ?? [],
    questions: qRows.map((q) => ({
      ...q,
      targets: qTargets
        .filter((t) => t.questionId === q.id)
        .map((t) => ({ id: t.id, code: t.code, title: t.title })),
    })),
    stats: {
      ...stats[0],
      averageBest: stats[0].averageBest === null ? null : Number(stats[0].averageBest),
    },
  };
}

export type ActivityCompletionRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  completedAt: Date;
  teacherVerified: boolean;
  evidence: CompletionEvidence | null;
};

export type ActivityDetail = {
  id: string;
  title: string;
  kind: ActivityKind;
  worksheetId: string | null;
  content: string | null;
  url: string | null;
  prompts: { id: string; prompt: string }[] | null;
  requiresTeacherVerification: boolean;
  isPublished: boolean;
  sortOrder: number;
  courseId: string | null;
  courseName: string | null;
  targets: TargetRef[];
  completions: ActivityCompletionRow[];
};

export async function getActivityDetail(activityId: string): Promise<ActivityDetail | null> {
  const [a] = await db
    .select({
      id: schema.relearningActivities.id,
      title: schema.relearningActivities.title,
      kind: schema.relearningActivities.kind,
      worksheetId: schema.relearningActivities.worksheetId,
      content: schema.relearningActivities.content,
      url: schema.relearningActivities.url,
      prompts: schema.relearningActivities.prompts,
      requiresTeacherVerification: schema.relearningActivities.requiresTeacherVerification,
      isPublished: schema.relearningActivities.isPublished,
      sortOrder: schema.relearningActivities.sortOrder,
      courseId: schema.relearningActivities.courseId,
      courseName: schema.courses.name,
    })
    .from(schema.relearningActivities)
    .leftJoin(schema.courses, eq(schema.relearningActivities.courseId, schema.courses.id))
    .where(eq(schema.relearningActivities.id, activityId))
    .limit(1);
  if (!a) return null;
  const [targets, completions] = await Promise.all([
    targetsFor("activity", [activityId]),
    db
      .select({
        studentId: schema.activityCompletions.studentId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        completedAt: schema.activityCompletions.completedAt,
        teacherVerified: schema.activityCompletions.teacherVerified,
        evidence: schema.activityCompletions.evidence,
      })
      .from(schema.activityCompletions)
      .innerJoin(schema.users, eq(schema.activityCompletions.studentId, schema.users.id))
      .where(eq(schema.activityCompletions.activityId, activityId))
      .orderBy(asc(schema.users.lastName), asc(schema.users.firstName)),
  ]);
  return { ...a, targets: targets.get(activityId) ?? [], completions };
}

/** Published items on a course, with their target ids, for the pin editor. */
export async function listPublishedContent(courseId: string) {
  const sets = await db
    .select({ id: schema.practiceSets.id, title: schema.practiceSets.title })
    .from(schema.practiceSets)
    .where(
      and(eq(schema.practiceSets.courseId, courseId), eq(schema.practiceSets.isPublished, true))
    )
    .orderBy(asc(schema.practiceSets.sortOrder), asc(schema.practiceSets.title));
  const activities = await db
    .select({
      id: schema.relearningActivities.id,
      title: schema.relearningActivities.title,
      kind: schema.relearningActivities.kind,
    })
    .from(schema.relearningActivities)
    .where(
      and(
        eq(schema.relearningActivities.courseId, courseId),
        eq(schema.relearningActivities.isPublished, true)
      )
    )
    .orderBy(asc(schema.relearningActivities.sortOrder), asc(schema.relearningActivities.title));
  const [st, at] = await Promise.all([
    targetsFor(
      "practice_set",
      sets.map((s) => s.id)
    ),
    targetsFor(
      "activity",
      activities.map((a) => a.id)
    ),
  ]);
  return {
    sets: sets.map((s) => ({ ...s, targetIds: (st.get(s.id) ?? []).map((t) => t.id) })),
    activities: activities.map((a) => ({
      ...a,
      targetIds: (at.get(a.id) ?? []).map((t) => t.id),
    })),
  };
}

export type PinRow = {
  learningTargetId: string;
  activityId: string | null;
  practiceSetId: string | null;
};

export async function listPins(assignmentId: string): Promise<PinRow[]> {
  return db
    .select({
      learningTargetId: schema.assignmentPins.learningTargetId,
      activityId: schema.assignmentPins.activityId,
      practiceSetId: schema.assignmentPins.practiceSetId,
    })
    .from(schema.assignmentPins)
    .where(eq(schema.assignmentPins.assignmentId, assignmentId));
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export type StudentPracticeSet = {
  id: string;
  title: string;
  sortOrder: number;
  /** True for an Apps Script worksheet: students open its link instead of the runner. */
  isWorksheet: boolean;
  worksheetUrl: string | null;
  description: string | null;
  courseName: string | null;
  targets: TargetRef[];
  questions: number;
  state: PracticeItemState;
  attempts: number;
  bestPercent: number | null;
  inProgressAttemptId: string | null;
  lastCompletedAt: Date | null;
};

export type StudentActivity = {
  id: string;
  title: string;
  sortOrder: number;
  kind: ActivityKind;
  courseName: string | null;
  targets: TargetRef[];
  requiresTeacherVerification: boolean;
  state: PracticeItemState;
  completedAt: Date | null;
};

export type NeededTarget = {
  id: string;
  code: string;
  title: string;
  percent: number;
  required: boolean;
  correctionsOk: boolean;
  activityOk: boolean;
  practiceOk: boolean;
  /** The items that satisfy the gate: the pinned one when pinned, else every tagged item. */
  activities: StudentActivity[];
  sets: StudentPracticeSet[];
  /** The corrections form to finish, when corrections are still open. */
  correctionsHref: string | null;
};

export type NeededGroup = {
  assignmentId: string;
  title: string;
  targets: NeededTarget[];
};

export type StudentPractice = {
  needed: NeededGroup[];
  sets: StudentPracticeSet[];
  activities: StudentActivity[];
};

/**
 * Rule: a student sees published items on the courses of classes they're
 * enrolled in. Items that would satisfy a still-closed retake gate are grouped
 * first under "Needed before your retake" (PLAN.md §5 screen 2).
 */
export async function getStudentPractice(
  studentId: string,
  assignments: StudentAssignment[]
): Promise<StudentPractice> {
  const courseIds = await studentCourseIds(studentId);
  if (courseIds.length === 0) return { needed: [], sets: [], activities: [] };

  const setRows = await db
    .select({
      id: schema.practiceSets.id,
      title: schema.practiceSets.title,
      sortOrder: schema.practiceSets.sortOrder,
      worksheetId: schema.practiceSets.worksheetId,
      worksheetUrl: schema.worksheets.studentUrl,
      description: schema.practiceSets.description,
      courseName: schema.courses.name,
      questions: setQuestionCount,
      attempts: sql<number>`(select count(*)::int from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId})`,
      bestPercent: sql<
        number | null
      >`(select max(pa.percent) from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId} and pa.completed_at is not null)`,
      inProgressAttemptId: sql<
        string | null
      >`(select pa.id from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId} and pa.completed_at is null order by pa.started_at desc limit 1)`,
      lastCompletedAt: sql<Date | null>`(select max(pa.completed_at) from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId})`,
    })
    .from(schema.practiceSets)
    .leftJoin(schema.courses, eq(schema.practiceSets.courseId, schema.courses.id))
    .leftJoin(schema.worksheets, eq(schema.practiceSets.worksheetId, schema.worksheets.id))
    .where(
      and(
        inArray(schema.practiceSets.courseId, courseIds),
        eq(schema.practiceSets.isPublished, true)
      )
    )
    .orderBy(asc(schema.practiceSets.sortOrder), asc(schema.practiceSets.title));
  const actRows = await db
    .select({
      id: schema.relearningActivities.id,
      title: schema.relearningActivities.title,
      sortOrder: schema.relearningActivities.sortOrder,
      kind: schema.relearningActivities.kind,
      courseName: schema.courses.name,
      requiresTeacherVerification: schema.relearningActivities.requiresTeacherVerification,
      completedAt: schema.activityCompletions.completedAt,
      teacherVerified: schema.activityCompletions.teacherVerified,
    })
    .from(schema.relearningActivities)
    .leftJoin(schema.courses, eq(schema.relearningActivities.courseId, schema.courses.id))
    .leftJoin(
      schema.activityCompletions,
      and(
        eq(schema.activityCompletions.activityId, schema.relearningActivities.id),
        eq(schema.activityCompletions.studentId, studentId)
      )
    )
    .where(
      and(
        inArray(schema.relearningActivities.courseId, courseIds),
        eq(schema.relearningActivities.isPublished, true)
      )
    )
    .orderBy(asc(schema.relearningActivities.sortOrder), asc(schema.relearningActivities.title));
  const [setTargets, actTargets] = await Promise.all([
    targetsFor(
      "practice_set",
      setRows.map((r) => r.id)
    ),
    targetsFor(
      "activity",
      actRows.map((r) => r.id)
    ),
  ]);
  const sets: StudentPracticeSet[] = setRows.map(({ worksheetId, ...r }) => {
    const best = r.bestPercent === null ? null : Number(r.bestPercent);
    return {
      ...r,
      isWorksheet: !!worksheetId,
      bestPercent: best,
      lastCompletedAt: r.lastCompletedAt ? new Date(r.lastCompletedAt) : null,
      targets: setTargets.get(r.id) ?? [],
      state: r.lastCompletedAt ? "done" : r.inProgressAttemptId ? "in_progress" : "not_started",
    };
  });
  const activities: StudentActivity[] = actRows.map(({ teacherVerified, ...r }) => ({
    ...r,
    targets: actTargets.get(r.id) ?? [],
    state: !r.completedAt
      ? "not_started"
      : r.requiresTeacherVerification && !teacherVerified
        ? "awaiting_teacher"
        : "done",
  }));

  // "Needed before your retake": selected targets whose gate is still closed.
  const needed: NeededGroup[] = [];
  const pending = assignments.filter(
    (a) => a.retake && a.retake.plan.selected.length > 0 && a.retake.plan.locked.length > 0
  );
  if (pending.length) {
    const pins = await db
      .select({
        assignmentId: schema.assignmentPins.assignmentId,
        learningTargetId: schema.assignmentPins.learningTargetId,
        activityId: schema.assignmentPins.activityId,
        practiceSetId: schema.assignmentPins.practiceSetId,
      })
      .from(schema.assignmentPins)
      .where(
        inArray(
          schema.assignmentPins.assignmentId,
          pending.map((a) => a.id)
        )
      );
    for (const a of pending) {
      const locked = new Set(a.retake!.plan.locked);
      const targets: NeededTarget[] = a
        .retake!.targets.filter((t) => locked.has(t.id))
        .map((t) => {
          const pinned = pins.filter((p) => p.assignmentId === a.id && p.learningTargetId === t.id);
          const pinnedActs = pinned.map((p) => p.activityId).filter((x): x is string => !!x);
          const pinnedSets = pinned.map((p) => p.practiceSetId).filter((x): x is string => !!x);
          const tagged = <T extends { id: string; targets: TargetRef[] }>(
            items: T[],
            pinnedIds: string[]
          ) =>
            pinnedIds.length
              ? items.filter((i) => pinnedIds.includes(i.id))
              : items.filter((i) => i.targets.some((x) => x.id === t.id));
          const c = a.corrections;
          return {
            id: t.id,
            code: t.code,
            title: t.title,
            percent: t.percent,
            required: t.required,
            correctionsOk: t.gate.correctionsOk,
            activityOk: t.gate.activityOk,
            practiceOk: t.gate.practiceOk,
            activities: tagged(activities, pinnedActs),
            sets: tagged(sets, pinnedSets),
            correctionsHref:
              !t.gate.correctionsOk && c && c.state !== "approved" && c.state !== "none"
                ? `/student/corrections/${c.attemptId}`
                : null,
          };
        });
      if (targets.length) needed.push({ assignmentId: a.id, title: a.title, targets });
    }
  }
  return { needed, sets, activities };
}

export type PracticeRunnerPayload = {
  attempt: { id: string; startedAt: Date; completedAt: Date | null };
  set: { id: string; title: string; description: string | null };
  questions: StudentQuestion[];
  /** Answered questions with what the student put and the feedback they got. */
  answered: Record<string, { answer: Answer; feedback: PracticeFeedback }>;
  progress: PracticeProgress;
  fontScale: number;
};

export async function getPracticeRunnerPayload(
  attemptId: string
): Promise<PracticeRunnerPayload | null> {
  const attempt = await db.query.practiceAttempts.findFirst({
    where: eq(schema.practiceAttempts.id, attemptId),
  });
  if (!attempt) return null;
  const set = await db.query.practiceSets.findFirst({
    columns: { id: true, title: true, description: true, courseId: true },
    where: eq(schema.practiceSets.id, attempt.practiceSetId),
  });
  if (!set) return null;
  const served = attempt.questionSet;
  const questions = await sanitizedQuestions(
    served.map((s) => s.questionId),
    served,
    attemptId
  );
  const answers = attempt.answers as Record<string, PracticeAnswer>;
  const feedback = await feedbackForAttempt(attempt);
  const answered: PracticeRunnerPayload["answered"] = {};
  for (const [id, a] of Object.entries(answers))
    if (feedback[id]) answered[id] = { answer: a.answer as Answer, feedback: feedback[id] };
  const [enrollment] = set.courseId
    ? await db
        .select({ fontScale: schema.enrollments.fontScale })
        .from(schema.enrollments)
        .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
        .where(
          and(
            eq(schema.enrollments.studentId, attempt.studentId),
            eq(schema.classes.courseId, set.courseId)
          )
        )
        .limit(1)
    : [];
  return {
    attempt: { id: attempt.id, startedAt: attempt.startedAt, completedAt: attempt.completedAt },
    set: { id: set.id, title: set.title, description: set.description },
    questions: served.map((s) => questions.get(s.questionId)!).filter(Boolean),
    answered,
    progress: practiceProgress(served, answers),
    fontScale: enrollment?.fontScale ?? 100,
  };
}

export type StudentActivityView = {
  id: string;
  title: string;
  kind: ActivityKind;
  content: string | null;
  url: string | null;
  prompts: { id: string; prompt: string }[] | null;
  requiresTeacherVerification: boolean;
  courseName: string | null;
  targets: TargetRef[];
  completion: {
    completedAt: Date;
    teacherVerified: boolean;
    evidence: CompletionEvidence | null;
  } | null;
};

export async function getActivityForStudent(
  activityId: string,
  studentId: string
): Promise<StudentActivityView | null> {
  const [a] = await db
    .select({
      id: schema.relearningActivities.id,
      title: schema.relearningActivities.title,
      kind: schema.relearningActivities.kind,
      content: schema.relearningActivities.content,
      url: schema.relearningActivities.url,
      prompts: schema.relearningActivities.prompts,
      requiresTeacherVerification: schema.relearningActivities.requiresTeacherVerification,
      courseName: schema.courses.name,
    })
    .from(schema.relearningActivities)
    .leftJoin(schema.courses, eq(schema.relearningActivities.courseId, schema.courses.id))
    .where(eq(schema.relearningActivities.id, activityId))
    .limit(1);
  if (!a) return null;
  const [targets, completion] = await Promise.all([
    targetsFor("activity", [activityId]),
    db.query.activityCompletions.findFirst({
      columns: { completedAt: true, teacherVerified: true, evidence: true },
      where: and(
        eq(schema.activityCompletions.activityId, activityId),
        eq(schema.activityCompletions.studentId, studentId)
      ),
    }),
  ]);
  return { ...a, targets: targets.get(activityId) ?? [], completion: completion ?? null };
}

/** Count of link completions waiting on the teacher, for the dashboard. */
export async function countPendingVerifications(teacherId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.activityCompletions)
    .innerJoin(
      schema.relearningActivities,
      eq(schema.activityCompletions.activityId, schema.relearningActivities.id)
    )
    .where(
      and(
        eq(schema.relearningActivities.ownerId, teacherId),
        eq(schema.relearningActivities.requiresTeacherVerification, true),
        eq(schema.activityCompletions.teacherVerified, false)
      )
    );
  return r?.n ?? 0;
}
