/**
 * Class and roster reads. Callers must have passed requireTeacher() /
 * requireOwner() first; these functions scope by the ids they are given.
 */
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type ClassSummary = {
  id: string;
  name: string;
  period: string | null;
  term: string | null;
  courseId: string | null;
  courseName: string | null;
  students: number;
  createdAt: Date;
  sortOrder: number;
};

/** The teacher's own order first (Jon, Oct 1 2026); untouched classes fall back to period, then name. */
export async function listClasses(teacherId: string): Promise<ClassSummary[]> {
  return db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      period: schema.classes.period,
      term: schema.classes.term,
      courseId: schema.classes.courseId,
      courseName: schema.courses.name,
      students: count(schema.enrollments.id),
      createdAt: schema.classes.createdAt,
      sortOrder: schema.classes.sortOrder,
    })
    .from(schema.classes)
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .leftJoin(schema.enrollments, eq(schema.enrollments.classId, schema.classes.id))
    .where(eq(schema.classes.ownerId, teacherId))
    .groupBy(schema.classes.id, schema.courses.name)
    .orderBy(
      asc(schema.classes.sortOrder),
      sql`nullif(regexp_replace(coalesce(${schema.classes.period}, ''), '\D', '', 'g'), '')::int nulls last`,
      asc(schema.classes.name)
    );
}

export type RosterRow = {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  lastLoginAt: Date | null;
  /** Latest logged milestone (login, attempt, practice…); falls back to the login time. */
  lastSeenAt: Date | null;
  mustChangePassword: boolean;
  enrolledAt: Date;
  extraTimePercent: number;
  fontScale: number;
  /** The student typed a name that wasn't on the roster; worth a look. */
  selfEntered?: boolean;
};

export async function getClassDetail(classId: string) {
  const [cls] = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      period: schema.classes.period,
      term: schema.classes.term,
      courseName: schema.courses.name,
      ownerId: schema.classes.ownerId,
      joinCode: schema.classes.joinCode,
      joinOpen: schema.classes.joinOpen,
    })
    .from(schema.classes)
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .where(eq(schema.classes.id, classId))
    .limit(1);
  if (!cls) return null;

  const rosterRows = await db
    .select({
      enrollmentId: schema.enrollments.id,
      studentId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      username: schema.users.username,
      lastLoginAt: schema.users.lastLoginAt,
      lastSeenAt: sql<Date | null>`greatest((select max(l.created_at) from ${schema.activityLog} l where l.user_id = ${schema.users.id}), ${schema.users.lastLoginAt})`,
      mustChangePassword: schema.users.mustChangePassword,
      enrolledAt: schema.enrollments.createdAt,
      extraTimePercent: schema.enrollments.extraTimePercent,
      fontScale: schema.enrollments.fontScale,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(eq(schema.enrollments.classId, classId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
  // The greatest() subquery comes back as text from the driver; make it a Date like its neighbours.
  const roster: RosterRow[] = rosterRows.map((r) => ({
    ...r,
    lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt) : null,
  }));

  const pending = await db
    .select({
      id: schema.rosterNames.id,
      firstName: schema.rosterNames.firstName,
      lastName: schema.rosterNames.lastName,
    })
    .from(schema.rosterNames)
    .where(and(eq(schema.rosterNames.classId, classId), isNull(schema.rosterNames.studentId)))
    .orderBy(asc(schema.rosterNames.lastName), asc(schema.rosterNames.firstName));
  const selfEntered = new Set(
    (
      await db
        .select({ studentId: schema.rosterNames.studentId })
        .from(schema.rosterNames)
        .where(
          and(eq(schema.rosterNames.classId, classId), eq(schema.rosterNames.selfEntered, true))
        )
    ).map((r) => r.studentId)
  );

  return {
    ...cls,
    roster: roster.map((r) => ({ ...r, selfEntered: selfEntered.has(r.studentId) })),
    pending,
  };
}

export async function listCourses(teacherId: string) {
  return db
    .select({ id: schema.courses.id, name: schema.courses.name })
    .from(schema.courses)
    .where(eq(schema.courses.ownerId, teacherId))
    .orderBy(asc(schema.courses.name));
}

/** The classes a student is enrolled in, for the student home. */
export async function listStudentClasses(studentId: string) {
  return db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      period: schema.classes.period,
      courseName: schema.courses.name,
      teacherFirstName: schema.users.firstName,
      teacherLastName: schema.users.lastName,
    })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .innerJoin(schema.users, eq(schema.classes.ownerId, schema.users.id))
    .where(and(eq(schema.enrollments.studentId, studentId)))
    .orderBy(asc(schema.classes.name));
}
