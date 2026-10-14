/**
 * Reopen reads (Jon, Oct 14 2026, docs/student-home-plan.md R5; rules in `src/lib/reopen.ts`):
 * the approved reopen (`attempt_unlocks.open_until`) a student's close is worked out from, as an
 * SQL fragment for reads that list many tests or attempts in one query, and as a one-attempt read
 * for the actions. Reads only. Callers pass the guards first.
 */
import { and, asc, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { capRetakeWindow } from "@/lib/assignments";
import { correctionsCapOn } from "@/lib/grading";
import { correctionsRule } from "@/lib/retakes";

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

/**
 * The cap's retake window has passed for the student on a test still open by its own close, with
 * any approval left aside (Jon, Oct 14 2026: "Let them ask while it's still open too"): asking is
 * accepted there, and Approve gives the retake an end (`open_until`) as on a closed test. The
 * same rule as the card (`capRetakeWindow`: the cap applies, a retake is on offer, attempt 1 is
 * in). Reads only; callers pass the guards first.
 */
export async function capWindowPassed(
  assignmentId: string,
  studentId: string,
  now: Date
): Promise<boolean> {
  const [a] = await db
    .select({
      closesAt: schema.assignments.closesAt,
      correctionsCap: schema.assignments.correctionsCap,
      retakeWindowDays: schema.assignments.retakeWindowDays,
      retakeThreshold: schema.assignments.retakeThreshold,
      type: schema.assessments.type,
      cvtcRules: schema.courses.cvtcRules,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!a) return false;
  const [first] = await db
    .select({
      percent: schema.attempts.percent,
      submittedAt: sql<Date | null>`min(${schema.attempts.submittedAt}) over ()`.mapWith(
        (v: Date | string | null) => (v ? new Date(v) : null)
      ),
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(asc(schema.attempts.number))
    .limit(1);
  if (!first) return false;
  const capped = correctionsCapOn(a);
  return capRetakeWindow({
    capped,
    rule: correctionsRule({
      type: a.type,
      capped,
      cvtcRules: !!a.cvtcRules,
      firstPercent: first.percent,
      threshold: a.retakeThreshold,
    }),
    open: !a.closesAt || now < a.closesAt,
    retakeWindowDays: a.retakeWindowDays,
    firstSubmittedAt: first.submittedAt,
    openUntil: null,
    now,
  }).passed;
}
