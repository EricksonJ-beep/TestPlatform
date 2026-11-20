/**
 * Practice leaderboard reads (rules in src/lib/leaderboard.ts). Callers have passed
 * requireOwner() on the class, or requireStudent() with a class the student is enrolled in.
 */
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeaderboardEntry } from "@/lib/leaderboard";

/**
 * Every enrolled student with the practice questions they got right without a reveal: practice
 * sets and Build my practice on the class's course, and practice checks on the class's
 * assignments. Counted in the database from the stored answers.
 */
export async function getClassLeaderboard(classId: string): Promise<LeaderboardEntry[]> {
  const enrolled = sql`(select e.student_id from ${schema.enrollments} e where e.class_id = ${classId})`;
  const [roster, practice, checks] = await Promise.all([
    db
      .select({
        studentId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
      .where(eq(schema.enrollments.classId, classId))
      .orderBy(asc(schema.users.lastName), asc(schema.users.firstName)),
    db.execute<{ student_id: string; n: number }>(sql`
      select pa.student_id, count(*)::int as n
      from ${schema.practiceAttempts} pa
      left join ${schema.practiceSets} ps on ps.id = pa.practice_set_id
      join ${schema.classes} k on k.id = ${classId}
      cross join lateral jsonb_each(pa.answers) a
      where coalesce(ps.course_id, pa.course_id) = k.course_id
        and pa.student_id in ${enrolled}
        and left(a.key, 1) <> '_'
        and a.value->>'isCorrect' = 'true'
        and coalesce(a.value->>'revealed', 'false') <> 'true'
      group by pa.student_id`),
    db.execute<{ student_id: string; n: number }>(sql`
      select pc.student_id, count(*)::int as n
      from ${schema.practiceCheckRounds} r
      join ${schema.practiceChecks} pc on pc.id = r.check_id
      join ${schema.assignments} s on s.id = pc.assignment_id
      cross join lateral jsonb_each(r.answers) a
      where s.class_id = ${classId}
        and pc.student_id in ${enrolled}
        and a.value->>'correct' = 'true'
      group by pc.student_id`),
  ]);
  const count = new Map<string, number>();
  type Row = { student_id: string; n: number };
  for (const row of [...rowsOf<Row>(practice), ...rowsOf<Row>(checks)])
    count.set(row.student_id, (count.get(row.student_id) ?? 0) + Number(row.n));
  return roster.map((r) => ({ ...r, questions: count.get(r.studentId) ?? 0 }));
}

/** `db.execute` gives an array on one driver and `{ rows }` on the other. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
}
