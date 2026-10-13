/**
 * The course a teacher last worked in, remembered in a cookie and validated
 * against ownership on every read so a stale or forged cookie can never select
 * someone else's course. It only pre-selects the course in "new" dialogs; the
 * top-bar switcher was removed (Jon, Sept 28 2026) because it filtered nothing.
 * The Dashboard's class period is remembered the same way (Oct 13 2026).
 */
import { cookies } from "next/headers";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  CLASS_COOKIE,
  parseRememberedClasses,
  pickPeriod,
  rememberClassList,
} from "@/lib/class-focus";

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

export type PeriodOption = { id: string; name: string; period: string | null };

/**
 * The Dashboard gradebook's class (Jon, Oct 13 2026, dashboard plan decisions 1 and 8): the
 * teacher's own classes on the sidebar course, in their Classes-page order, and the one they
 * picked last in that course (the `bloom.class` cookie, checked against that list), else the
 * first. No course, or a course with no classes, gives null.
 */
export async function getCurrentClass(
  teacherId: string,
  courseId: string | null
): Promise<{ current: PeriodOption | null; classes: PeriodOption[] }> {
  if (!courseId) return { current: null, classes: [] };
  const classes = await db
    .select({ id: schema.classes.id, name: schema.classes.name, period: schema.classes.period })
    .from(schema.classes)
    .where(and(eq(schema.classes.ownerId, teacherId), eq(schema.classes.courseId, courseId)))
    .orderBy(
      asc(schema.classes.sortOrder),
      sql`nullif(regexp_replace(coalesce(${schema.classes.period}, ''), '\\D', '', 'g'), '')::int nulls last`,
      asc(schema.classes.name)
    );
  const remembered = parseRememberedClasses((await cookies()).get(CLASS_COOKIE)?.value);
  return { current: pickPeriod(classes, remembered), classes };
}

/** Remember the class period the teacher just picked on the Dashboard. Callers check ownership first. */
export async function rememberClass(classId: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    CLASS_COOKIE,
    rememberClassList(parseRememberedClasses(jar.get(CLASS_COOKIE)?.value), classId),
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    }
  );
}
