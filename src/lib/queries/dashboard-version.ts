/**
 * The Dashboard's version stamp (Jon, Oct 13 2026, dashboard plan build step 5: "live refresh,
 * coarse version stamp, never attempts.updated_at; 15 s poll while visible"). The page polls
 * `/api/dashboard/version?class=` and refreshes only when this changes. Rules in
 * `src/lib/live-refresh.ts`.
 *
 * Three queries, no writes:
 * - one row of counts and newest moments across everything the page shows for the teacher (the
 *   "Needs you" list covers all their courses): attempts starting, submitting, pausing, asked
 *   about, graded; corrections sent in, approved or returned (not drafts, which change no tag);
 *   retake unlocks and requests; final scores; relearning gates; check-offs; assignment settings
 *   and windows opening or closing; rosters; unmatched worksheet emails (one per worksheet and
 *   email, as the inbox counts them); resume codes issued (the header shows the live one); and
 *   the time boundaries that change a tag with nothing written: a retake wait ending on a test
 *   that needs the teacher's OK ("Unlocked · after 2:15", "Can start after"), the cap's retake
 *   window closing, and its 48-hour "Retake by" mark (each a count of boundaries already passed);
 * - the newest event Recent activity would show, with the page's own feed filter
 *   (`newestActivityAt`: this class or all, the kind chips, Logins off by default);
 * - the shown class's open tests, worked out in code (`openTestsPart`): which are paused now,
 *   and the minute while someone is testing.
 * `updated_at` on attempts and `last_active_at` never go into the stamp (they move on every
 * heartbeat and save); `last_active_at` is only read to tell paused from testing. Callers pass
 * requireTeacher (and requireOwner on the class) first.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { feedGroups, parseFeedFilter, type FeedFilter } from "@/lib/activity-filter";
import { newestActivityAt } from "@/lib/activity-log";
import { openTestsPart, stampOf } from "@/lib/live-refresh";

/** Newest moment of a column as epoch seconds (0 when none); a fixed text form for the stamp. */
const newest = (col: string) => sql.raw(`coalesce(extract(epoch from max(${col})), 0)`);

/**
 * The stamp for the teacher's Dashboard, with `classId` the class the gradebook shows and `feed`
 * the page's Recent activity filter (the default: this class, every kind, no logins, 24 hours).
 */
export async function getDashboardVersion(
  teacherId: string,
  classId: string | null,
  now = new Date(),
  feed: FeedFilter = parseFeedFilter({}, !!classId)
): Promise<string> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const mine = sql`(select s.id from ${schema.assignments} s where s.owner_id = ${teacherId})`;
  const [scalars, log, open] = await Promise.all([
    db
      .select({
        attempts: sql<string>`(select concat_ws(':', count(*), count(a.submitted_at), count(a.paused_at), count(a.resume_requested_at), count(a.graded_at), ${newest("a.started_at")}, ${newest("a.submitted_at")}, ${newest("a.paused_at")}, ${newest("a.resume_requested_at")}, ${newest("a.graded_at")}) from ${schema.attempts} a where a.assignment_id in ${mine})`,
        corrections: sql<string>`(select concat_ws(':', count(*) filter (where c.status = 'submitted'), count(*) filter (where c.status = 'approved'), count(*) filter (where c.status = 'returned'), ${newest("c.submitted_at")}, ${newest("c.reviewed_at")}) from ${schema.corrections} c join ${schema.attempts} a on a.id = c.attempt_id where a.assignment_id in ${mine})`,
        unlocks: sql<string>`(select concat_ws(':', count(*), count(u.granted_at), ${newest("u.requested_at")}, ${newest("u.granted_at")}) from ${schema.attemptUnlocks} u where u.assignment_id in ${mine})`,
        finals: sql<string>`(select concat_ws(':', count(*), ${newest("f.computed_at")}) from ${schema.assignmentFinalScores} f where f.assignment_id in ${mine})`,
        gates: sql<string>`(select concat_ws(':', count(*), count(*) filter (where g.corrections_ok), count(*) filter (where g.activity_ok), count(*) filter (where g.practice_ok), count(*) filter (where g.opted_in), count(g.unlocked_at)) from ${schema.retakeGates} g where g.assignment_id in ${mine})`,
        assignments: sql<string>`(select concat_ws(':', count(*), count(*) filter (where s.opens_at <= ${at}), count(*) filter (where s.closes_at <= ${at}), ${newest("s.updated_at")}) from ${schema.assignments} s where s.owner_id = ${teacherId})`,
        roster: sql<string>`(select concat_ws(':', count(*), ${newest("e.created_at")}) from ${schema.enrollments} e join ${schema.classes} k on k.id = e.class_id where k.owner_id = ${teacherId})`,
        checkOffs: sql<string>`(select concat_ws(':', count(*), count(*) filter (where ac.teacher_verified), ${newest("ac.completed_at")}) from ${schema.activityCompletions} ac join ${schema.relearningActivities} r on r.id = ac.activity_id where r.owner_id = ${teacherId})`,
        worksheets: sql<string>`(select count(distinct (w.worksheet_id, w.email)) from ${schema.worksheetEvents} w join ${schema.worksheets} ws on ws.id = w.worksheet_id where ws.owner_id = ${teacherId} and w.student_id is null)`,
        resumeCodes: sql<string>`(select concat_ws(':', count(*), ${newest("r.created_at")}) from ${schema.resumeCodes} r where r.teacher_id = ${teacherId})`,
        // Boundaries already passed, per student × test with a finished attempt: each crossing
        // moves the count, so a tag that changes with the clock alone refreshes the page.
        boundaries: sql<string>`(select concat_ws(':', count(*) filter (where p.need_ok and p.wait_h > 0 and p.last_sub + p.wait_h * interval '1 hour' <= ${at}), count(*) filter (where p.capped and p.first_sub + p.win_d * interval '1 day' <= ${at}), count(*) filter (where p.capped and p.first_sub + p.win_d * interval '1 day' - interval '48 hours' <= ${at})) from (select s.retakes_need_unlock as need_ok, s.retake_wait_hours as wait_h, (s.corrections_cap and m.type = 'formative' and not coalesce(co.cvtc_rules, false)) as capped, s.retake_window_days as win_d, min(a.submitted_at) as first_sub, max(a.submitted_at) as last_sub from ${schema.attempts} a join ${schema.assignments} s on s.id = a.assignment_id join ${schema.assessments} m on m.id = s.assessment_id left join ${schema.courses} co on co.id = m.course_id where s.owner_id = ${teacherId} and a.status <> 'in_progress' and (s.retakes_need_unlock or s.corrections_cap) group by a.assignment_id, a.student_id, s.retakes_need_unlock, s.retake_wait_hours, s.corrections_cap, m.type, co.cvtc_rules, s.retake_window_days) p)`,
      })
      .from(schema.users)
      .where(eq(schema.users.id, teacherId))
      .limit(1),
    newestActivityAt(classId && feed.scope === "class" ? { classId } : { teacherId }, {
      since: new Date(now.getTime() - feed.days * 86_400_000),
      groups: feedGroups(feed),
    }),
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
    log,
    s?.worksheets,
    s?.resumeCodes,
    s?.boundaries,
    openTestsPart(open, now),
  ]);
}
