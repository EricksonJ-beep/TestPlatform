/**
 * Reopen reads (Jon, Oct 14 2026, docs/student-home-plan.md R5; rules in `src/lib/reopen.ts`):
 * the approved reopen (`attempt_unlocks.open_until`) a student's close is worked out from, as an
 * SQL fragment for reads that list many tests or attempts in one query, and as a one-attempt read
 * for the actions. Reads only. Callers pass the guards first.
 */
import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * SQL: the approved reopen's end for the student's attempt in play on the assignment (the open
 * one, or the next one when none is open: finished attempts + 1); null when there is none. The
 * arguments must render table-qualified (a column of a joined read, or a bound value).
 */
export function openUntilInPlay(assignmentId: SQL, studentId: SQL): SQL<Date | null> {
  return sql<Date | null>`(select u.open_until from ${schema.attemptUnlocks} u where u.assignment_id = ${assignmentId} and u.student_id = ${studentId} and u.granted_at is not null and u.attempt_number = (select count(*) + 1 from ${schema.attempts} x where x.assignment_id = ${assignmentId} and x.student_id = ${studentId} and x.status <> 'in_progress'))`.mapWith(
    (v: Date | string | null) => (v ? new Date(v) : null)
  );
}

/**
 * SQL, in a read over `attempts` (by that name, not aliased): the approved reopen's end for that
 * attempt's own number. Raw names, since a one-table select leaves columns unqualified.
 */
export const attemptOpenUntil =
  sql<Date | null>`(select u.open_until from ${schema.attemptUnlocks} u where u.assignment_id = attempts.assignment_id and u.student_id = attempts.student_id and u.attempt_number = attempts.number and u.granted_at is not null)`.mapWith(
    (v: Date | string | null) => (v ? new Date(v) : null)
  );

/** The approved reopen's end for one attempt number of one student; null when there is none. */
export async function openUntilFor(
  assignmentId: string,
  studentId: string,
  attemptNumber: number
): Promise<Date | null> {
  const [row] = await db
    .select({ openUntil: schema.attemptUnlocks.openUntil })
    .from(schema.attemptUnlocks)
    .where(
      and(
        eq(schema.attemptUnlocks.assignmentId, assignmentId),
        eq(schema.attemptUnlocks.studentId, studentId),
        eq(schema.attemptUnlocks.attemptNumber, attemptNumber),
        isNotNull(schema.attemptUnlocks.grantedAt)
      )
    )
    .limit(1);
  return row?.openUntil ?? null;
}
