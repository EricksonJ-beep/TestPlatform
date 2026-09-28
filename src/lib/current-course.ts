/**
 * The course a teacher last worked in, remembered in a cookie and validated
 * against ownership on every read so a stale or forged cookie can never select
 * someone else's course. It only pre-selects the course in "new" dialogs; the
 * top-bar switcher was removed (Jon, Sept 28 2026) because it filtered nothing.
 */
import { cookies } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const CURRENT_COURSE_COOKIE = "bloom.course";

export type CurrentCourse = { id: string; name: string } | null;

export async function getCurrentCourse(teacherId: string): Promise<{
  current: CurrentCourse;
  courses: { id: string; name: string }[];
}> {
  const courses = await db
    .select({ id: schema.courses.id, name: schema.courses.name })
    .from(schema.courses)
    .where(eq(schema.courses.ownerId, teacherId))
    .orderBy(asc(schema.courses.name));

  const wanted = (await cookies()).get(CURRENT_COURSE_COOKIE)?.value;
  const current = courses.find((c) => c.id === wanted) ?? courses[0] ?? null;
  return { current, courses };
}

/** Remember the course the teacher just used. Callers check ownership first. */
export async function rememberCourse(courseId: string): Promise<void> {
  (await cookies()).set(CURRENT_COURSE_COOKIE, courseId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** True when the course exists and belongs to the teacher. */
export async function ownsCourse(teacherId: string, courseId: string): Promise<boolean> {
  const row = await db.query.courses.findFirst({
    columns: { id: true },
    where: and(eq(schema.courses.id, courseId), eq(schema.courses.ownerId, teacherId)),
  });
  return !!row;
}
