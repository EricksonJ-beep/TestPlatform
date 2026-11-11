/**
 * Which school an account belongs to (hardening plan H4.8; Jon, Nov 11 2026: "Go with limiting
 * it to the same school").
 *
 * A teacher who typed an email that already had a student account used to enroll that account
 * at once, and could then reset its password and view as that student. That is right for a
 * student who has Biology with one Cadott teacher and Physical Science with another. It is wrong
 * for a teacher at some other school who only knows the email.
 *
 * Bloom runs for one school today, and the teacher invite code is that school's key, so every
 * account made here belongs to it. `ensureSingleSchool` writes that down once (accounts made
 * before this had no school recorded), and new teacher accounts are given it at signup. When a
 * second school is ever added, its teachers get their own organization and the rule below
 * starts to bite without any other change.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

/** The name written when no school has been recorded yet. */
export const DEFAULT_SCHOOL_NAME = "Cadott High School";

/**
 * Rule: a teacher may enroll an account that already exists only if
 *   - the student is already in one of that teacher's own classes, or
 *   - teacher and student are recorded at the same school.
 * No school on either side is not a match. Anyone else joins with the class code, which is the
 * student's own act.
 */
export function mayEnrollExisting(input: {
  teacherOrganizationId: string | null;
  studentOrganizationId: string | null;
  alreadyThisTeachersStudent: boolean;
}): boolean {
  if (input.alreadyThisTeachersStudent) return true;
  return (
    !!input.teacherOrganizationId && input.teacherOrganizationId === input.studentOrganizationId
  );
}

/** Is this student in any class this teacher owns? */
export async function isTeachersStudent(teacherId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.enrollments.id })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
    .where(and(eq(schema.enrollments.studentId, studentId), eq(schema.classes.ownerId, teacherId)))
    .limit(1);
  return !!row;
}

/** The school a new teacher account joins: the only one there is. Null when there are none, or several. */
export async function defaultOrganizationId(): Promise<string | null> {
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(2);
  return orgs.length === 1 ? orgs[0].id : null;
}

/**
 * Record the one school on every account that has none. Creates the school if no organization
 * exists; does nothing when there are several (then it isn't a guess anyone should make).
 * Safe to run again: it only fills blanks.
 */
export async function ensureSingleSchool(
  name = DEFAULT_SCHOOL_NAME
): Promise<{ organizationId: string | null; created: boolean; filled: number }> {
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(2);
  if (orgs.length > 1) return { organizationId: null, created: false, filled: 0 };
  let organizationId = orgs[0]?.id ?? null;
  let created = false;
  if (!organizationId) {
    const [row] = await db
      .insert(schema.organizations)
      .values({ name })
      .returning({ id: schema.organizations.id });
    organizationId = row.id;
    created = true;
  }
  const filled = await db
    .update(schema.users)
    .set({ organizationId })
    .where(isNull(schema.users.organizationId))
    .returning({ id: schema.users.id });
  return { organizationId, created, filled: filled.length };
}
