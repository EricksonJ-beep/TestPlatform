"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { canStartAttempt, startReasonText } from "@/lib/assignments";
import { createAttempt, finalizeAttempt } from "@/lib/attempts";
import { correctionsClear } from "@/lib/corrections";
import { getCorrectionsSummary, latestFinishedAttemptId } from "@/lib/queries/corrections";
import {
  ActionError,
  type AttemptAccess,
  assertOwnStudentRow,
  requireAssignmentAccess,
  requireAttemptAccess,
  withAuthz,
} from "@/lib/authz";

/** Saves are accepted this long after the deadline to absorb clock skew and a slow last request. */
const GRACE_MS = 5_000;

const answerSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("choice"), optionId: z.string().uuid().nullable() }),
    z.object({ kind: z.literal("multi"), optionIds: z.array(z.string().uuid()).max(30) }),
    z.object({ kind: z.literal("text"), text: z.string().max(20_000) }),
    z.object({
      kind: z.literal("match"),
      pairs: z.record(z.string().uuid(), z.string().max(1_000)),
    }),
    z.object({ kind: z.literal("order"), optionIds: z.array(z.string().uuid()).max(30) }),
  ])
  .nullable();

function revalidate(assignmentId: string) {
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath("/app/assign");
}

/**
 * Start (or resume) an attempt. Rules: enrolled student only; inside the window;
 * access code if set; attempts remaining. An in-progress attempt is resumed; one
 * that ran past its deadline is submitted first.
 */
export const startAttempt = withAuthz(async (assignmentId: string, accessCode: string | null) => {
  const access = await requireAssignmentAccess(assignmentId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const now = new Date();

  const open = await db.query.attempts.findFirst({
    columns: { id: true, dueAt: true },
    where: and(
      eq(schema.attempts.assignmentId, assignmentId),
      eq(schema.attempts.studentId, access.userId),
      eq(schema.attempts.status, "in_progress")
    ),
  });
  if (open) {
    if (open.dueAt && open.dueAt.getTime() + GRACE_MS < now.getTime()) {
      await finalizeAttempt(open.id, open.dueAt);
    } else {
      return { attemptId: open.id, resumed: true };
    }
  }

  const assignment = await db.query.assignments.findFirst({
    columns: {
      opensAt: true,
      closesAt: true,
      accessCode: true,
      attemptsAllowed: true,
      retakeWaitHours: true,
    },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!assignment) throw new ActionError("Not found.", 404);
  const [last] = await db
    .select({ submittedAt: sql<Date | null>`max(${schema.attempts.submittedAt})` })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId),
        sql`${schema.attempts.status} <> 'in_progress'`
      )
    );
  const lastSubmittedAt = last?.submittedAt ? new Date(last.submittedAt) : null;
  const used = await db.$count(
    schema.attempts,
    and(
      eq(schema.attempts.assignmentId, assignmentId),
      eq(schema.attempts.studentId, access.userId)
    )
  );
  const check = canStartAttempt({
    assignment,
    attemptsUsed: used,
    lastSubmittedAt,
    accessCode,
    now,
  });
  if (!check.ok) {
    throw new ActionError(
      startReasonText(check),
      check.reason === "code_required" || check.reason === "code_wrong" ? 400 : 403,
      {
        accessCode:
          check.reason === "code_required" || check.reason === "code_wrong"
            ? [startReasonText(check)]
            : [],
      }
    );
  }
  // Rule (PLAN.md §4): no retake until corrections on the last attempt are done (and approved, in that mode).
  const lastAttemptId = await latestFinishedAttemptId(assignmentId, access.userId);
  const corrections = lastAttemptId ? await getCorrectionsSummary(lastAttemptId) : null;
  if (corrections && !correctionsClear(corrections)) {
    throw new ActionError(
      corrections.state === "submitted"
        ? "Your corrections are waiting for your teacher's approval."
        : `Finish your corrections on attempt ${corrections.attemptNumber} first.`,
      403
    );
  }
  let created;
  try {
    created = await createAttempt({ assignmentId, studentId: access.userId, now });
  } catch (err) {
    if (err instanceof Error && err.message === "empty")
      throw new ActionError("This test has no questions yet. Tell your teacher.", 409);
    throw err;
  }
  revalidate(assignmentId);
  return { attemptId: created.attemptId, resumed: false };
});

