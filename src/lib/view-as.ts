/**
 * "View as student" (Jon, Oct 1 2026): a teacher opens a student's pages
 * exactly as that student sees them, read-only. A cookie names the student;
 * every request re-checks that the signed-in teacher owns a class the student
 * is enrolled in, so a stale or forged cookie can never select someone else's
 * student. While it is on, `withAuthz` refuses every server action.
 */
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Session } from "@/lib/session";
import { VIEW_AS_COOKIE } from "@/lib/view-as-cookie";

export { VIEW_AS_COOKIE };

/** Cookie value: "<studentId>|<classId>" so leaving returns to the class page. */
export function parseViewAs(
  value: string | undefined
): { studentId: string; classId: string } | null {
  if (!value) return null;
  const [studentId, classId] = value.split("|");
  return studentId && classId ? { studentId, classId } : null;
}

/**
 * Rule: only a teacher (or admin) may view as a student, and only a student
 * enrolled in a class that teacher owns. Anything else leaves the real session
 * untouched.
 */
export async function resolveViewAs(real: Session, studentId: string | null): Promise<Session> {
  if (!studentId || (real.role !== "teacher" && real.role !== "admin")) return real;
  const [student] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .innerJoin(schema.enrollments, eq(schema.enrollments.studentId, schema.users.id))
    .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
    .where(
      and(
        eq(schema.users.id, studentId),
        eq(schema.users.role, "student"),
        eq(schema.classes.ownerId, real.userId)
      )
    )
    .limit(1);
  if (!student) return real;
  return {
    userId: student.id,
    role: "student",
    email: student.email,
    username: student.username,
    firstName: student.firstName,
    lastName: student.lastName,
    viewingAs: {
      teacherId: real.userId,
      teacherName: `${real.firstName} ${real.lastName}`,
    },
  };
}

/** The cookie's target, if any. Safe outside a request (returns null). */
export async function readViewAsCookie(): Promise<{ studentId: string; classId: string } | null> {
  try {
    return parseViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Callers check ownership and enrollment first. Two hours, then it lapses on its own. */
export async function setViewAsCookie(studentId: string, classId: string): Promise<void> {
  (await cookies()).set(VIEW_AS_COOKIE, `${studentId}|${classId}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 2,
  });
}

export async function clearViewAsCookie(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
}
