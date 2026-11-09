/**
 * Abandoned attempts close (hardening plan H3.2, Nov 9 2026).
 *
 * A timed test whose clock ran out was only submitted when that student next opened it, so a
 * student who walked away left an attempt "in progress" for good, and the teacher had no way to
 * finish it. The sweep runs the same two steps the student's own Start runs (`settleAttempt`,
 * then the deadline), from the pages where someone is looking: the teacher's dashboard and
 * results, and the student's home.
 *
 * It never ends a test early: a paused attempt stays paused (Finish later), and an attempt is
 * only submitted once its time limit, plus the grace, is over. It also finishes an attempt whose
 * submit was claimed but never graded (H1.4).
 */
import { and, eq, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity-log";
import { settleAttempt } from "@/lib/attempt-pause";
import { CLAIM_STALE_MS, claimAttempt, finalizeAttempt } from "@/lib/attempts";

/** The same grace the student's own writes get after the deadline. */
export const DEADLINE_GRACE_MS = 5_000;

export type SweepScope = { ownerId: string } | { studentId: string } | { assignmentId: string };

/** Submit what is out of time within the scope. Returns how many attempts were finished. */
export async function closeExpiredAttempts(scope: SweepScope, now = new Date()): Promise<number> {
  const a = schema.attempts;
  const deadline = new Date(now.getTime() - DEADLINE_GRACE_MS);
  const stale = new Date(now.getTime() - CLAIM_STALE_MS);
  const within: SQL =
    "ownerId" in scope
      ? eq(schema.assignments.ownerId, scope.ownerId)
      : "studentId" in scope
        ? eq(a.studentId, scope.studentId)
        : eq(a.assignmentId, scope.assignmentId);
  const due = await db
    .select({
      id: a.id,
      studentId: a.studentId,
      assignmentId: a.assignmentId,
      number: a.number,
      dueAt: a.dueAt,
      submittedAt: a.submittedAt,
    })
    .from(a)
    .innerJoin(schema.assignments, eq(a.assignmentId, schema.assignments.id))
    .where(
      and(
        within,
        eq(a.status, "in_progress"),
        isNull(a.pausedAt),
        or(
          and(isNotNull(a.submittedAt), lt(a.lastActiveAt, stale)),
          and(isNull(a.submittedAt), isNotNull(a.dueAt), lt(a.dueAt, deadline))
        )
      )
    )
    .limit(30);

  let finished = 0;
  for (const row of due) {
    try {
      // An idle or window-closed attempt pauses rather than ends, exactly as when the student returns.
      if (!row.submittedAt && (await settleAttempt(row.id, now))) continue;
      const at = row.submittedAt ?? row.dueAt ?? now;
      if ((await claimAttempt(row.id, at, now)) !== "claimed") continue;
      const score = await finalizeAttempt(row.id, at);
      await logActivity({
        userId: row.studentId,
        kind: "attempt_submitted",
        assignmentId: row.assignmentId,
        at,
        detail: {
          attemptNumber: row.number,
          percent: score.pendingManual > 0 ? null : score.percent,
        },
      });
      finished += 1;
    } catch (err) {
      // One attempt that won't grade must not take the page down; the next load tries again.
      console.error("[attempt-sweep] could not finish attempt", row.id, err);
    }
  }
  return finished;
}
