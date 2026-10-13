/**
 * The Dashboard's version stamp (Jon, Oct 13 2026, dashboard plan build step 5: "live refresh,
 * coarse version stamp, never attempts.updated_at; 15 s poll while visible"). The page polls
 * `/api/dashboard/version?class=` and refreshes only when this changes. Rules in
 * `src/lib/live-refresh.ts`.
 *
 * Two queries, no writes:
 * - one row of counts and newest moments across everything the page shows for the teacher (the
 *   "Needs you" list covers all their courses): attempts starting, submitting, pausing, asked
 *   about, graded; corrections by status; retake unlocks and requests; final scores; relearning
 *   gates; check-offs; assignment settings and windows opening or closing; rosters; unmatched
 *   worksheet emails; and the newest activity log row of their students;
 * - the shown class's open tests, worked out in code (`openTestsPart`): which are paused now,
 *   and the minute while someone is testing.
 * `updated_at` on attempts and `last_active_at` never go into the stamp (they move on every
 * heartbeat and save); `last_active_at` is only read to tell paused from testing. Callers pass
 * requireTeacher (and requireOwner on the class) first.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { openTestsPart, stampOf } from "@/lib/live-refresh";

/** Newest moment of a column as epoch seconds (0 when none); a fixed text form for the stamp. */
const newest = (col: string) => sql.raw(`coalesce(extract(epoch from max(${col})), 0)`);

export async function getDashboardVersion(
  teacherId: string,
  classId: string | null,
  now = new Date()
): Promise<string> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const mine = sql`(select s.id from ${schema.assignments} s where s.owner_id = ${teacherId})`;
  const myStudents = sql`(select e.student_id from ${schema.enrollments} e join ${schema.classes} k on k.id = e.class_id where k.owner_id = ${teacherId})`;
  const [scalars, open] = await Promise.all([
    db
      .select({
        attempts: sql<string>`(select concat_ws(':', count(*), count(a.submitted_at), count(a.paused_at), count(a.resume_requested_at), count(a.graded_at), ${newest("a.started_at")}, ${newest("a.submitted_at")}, ${newest("a.paused_at")}, ${newest("a.resume_requested_at")}, ${newest("a.graded_at")}) from ${schema.attempts} a where a.assignment_id in ${mine})`,
        corrections: sql<string>`(select concat_ws(':', count(*) filter (where c.status = 'draft'), count(*) filter (where c.status = 'submitted'), count(*) filter (where c.status = 'approved'), count(*) filter (where c.status = 'returned'), ${newest("c.submitted_at")}, ${newest("c.reviewed_at")}) from ${schema.corrections} c join ${schema.attempts} a on a.id = c.attempt_id where a.assignment_id in ${mine})`,
        unlocks: sql<string>`(select concat_ws(':', count(*), count(u.granted_at), ${newest("u.requested_at")}, ${newest("u.granted_at")}) from ${schema.attemptUnlocks} u where u.assignment_id in ${mine})`,
        finals: sql<string>`(select concat_ws(':', count(*), ${newest("f.computed_at")}) from ${schema.assignmentFinalScores} f where f.assignment_id in ${mine})`,
        gates: sql<string>`(select concat_ws(':', count(*), count(*) filter (where g.corrections_ok), count(*) filter (where g.activity_ok), count(*) filter (where g.practice_ok), count(*) filter (where g.opted_in), count(g.unlocked_at)) from ${schema.retakeGates} g where g.assignment_id in ${mine})`,
        assignments: sql<string>`(select concat_ws(':', count(*), count(*) filter (where s.opens_at <= ${at}), count(*) filter (where s.closes_at <= ${at}), ${newest("s.updated_at")}) from ${schema.assignments} s where s.owner_id = ${teacherId})`,
        roster: sql<string>`(select concat_ws(':', count(*), ${newest("e.created_at")}) from ${schema.enrollments} e join ${schema.classes} k on k.id = e.class_id where k.owner_id = ${teacherId})`,
        checkOffs: sql<string>`(select concat_ws(':', count(*), count(*) filter (where ac.teacher_verified), ${newest("ac.completed_at")}) from ${schema.activityCompletions} ac join ${schema.relearningActivities} r on r.id = ac.activity_id where r.owner_id = ${teacherId})`,
        // The feed's longest span is 3 days; the bound keeps this on the time index.
        log: sql<string>`(select ${newest("l.created_at")} from ${schema.activityLog} l where l.created_at >= ${at} - interval '3 days' and l.user_id in ${myStudents})`,
        worksheets: sql<string>`(select count(*) from ${schema.worksheetEvents} w join ${schema.worksheets} ws on ws.id = w.worksheet_id where ws.owner_id = ${teacherId} and w.student_id is null)`,
      })
      .from(schema.users)
      .where(eq(schema.users.id, teacherId))
      .limit(1),
    classId
      ? db
          .select({
            id: schema.attempts.id,
            status: schema.attempts.status,
            startedAt: schema.attempts.startedAt,
            dueAt: schema.attempts.dueAt,
            pausedAt: schema.attempts.pausedAt,
            pauseReason: schema.attempts.pauseReason,
            lastActiveAt: schema.attempts.lastActiveAt,
            closesAt: schema.assignments.closesAt,
          })
          .from(schema.attempts)
          .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
          .where(
            and(
              eq(schema.assignments.classId, classId),
              eq(schema.attempts.status, "in_progress"),
              inArray(
                schema.attempts.studentId,
                db
                  .select({ id: schema.enrollments.studentId })
                  .from(schema.enrollments)
                  .where(eq(schema.enrollments.classId, classId))
              )
            )
          )
      : Promise.resolve([]),
  ]);
  const s = scalars[0];
  return stampOf([
    classId,
    s?.attempts,
    s?.corrections,
    s?.unlocks,
    s?.finals,
    s?.gates,
    s?.assignments,
    s?.roster,
    s?.checkOffs,
    s?.log,
    s?.worksheets,
    openTestsPart(open, now),
  ]);
}
