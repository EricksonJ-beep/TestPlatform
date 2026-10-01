"use server";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity-log";
import { canStartAttempt, startReasonText } from "@/lib/assignments";
import { createAttempt, finalizeAttempt } from "@/lib/attempts";
import { correctionsClear } from "@/lib/corrections";
import { setOptIn } from "@/lib/gates";
import { getCorrectionsSummary, latestFinishedAttemptId } from "@/lib/queries/corrections";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { BLOCKER_TEXT } from "@/lib/retakes";
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
      retakesNeedUnlock: true,
    },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!assignment) throw new ActionError("Not found.", 404);
  const [unlock] = await db
    .select({ through: sql<number>`coalesce(max(${schema.attemptUnlocks.attemptNumber}), 0)::int` })
    .from(schema.attemptUnlocks)
    .where(
      and(
        eq(schema.attemptUnlocks.assignmentId, assignmentId),
        eq(schema.attemptUnlocks.studentId, access.userId),
        isNotNull(schema.attemptUnlocks.grantedAt)
      )
    );
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
    unlockedThrough: unlock?.through ?? 0,
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
  // Exception (Jon, Oct 1 2026): when retakes need the teacher's unlock, that unlock is the only gate.
  const lastAttemptId = assignment.retakesNeedUnlock
    ? null
    : await latestFinishedAttemptId(assignmentId, access.userId);
  const corrections = lastAttemptId ? await getCorrectionsSummary(lastAttemptId) : null;
  if (corrections && !correctionsClear(corrections)) {
    throw new ActionError(
      corrections.state === "submitted"
        ? "Your corrections are waiting for your teacher's approval."
        : `Finish your corrections on attempt ${corrections.attemptNumber} first.`,
      403
    );
  }
  // Rule (PLAN.md §2, §4): a summative retake covers only the required and opted-in targets, and only once every gate is open.
  let scope: string[] | null = null;
  if (used > 0) {
    const retake = await getRetakeStatus(assignmentId, access.userId);
    if (retake) {
      if (!retake.plan.canStart) throw new ActionError(BLOCKER_TEXT[retake.plan.blocker!], 403);
      scope = retake.plan.selected;
    }
  }
  let created;
  try {
    created = await createAttempt({ assignmentId, studentId: access.userId, scope, now });
  } catch (err) {
    if (err instanceof Error && err.message === "empty")
      throw new ActionError("This test has no questions yet. Tell your teacher.", 409);
    throw err;
  }
  await logActivity({
    userId: access.userId,
    kind: "attempt_started",
    assignmentId,
    detail: { attemptNumber: created.number },
  });
  revalidate(assignmentId);
  return { attemptId: created.attemptId, resumed: false };
});

/**
 * Ask the teacher to unlock the next attempt (Jon, Oct 1 2026). Rules: the
 * assignment has "Retakes need my OK" on; a finished attempt exists and none is
 * open; attempts remain. The row is a request until the teacher grants it.
 */
export const requestRetake = withAuthz(async (assignmentId: string) => {
  const access = await requireAssignmentAccess(assignmentId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const assignment = await db.query.assignments.findFirst({
    columns: { attemptsAllowed: true, retakesNeedUnlock: true, closesAt: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!assignment) throw new ActionError("Not found.", 404);
  if (!assignment.retakesNeedUnlock)
    throw new ActionError("This assignment doesn't need a request.", 409);
  if (assignment.closesAt && assignment.closesAt <= new Date())
    throw new ActionError("This assignment has closed.", 403);
  const [counts] = await db
    .select({
      used: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${schema.attempts.status} = 'in_progress')::int`,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId)
      )
    );
  const used = counts?.used ?? 0;
  if (used === 0) throw new ActionError("Take the quiz once first.", 409);
  if ((counts?.open ?? 0) > 0) throw new ActionError("Finish the attempt you're on first.", 409);
  const next = used + 1;
  if (assignment.attemptsAllowed !== null && next > assignment.attemptsAllowed)
    throw new ActionError("You've used every attempt.", 409);
  // Idempotent: a second request, or a request after the teacher already unlocked, changes nothing.
  await db
    .insert(schema.attemptUnlocks)
    .values({
      assignmentId,
      studentId: access.userId,
      attemptNumber: next,
      requestedAt: new Date(),
    })
    .onConflictDoNothing();
  await logActivity({
    userId: access.userId,
    kind: "retake_requested",
    assignmentId,
    detail: { attemptNumber: next },
  });
  revalidate(assignmentId);
  revalidatePath("/app");
  return { attemptNumber: next };
});

/** Opt in to (or out of) retaking a target that is already proficient (PLAN.md §4). */
export const setRetakeOptIn = withAuthz(
  async (assignmentId: string, learningTargetId: string, optedIn: boolean) => {
    const access = await requireAssignmentAccess(assignmentId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    const status = await getRetakeStatus(assignmentId, access.userId);
    if (!status) throw new ActionError("There's no retake to choose on this assignment.", 409);
    if (!status.optionalRetakes)
      throw new ActionError("Optional retakes are turned off for this test.", 403);
    const target = status.targets.find((t) => t.id === learningTargetId);
    if (!target) throw new ActionError("That target isn't on this test.", 400);
    if (target.required) throw new ActionError("That target is already required.", 409);
    const open = await db.query.attempts.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId),
        eq(schema.attempts.status, "in_progress")
      ),
    });
    if (open) throw new ActionError("Finish the attempt you're on first.", 409);
    await setOptIn(assignmentId, access.userId, learningTargetId, !!optedIn);
    revalidate(assignmentId);
    return { optedIn: !!optedIn };
  }
);

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
    columns: { status: true, dueAt: true, assignmentId: true, number: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status !== "in_progress") throw new ActionError("Already submitted.", 409);
  const now = new Date();
  const submittedAt = attempt.dueAt && attempt.dueAt < now ? attempt.dueAt : now;
  const score = await finalizeAttempt(attemptId, submittedAt);
  await logActivity({
    userId: access.userId,
    kind: "attempt_submitted",
    assignmentId: attempt.assignmentId,
    detail: {
      attemptNumber: attempt.number,
      percent: score.pendingManual > 0 ? null : score.percent,
    },
  });
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
