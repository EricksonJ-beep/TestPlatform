/**
 * Class and roster reads. Callers must have passed requireTeacher() /
 * requireOwner() first; these functions scope by the ids they are given.
 */
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type ClassSummary = {
  id: string;
  name: string;
  period: string | null;
  term: string | null;
  courseName: string | null;
  students: number;
  createdAt: Date;
};

export async function listClasses(teacherId: string): Promise<ClassSummary[]> {
  return db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      period: schema.classes.period,
      term: schema.classes.term,
      courseName: schema.courses.name,
      students: count(schema.enrollments.id),
      createdAt: schema.classes.createdAt,
    })
    .from(schema.classes)
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .leftJoin(schema.enrollments, eq(schema.enrollments.classId, schema.classes.id))
    .where(eq(schema.classes.ownerId, teacherId))
    .groupBy(schema.classes.id, schema.courses.name)
    .orderBy(desc(schema.classes.createdAt));
}

export type RosterRow = {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  enrolledAt: Date;
  extraTimePercent: number;
  fontScale: number;
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
    })
    .from(schema.classes)
    .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
    .where(eq(schema.classes.id, classId))
    .limit(1);
  if (!cls) return null;

  const roster: RosterRow[] = await db
    .select({
      enrollmentId: schema.enrollments.id,
      studentId: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      lastLoginAt: schema.users.lastLoginAt,
      mustChangePassword: schema.users.mustChangePassword,
      enrolledAt: schema.enrollments.createdAt,
      extraTimePercent: schema.enrollments.extraTimePercent,
      fontScale: schema.enrollments.fontScale,
    })
    .from(schema.enrollments)
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(eq(schema.enrollments.classId, classId))
    .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));

  return { ...cls, roster };
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
