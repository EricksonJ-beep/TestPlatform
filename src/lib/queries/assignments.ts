/**
 * Assignment reads for the teacher's Assign screen and the student home.
 * Callers must have passed the relevant guard first.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assignmentStatus, type AssignmentStatus } from "@/lib/assignments";

export type AssignmentRow = {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: "practice" | "formative" | "summative";
  classId: string;
  className: string;
  opensAt: Date | null;
  closesAt: Date | null;
  accessCode: string | null;
  timeLimitMinutes: number | null;
  attemptsAllowed: number | null;
  reviewMode: "auto" | "teacher_approved";
  retakeThreshold: number;
  optionalRetakes: boolean;
  tier2Max: number;
  resultsReleased: boolean;
  createdAt: Date;
  enrolled: number;
  started: number;
  submitted: number;
  status: AssignmentStatus;
};

const baseSelect = {
  id: schema.assignments.id,
  assessmentId: schema.assignments.assessmentId,
  assessmentTitle: schema.assessments.title,
  assessmentType: schema.assessments.type,
  classId: schema.assignments.classId,
  className: schema.classes.name,
  opensAt: schema.assignments.opensAt,
  closesAt: schema.assignments.closesAt,
  accessCode: schema.assignments.accessCode,
  timeLimitMinutes: schema.assignments.timeLimitMinutes,
  attemptsAllowed: schema.assignments.attemptsAllowed,
  reviewMode: schema.assignments.reviewMode,
  retakeThreshold: schema.assignments.retakeThreshold,
  optionalRetakes: schema.assignments.optionalRetakes,
  tier2Max: schema.assignments.tier2Max,
  resultsReleased: schema.assignments.resultsReleased,
  createdAt: schema.assignments.createdAt,
  enrolled: sql<number>`(select count(*)::int from ${schema.enrollments} e where e.class_id = ${schema.assignments.classId})`,
  started: sql<number>`(select count(distinct a.student_id)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id})`,
  submitted: sql<number>`(select count(distinct a.student_id)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.status <> 'in_progress')`,
};

export async function listTeacherAssignments(
  teacherId: string,
  now = new Date()
): Promise<AssignmentRow[]> {
  const rows = await db
    .select(baseSelect)
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.ownerId, teacherId))
    .orderBy(desc(schema.assignments.createdAt));
  return rows.map((r) => ({ ...r, status: assignmentStatus(r, now) }));
}

export async function getAssignmentRow(
  assignmentId: string,
  now = new Date()
): Promise<AssignmentRow | null> {
  const [r] = await db
    .select(baseSelect)
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  return r ? { ...r, status: assignmentStatus(r, now) } : null;
}

/** Published assessments the teacher owns, plus published ones shared with them at copy or above. */
export async function listAssignableAssessments(teacherId: string) {
  return db
    .select({
      id: schema.assessments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      courseId: schema.assessments.courseId,
      courseName: schema.courses.name,
      attemptLimit: schema.assessments.attemptLimit,
      reviewMode: schema.assessments.reviewMode,
      retakeThreshold: schema.assessments.retakeThreshold,
      optionalRetakes: schema.assessments.optionalRetakes,
      showResultsImmediately: schema.assessments.showResultsImmediately,
    })
    .from(schema.assessments)
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(
      and(
        eq(schema.assessments.isPublished, true),
        or(
          eq(schema.assessments.ownerId, teacherId),
          sql`exists (select 1 from ${schema.shares} s where s.resource_type = 'assessment' and s.resource_id = ${schema.assessments.id} and s.shared_with_user_id = ${teacherId} and s.permission in ('copy', 'co_edit'))`
        )
      )
    )
    .orderBy(asc(schema.assessments.title));
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export type StudentCardState = "upcoming" | "not_started" | "in_progress" | "done" | "closed";

export type StudentAssignment = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  className: string;
  teacherLastName: string;
  opensAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  attemptsAllowed: number | null;
  needsCode: boolean;
  resultsReleased: boolean;
  status: AssignmentStatus;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  bestPercent: number | null;
  state: StudentCardState;
};

/**
 * Rule: a student sees assignments only for classes they're enrolled in. Open ones
 * are listed with an action; scheduled ones show their open date; closed ones stay
 * visible only when the student has work in them.
 */
export async function listStudentAssignments(
  studentId: string,
  now = new Date()
): Promise<StudentAssignment[]> {
  const classIds = (
    await db
      .select({ classId: schema.enrollments.classId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.studentId, studentId))
  ).map((e) => e.classId);
  if (classIds.length === 0) return [];
  const rows = await db
    .select({
      id: schema.assignments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      className: schema.classes.name,
      teacherLastName: schema.users.lastName,
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
      timeLimitMinutes: schema.assignments.timeLimitMinutes,
      attemptsAllowed: schema.assignments.attemptsAllowed,
      accessCode: schema.assignments.accessCode,
      resultsReleased: schema.assignments.resultsReleased,
      attemptsUsed: sql<number>`(select count(*)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId})`,
      inProgressAttemptId: sql<
        string | null
      >`(select a.id from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress' order by a.number desc limit 1)`,
      bestPercent: sql<
        number | null
      >`(select max(a.percent) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.assignments.ownerId, schema.users.id))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(asc(schema.assignments.closesAt), desc(schema.assignments.createdAt));

  return rows
    .map(({ accessCode, ...r }): StudentAssignment => {
      const status = assignmentStatus(r, now);
      let state: StudentCardState;
      if (status === "scheduled") state = "upcoming";
      else if (status === "closed") state = "closed";
      else if (r.inProgressAttemptId) state = "in_progress";
      else if (r.attemptsUsed > 0) state = "done";
      else state = "not_started";
      return {
        ...r,
        needsCode: !!accessCode,
        status,
        state,
        bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
      };
    })
    .filter((r) => r.state !== "closed" || r.attemptsUsed > 0);
}
