/**
 * Teacher dashboard counts. Callers must already have passed requireTeacher();
 * every query is scoped to the given teacher's own rows.
 */
import { and, asc, count, eq, isNull, lte, or, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type DashboardCounts = {
  needsGrading: number;
  /** Submitted correction sets waiting on the teacher (teacher-approved review mode). */
  correctionsAwaiting: number;
  openTests: number;
  questions: number;
  classes: number;
  /** Students asking for their next attempt on a "Retakes need my OK" assignment. */
  retakeRequests: number;
};

export async function getDashboardCounts(teacherId: string): Promise<DashboardCounts> {
  const now = new Date();

  const [needsGrading] = await db
    .select({ n: count() })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), eq(schema.attempts.status, "submitted")));

  const [correctionsAwaiting] = await db
    .select({ n: sql<number>`count(distinct ${schema.corrections.attemptId})::int` })
    .from(schema.corrections)
    .innerJoin(schema.attempts, eq(schema.corrections.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(
      and(eq(schema.assignments.ownerId, teacherId), eq(schema.corrections.status, "submitted"))
    );

  const [openTests] = await db
    .select({ n: count() })
    .from(schema.assignments)
    .where(
      and(
        eq(schema.assignments.ownerId, teacherId),
        or(isNull(schema.assignments.opensAt), lte(schema.assignments.opensAt, now)),
        or(isNull(schema.assignments.closesAt), gt(schema.assignments.closesAt, now))
      )
    );

  const [questions] = await db
    .select({ n: count() })
    .from(schema.questions)
    .where(and(eq(schema.questions.ownerId, teacherId), eq(schema.questions.isArchived, false)));

  const [classes] = await db
    .select({ n: count() })
    .from(schema.classes)
    .where(eq(schema.classes.ownerId, teacherId));

  const [retakeRequests] = await db
    .select({ n: count() })
    .from(schema.attemptUnlocks)
    .innerJoin(schema.assignments, eq(schema.attemptUnlocks.assignmentId, schema.assignments.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), isNull(schema.attemptUnlocks.grantedAt)));

  return {
    needsGrading: needsGrading.n,
    correctionsAwaiting: correctionsAwaiting?.n ?? 0,
    openTests: openTests.n,
    questions: questions.n,
    classes: classes.n,
    retakeRequests: retakeRequests?.n ?? 0,
  };
}

export type RetakeRequest = {
  id: string;
  assignmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  title: string;
  className: string;
  attemptNumber: number;
  requestedAt: Date | null;
  /** The student's best percent so far on this assignment, when results exist. */
  bestPercent: number | null;
};

/** Pending retake requests on the teacher's assignments, oldest first. */
export async function listRetakeRequests(teacherId: string): Promise<RetakeRequest[]> {
  const rows = await db
    .select({
      id: schema.attemptUnlocks.id,
      assignmentId: schema.attemptUnlocks.assignmentId,
      studentId: schema.attemptUnlocks.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      title: schema.assessments.title,
      className: schema.classes.name,
      attemptNumber: schema.attemptUnlocks.attemptNumber,
      requestedAt: schema.attemptUnlocks.requestedAt,
      bestPercent: sql<
        number | null
      >`(select max(a.percent) from ${schema.attempts} a where a.assignment_id = ${schema.attemptUnlocks.assignmentId} and a.student_id = ${schema.attemptUnlocks.studentId} and a.status <> 'in_progress')`,
    })
    .from(schema.attemptUnlocks)
    .innerJoin(schema.assignments, eq(schema.attemptUnlocks.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.attemptUnlocks.studentId, schema.users.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), isNull(schema.attemptUnlocks.grantedAt)))
    .orderBy(asc(schema.attemptUnlocks.requestedAt));
  return rows.map((r) => ({
    ...r,
    bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
  }));
}

export type RecentResult = {
  assignmentId: string;
  title: string;
  className: string;
  type: "practice" | "formative" | "summative";
  submitted: number;
  enrolled: number;
  averagePercent: number | null;
};

/** Latest assignments with at least one submitted attempt, newest first. */
export async function getRecentResults(teacherId: string, limit = 5): Promise<RecentResult[]> {
  const rows = await db
    .select({
      assignmentId: schema.assignments.id,
      title: schema.assessments.title,
      className: schema.classes.name,
      type: schema.assessments.type,
      submitted: sql<number>`count(distinct ${schema.attempts.studentId})::int`,
      averagePercent: sql<number | null>`avg(${schema.attempts.percent})`,
      enrolled: sql<number>`(select count(*)::int from ${schema.enrollments} e where e.class_id = ${schema.classes.id})`,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.attempts, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), eq(schema.attempts.status, "graded")))
    .groupBy(
      schema.assignments.id,
      schema.assessments.title,
      schema.classes.name,
      schema.classes.id,
      schema.assessments.type,
      schema.assignments.createdAt
    )
    .orderBy(sql`${schema.assignments.createdAt} desc`)
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    averagePercent: r.averagePercent === null ? null : Number(r.averagePercent),
  }));
}

export type CourseCard = {
  id: string;
  name: string;
  classes: number;
  openTests: number;
  /** Published practice sets + published activities. */
  practice: number;
  needsGrading: number;
  correctionsAwaiting: number;
};

/**
 * One card per course the teacher owns, for the Dashboard (docs/course-focus-plan.md,
 * ticket 6): the door into a course, with what is waiting there.
 */
export async function listCourseCards(teacherId: string, now = new Date()): Promise<CourseCard[]> {
  const c = schema.courses;
  const rows = await db
    .select({
      id: c.id,
      name: c.name,
      classes: sql<number>`(select count(*)::int from ${schema.classes} k where k.course_id = ${c}.id and k.owner_id = ${teacherId})`,
      openTests: sql<number>`(select count(*)::int from ${schema.assignments} a join ${schema.assessments} s on s.id = a.assessment_id where s.course_id = ${c}.id and a.owner_id = ${teacherId} and (a.opens_at is null or a.opens_at <= ${now}) and (a.closes_at is null or a.closes_at > ${now}))`,
      practice: sql<number>`(select count(*)::int from ${schema.practiceSets} p where p.course_id = ${c}.id and p.owner_id = ${teacherId} and p.is_published) + (select count(*)::int from ${schema.relearningActivities} r where r.course_id = ${c}.id and r.owner_id = ${teacherId} and r.is_published)`,
      needsGrading: sql<number>`(select count(*)::int from ${schema.attempts} t join ${schema.assignments} a on a.id = t.assignment_id join ${schema.assessments} s on s.id = a.assessment_id where s.course_id = ${c}.id and a.owner_id = ${teacherId} and t.status = 'submitted')`,
      correctionsAwaiting: sql<number>`(select count(distinct cr.attempt_id)::int from ${schema.corrections} cr join ${schema.attempts} t on t.id = cr.attempt_id join ${schema.assignments} a on a.id = t.assignment_id join ${schema.assessments} s on s.id = a.assessment_id where s.course_id = ${c}.id and a.owner_id = ${teacherId} and cr.status = 'submitted')`,
    })
    .from(c)
    .where(eq(c.ownerId, teacherId))
    .orderBy(asc(c.name));
  return rows;
}
