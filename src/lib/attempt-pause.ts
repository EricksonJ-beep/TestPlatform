/**
 * Server-only Finish later (Jon, Oct 13 2026; rules in src/lib/pause.ts):
 * pause an attempt, settle one that should already be paused (idle or past
 * its window), reopen it with the teacher's resume code or the teacher's OK,
 * and issue resume codes. Nothing here checks who is asking; the actions do.
 */
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { codesMatch, generateAccessCode } from "@/lib/assignments";
import {
  RESUME_CODE_MS,
  lockAnswered,
  pausePoint,
  remainingAt,
  remainingAtClose,
  resumedDueAt,
  sameMoment,
  type PauseReason,
} from "@/lib/pause";

/** Pause an open attempt as of `at`: stop the clock, lock every answered question. */
export async function pauseAttempt(
  attemptId: string,
  at: Date,
  reason: PauseReason,
  /** Time owed on resume, when it is not simply the deadline minus `at` (a window close). */
  remainingMs?: number | null
): Promise<boolean> {
  const attempt = await db.query.attempts.findFirst({
    columns: { status: true, pausedAt: true, dueAt: true, lockedQuestionIds: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt || attempt.status !== "in_progress" || attempt.pausedAt) return false;
  const answered = await db
    .select({ questionId: schema.responses.questionId })
    .from(schema.responses)
    .where(and(eq(schema.responses.attemptId, attemptId), isNotNull(schema.responses.answer)));
  await db
    .update(schema.attempts)
    .set({
      pausedAt: at,
      pauseReason: reason,
      remainingMs: remainingMs === undefined ? remainingAt(attempt.dueAt, at) : remainingMs,
      dueAt: null,
      lockedQuestionIds: lockAnswered(
        attempt.lockedQuestionIds ?? [],
        answered.map((r) => r.questionId)
      ),
    })
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.status, "in_progress")));
  return true;
}

/**
 * Bring an attempt up to date before anyone reads or writes it: pause it if it
 * sat idle for 10 minutes or its window closed while it was open. Returns
 * whether it is paused now.
 */
export async function settleAttempt(attemptId: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({
      status: schema.attempts.status,
      startedAt: schema.attempts.startedAt,
      dueAt: schema.attempts.dueAt,
      pausedAt: schema.attempts.pausedAt,
      lastActiveAt: schema.attempts.lastActiveAt,
      closesAt: schema.assignments.closesAt,
      timeLimitMinutes: schema.assignments.timeLimitMinutes,
      extraTimePercent: schema.enrollments.extraTimePercent,
    })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .leftJoin(
      schema.enrollments,
      and(
        eq(schema.enrollments.classId, schema.assignments.classId),
        eq(schema.enrollments.studentId, schema.attempts.studentId)
      )
    )
    .where(eq(schema.attempts.id, attemptId))
    .limit(1);
  if (!row) return false;
  if (row.pausedAt) return row.status === "in_progress";
  const point = pausePoint(row, row.closesAt, now);
  if (!point) return false;
  // A deadline that is the window's close hides the time limit; work it out again.
  const owed =
    point.reason === "closed" && row.closesAt && row.dueAt && sameMoment(row.dueAt, row.closesAt)
      ? remainingAtClose({
          startedAt: row.startedAt,
          timeLimitMinutes: row.timeLimitMinutes,
          extraTimePercent: row.extraTimePercent ?? 0,
          closesAt: row.closesAt,
        })
      : undefined;
  return pauseAttempt(attemptId, point.at, point.reason, owed);
}

/** Record a sign of work; keeps the idle pause away. */
export async function touchAttempt(attemptId: string, now = new Date()): Promise<void> {
  await db
    .update(schema.attempts)
    .set({ lastActiveAt: now })
    .where(eq(schema.attempts.id, attemptId));
}

/** Reopen a paused attempt: the clock restarts from the time that was left. */
export async function resumeAttempt(attemptId: string, now = new Date()): Promise<boolean> {
  const attempt = await db.query.attempts.findFirst({
    columns: { status: true, pausedAt: true, remainingMs: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt || attempt.status !== "in_progress" || !attempt.pausedAt) return false;
  await db
    .update(schema.attempts)
    .set({
      pausedAt: null,
      pauseReason: null,
      dueAt: resumedDueAt(attempt.remainingMs, now),
      remainingMs: null,
      lastActiveAt: now,
      resumeRequestedAt: null,
    })
    .where(eq(schema.attempts.id, attemptId));
  return true;
}

/** The teacher's code that is still good, if any (newest first). */
export async function currentResumeCode(
  teacherId: string,
  now = new Date()
): Promise<{ code: string; expiresAt: Date } | null> {
  const row = await db.query.resumeCodes.findFirst({
    columns: { code: true, expiresAt: true },
    where: and(eq(schema.resumeCodes.teacherId, teacherId), gt(schema.resumeCodes.expiresAt, now)),
    orderBy: [desc(schema.resumeCodes.expiresAt)],
  });
  return row ?? null;
}

/** A fresh code for one class period; earlier codes stop working. */
export async function issueResumeCode(
  teacherId: string,
  now = new Date()
): Promise<{ code: string; expiresAt: Date }> {
  await db
    .update(schema.resumeCodes)
    .set({ expiresAt: now })
    .where(and(eq(schema.resumeCodes.teacherId, teacherId), gt(schema.resumeCodes.expiresAt, now)));
  const code = generateAccessCode();
  const expiresAt = new Date(now.getTime() + RESUME_CODE_MS);
  await db.insert(schema.resumeCodes).values({ teacherId, code, expiresAt });
  return { code, expiresAt };
}

/** Whether `given` is the teacher's resume code right now. */
export async function resumeCodeValid(
  teacherId: string,
  given: string,
  now = new Date()
): Promise<boolean> {
  const current = await currentResumeCode(teacherId, now);
  return !!current && codesMatch(given, current.code);
}
