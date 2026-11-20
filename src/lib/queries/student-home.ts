/**
 * Two small reads for the student home (home pages redesign, BLOOM_HOME_REDESIGN.md §5–6), on
 * top of `listStudentAssignments`: each open attempt's per-question answered state (the question
 * dots and "Pick up at question n") and when a pending retake request was sent ("Asked …").
 * Reads only, and both are scoped to the student's own rows. Callers pass requireStudent first.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * For each of the student's open attempts: whether each question served has a saved answer, in
 * the order served (the same test `listStudentAssignments` counts "answered" by). An attempt that
 * isn't the student's own, or isn't open, is left out.
 */
export async function getAnswerMaps(
  studentId: string,
  attemptIds: string[]
): Promise<Map<string, boolean[]>> {
  const out = new Map<string, boolean[]>();
  if (attemptIds.length === 0) return out;
  const [attempts, answered] = await Promise.all([
    db
      .select({ id: schema.attempts.id, questionSet: schema.attempts.questionSet })
      .from(schema.attempts)
      .where(
        and(
          inArray(schema.attempts.id, attemptIds),
          eq(schema.attempts.studentId, studentId),
          eq(schema.attempts.status, "in_progress")
        )
      ),
    db
      .select({ attemptId: schema.responses.attemptId, questionId: schema.responses.questionId })
      .from(schema.responses)
      .innerJoin(schema.attempts, eq(schema.attempts.id, schema.responses.attemptId))
      .where(
        and(
          inArray(schema.responses.attemptId, attemptIds),
          eq(schema.attempts.studentId, studentId),
          isNotNull(schema.responses.answer)
        )
      ),
  ]);
  const done = new Set(answered.map((r) => `${r.attemptId}:${r.questionId}`));
  for (const a of attempts)
    out.set(
      a.id,
      [...a.questionSet]
        .sort((x, y) => x.order - y.order)
        .map((q) => done.has(`${a.id}:${q.questionId}`))
    );
  return out;
}

/** When the student sent each retake request the teacher hasn't answered, by assignment id. */
export async function getRetakeAskTimes(
  studentId: string,
  assignmentIds: string[]
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (assignmentIds.length === 0) return out;
  const rows = await db
    .select({
      assignmentId: schema.attemptUnlocks.assignmentId,
      at: sql<Date | string | null>`max(${schema.attemptUnlocks.requestedAt})`,
    })
    .from(schema.attemptUnlocks)
    .where(
      and(
        eq(schema.attemptUnlocks.studentId, studentId),
        inArray(schema.attemptUnlocks.assignmentId, assignmentIds),
        isNull(schema.attemptUnlocks.grantedAt),
        isNotNull(schema.attemptUnlocks.requestedAt)
      )
    )
    .groupBy(schema.attemptUnlocks.assignmentId);
  for (const r of rows) if (r.at) out.set(r.assignmentId, new Date(r.at));
  return out;
}