// Rule: only the attempt's own student may write to it, only while in progress, only before the deadline (+ grace).
async function writableAttempt(access: AttemptAccess) {
  const attemptId = access.attempt.id;
  assertOwnStudentRow(access, access.attempt);
  const attempt = await db.query.attempts.findFirst({
    columns: { id: true, status: true, dueAt: true, questionSet: true, assignmentId: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status !== "in_progress")
    throw new ActionError("This attempt is already submitted.", 409);
  if (attempt.dueAt && attempt.dueAt.getTime() + GRACE_MS < Date.now())
    throw new ActionError("Time is up.", 409);
  return { access, attempt };
}

/** Autosave one answer. The answer is stored as given; nothing is graded until submit. */
export const saveAnswer = withAuthz(
  async (attemptId: string, questionId: string, rawAnswer: unknown) => {
    const { attempt } = await writableAttempt(await requireAttemptAccess(attemptId));
    if (!attempt.questionSet.some((q) => q.questionId === questionId))
      throw new ActionError("That question isn't on this attempt.", 400);
    const parsed = answerSchema.safeParse(rawAnswer);
    if (!parsed.success) throw new ActionError("Couldn't read that answer.", 400);
    const answeredAt = new Date();
    await db
      .insert(schema.responses)
      .values({ attemptId, questionId, answer: parsed.data, answeredAt })
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: { answer: parsed.data, answeredAt },
      });
    return { savedAt: answeredAt.toISOString() };
  }
);

export const setFlag = withAuthz(
  async (attemptId: string, questionId: string, flagged: boolean) => {
    const { attempt } = await writableAttempt(await requireAttemptAccess(attemptId));
    if (!attempt.questionSet.some((q) => q.questionId === questionId))
      throw new ActionError("That question isn't on this attempt.", 400);
    await db
      .insert(schema.responses)
      .values({ attemptId, questionId, answer: null, flagged: !!flagged })
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: { flagged: !!flagged },
      });
    return { flagged: !!flagged };
  }
);

/** The security footer's count: leaving the tab is recorded for the teacher (PLAN.md §5, §6). */
export const recordTabSwitch = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const [row] = await db
    .update(schema.attempts)
    .set({ tabSwitches: sql`${schema.attempts.tabSwitches} + 1` })
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.status, "in_progress")))
    .returning({ tabSwitches: schema.attempts.tabSwitches });
  return { tabSwitches: row?.tabSwitches ?? 0 };
});

/**
 * Submit: grades with the pure library and writes every score server-side.
 * Accepted after the deadline too (that's the autosubmit), but never twice.
 */
export const submitAttempt = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const attempt = await db.query.attempts.findFirst({
    columns: { status: true, dueAt: true, assignmentId: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status !== "in_progress") throw new ActionError("Already submitted.", 409);
  const now = new Date();
  const submittedAt = attempt.dueAt && attempt.dueAt < now ? attempt.dueAt : now;
  const score = await finalizeAttempt(attemptId, submittedAt);
  const asg = await db.query.assignments.findFirst({
    columns: { resultsReleased: true },
    where: eq(schema.assignments.id, attempt.assignmentId),
  });
  revalidate(attempt.assignmentId);
  return {
    assignmentId: attempt.assignmentId,
    percent: asg?.resultsReleased ? score.percent : null,
    totalEarned: asg?.resultsReleased ? score.totalEarned : null,
    totalPossible: score.totalPossible,
    pendingManual: score.pendingManual,
  };
});
