"use server";

import { and, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { deleteAttempt as removeAttempt, finalizeAttempt } from "@/lib/attempts";
import { staleRequest } from "@/lib/needs-you";
import {
  currentResumeCode,
  issueResumeCode,
  resumeAttempt,
  settleAttempt,
} from "@/lib/attempt-pause";
import {
  ActionError,
  type AttemptAccess,
  isUuid,
  requireAttemptAccess,
  requireOwner,
  requireTeacher,
  withAuthz,
} from "@/lib/authz";

function revalidate(assignmentId: string, attemptId: string) {
  revalidatePath("/app");
  revalidatePath("/app/results");
  revalidatePath("/app/results/grading");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/app/results/attempts/${attemptId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
}

const gradeSchema = z.object({
  points: z
    .string()
    .trim()
    .transform(Number)
    .refine((n) => Number.isFinite(n) && n >= 0, "Points must be 0 or more."),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
});

// Rule: only the teacher who owns the assignment may grade or override, and only on a finished attempt.
async function gradableResponse(access: AttemptAccess, questionId: string) {
  const attemptId = access.attempt.id;
  if (access.as !== "teacher") throw new ActionError("Teachers only.", 403);
  const attempt = await db.query.attempts.findFirst({
    columns: { status: true, questionSet: true, assignmentId: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status === "in_progress")
    throw new ActionError("The student hasn't submitted this attempt yet.", 409);
  const item = attempt.questionSet.find((q) => q.questionId === questionId);
  if (!item) throw new ActionError("That question isn't on this attempt.", 404);
  return { access, attempt, item };
}

/**
 * Enter a manual grade (short answer, extended response) or override any
 * auto score. The points become the response's score; the note explains why.
 * Attempt totals, target scores, and the final score recompute right away.
 */
export const setManualScore = withAuthz(
  async (attemptId: string, questionId: string, formData: FormData) => {
    const { access, attempt, item } = await gradableResponse(
      await requireAttemptAccess(attemptId),
      questionId
    );
    const parsed = gradeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
      throw new ActionError("Check the grade.", 400, {
        points: parsed.error.issues.map((i) => i.message),
      });
    if (parsed.data.points > item.points)
      throw new ActionError(`This question is worth ${item.points} points.`, 400, {
        points: [`At most ${item.points}.`],
      });
    const values = {
      manualScore: parsed.data.points,
      graderNote: parsed.data.note,
      gradedBy: access.userId,
      gradedAt: new Date(),
    };
    await db
      .insert(schema.responses)
      .values({ attemptId, questionId, answer: null, ...values })
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: values,
      });
    const score = await finalizeAttempt(attemptId);
    revalidate(attempt.assignmentId, attemptId);
    return {
      totalEarned: score.totalEarned,
      totalPossible: score.totalPossible,
      pendingManual: score.pendingManual,
    };
  }
);

/** Remove an override so the auto score counts again (a manual-only question goes back to the queue). */
export const clearManualScore = withAuthz(async (attemptId: string, questionId: string) => {
  const { attempt } = await gradableResponse(await requireAttemptAccess(attemptId), questionId);
  await db
    .update(schema.responses)
    .set({ manualScore: null, graderNote: null, gradedBy: null, gradedAt: null })
    .where(
      and(eq(schema.responses.attemptId, attemptId), eq(schema.responses.questionId, questionId))
    );
  const score = await finalizeAttempt(attemptId);
  revalidate(attempt.assignmentId, attemptId);
  return {
    totalEarned: score.totalEarned,
    totalPossible: score.totalPossible,
    pendingManual: score.pendingManual,
  };
});

/**
 * Re-run auto grading on every finished attempt, keeping manual scores and
 * overrides, then recompute finals, tiers, and gates. For after a grader or
 * answer-key fix (Sept 29, 2026: units were being counted wrong).
 */
export const regradeAssignment = withAuthz(async (assignmentId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const attempts = await db
    .select({ id: schema.attempts.id, submittedAt: schema.attempts.submittedAt })
    .from(schema.attempts)
    .where(
      and(eq(schema.attempts.assignmentId, assignmentId), ne(schema.attempts.status, "in_progress"))
    );
  for (const a of attempts) await finalizeAttempt(a.id, a.submittedAt ?? new Date());
  revalidate(assignmentId, "");
  return { regraded: attempts.length };
});

// ---------------------------------------------------------------------------
// Teacher unlocks (Jon, Oct 1 2026): with `retakes_need_unlock` on, each attempt
// after the first waits for one of these.
// ---------------------------------------------------------------------------

// Rule: only for a student enrolled in the assignment's class (the caller has passed requireOwner).
async function enrolledStudent(assignmentId: string, studentId: string) {
  const asg = await db.query.assignments.findFirst({
    columns: { classId: true, attemptsAllowed: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!asg) throw new ActionError("Not found.", 404);
  const enrolled = await db.query.enrollments.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.enrollments.classId, asg.classId),
      eq(schema.enrollments.studentId, studentId)
    ),
  });
  if (!enrolled) throw new ActionError("That student isn't in this class.", 404);
  const [counts] = await db
    .select({
      used: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${schema.attempts.status} = 'in_progress')::int`,
    })
    .from(schema.attempts)
    .where(
      and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.studentId, studentId))
    );
  return { asg, used: counts?.used ?? 0, open: counts?.open ?? 0 };
}

/** Let one student start their next attempt (used + 1); also approves a pending request. Idempotent. */
export const unlockNextAttempt = withAuthz(async (assignmentId: string, studentId: string) => {
  const session = await requireOwner({ type: "assignment", id: assignmentId });
  const { asg, used, open } = await enrolledStudent(assignmentId, studentId);
  if (used === 0) throw new ActionError("The first attempt never needs an unlock.", 409);
  if (open > 0) throw new ActionError("They're in the middle of an attempt.", 409);
  const next = used + 1;
  if (asg.attemptsAllowed !== null && next > asg.attemptsAllowed)
    throw new ActionError("They've used every attempt.", 409);
  const grantedAt = new Date();
  await db
    .insert(schema.attemptUnlocks)
    .values({ assignmentId, studentId, attemptNumber: next, grantedBy: session.userId, grantedAt })
    .onConflictDoUpdate({
      target: [
        schema.attemptUnlocks.assignmentId,
        schema.attemptUnlocks.studentId,
        schema.attemptUnlocks.attemptNumber,
      ],
      set: { grantedBy: session.userId, grantedAt },
    });
  revalidatePath("/app");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
  return { attemptNumber: next };
});

/** Take back an unlock the student hasn't used yet, or decline a pending request. */
export const revokeAttemptUnlock = withAuthz(async (assignmentId: string, studentId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const { used } = await enrolledStudent(assignmentId, studentId);
  await db
    .delete(schema.attemptUnlocks)
    .where(
      and(
        eq(schema.attemptUnlocks.assignmentId, assignmentId),
        eq(schema.attemptUnlocks.studentId, studentId),
        gt(schema.attemptUnlocks.attemptNumber, used)
      )
    );
  revalidatePath("/app");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
  return { ok: true };
});

/**
 * Undo an Approve from the Dashboard (Jon, Oct 13 2026): the unlock for the student's next try
 * goes back to being their request, so nothing is lost (Decline is the one that can't be undone).
 * An unlock the student never asked for is removed, as Take back does. Only an unused unlock.
 */
export const undoRetakeApproval = withAuthz(async (assignmentId: string, studentId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const { used } = await enrolledStudent(assignmentId, studentId);
  const unused = and(
    eq(schema.attemptUnlocks.assignmentId, assignmentId),
    eq(schema.attemptUnlocks.studentId, studentId),
    gt(schema.attemptUnlocks.attemptNumber, used),
    isNotNull(schema.attemptUnlocks.grantedAt)
  );
  const restored = await db
    .update(schema.attemptUnlocks)
    .set({ grantedAt: null, grantedBy: null })
    .where(and(unused, isNotNull(schema.attemptUnlocks.requestedAt)))
    .returning({ id: schema.attemptUnlocks.id });
  const removed = await db
    .delete(schema.attemptUnlocks)
    .where(and(unused, isNull(schema.attemptUnlocks.requestedAt)))
    .returning({ id: schema.attemptUnlocks.id });
  if (restored.length + removed.length === 0)
    throw new ActionError("There's nothing to undo: they may have started that try already.", 409);
  revalidatePath("/app");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
  return { ok: true };
});

/**
 * Clear a leftover retake request (Jon, Oct 13 2026, dashboard plan): one that is no longer the
 * student's next try, or sits on a test that no longer needs the teacher's OK (`staleRequest`).
 * Nothing else ever deletes those. A current request is refused here: Decline is the way to say
 * no to it, and it asks first.
 */
export const clearRetakeRequest = withAuthz(async (assignmentId: string, requestId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const request = isUuid(requestId)
    ? await db.query.attemptUnlocks.findFirst({
        columns: { id: true, studentId: true, attemptNumber: true, grantedAt: true },
        where: and(
          eq(schema.attemptUnlocks.id, requestId),
          eq(schema.attemptUnlocks.assignmentId, assignmentId)
        ),
      })
    : undefined;
  if (!request || request.grantedAt) throw new ActionError("That request is already gone.", 404);
  const asg = await db.query.assignments.findFirst({
    columns: { attemptsAllowed: true, retakesNeedUnlock: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  const used = await db.$count(
    schema.attempts,
    and(
      eq(schema.attempts.assignmentId, assignmentId),
      eq(schema.attempts.studentId, request.studentId)
    )
  );
  if (asg && !staleRequest({ ...asg, attemptNumber: request.attemptNumber, used }))
    throw new ActionError("That request is still current. Approve or decline it.", 409);
  await db.delete(schema.attemptUnlocks).where(eq(schema.attemptUnlocks.id, request.id));
  revalidatePath("/app");
  revalidatePath(`/app/results/${assignmentId}`);
  return { ok: true };
});

/**
 * Delete one attempt outright: a student started the test again by accident,
 * or a run needs wiping so they can retake cleanly. Responses and corrections
 * go with it; later attempts renumber; the final score and gates recompute.
 * Owner of the assignment only. Not undoable, so the UI confirms first.
 */
export const deleteAttempt = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  if (access.as !== "teacher") throw new ActionError("Teachers only.", 403);
  const { assignmentId, number } = await removeAttempt(attemptId);
  revalidate(assignmentId, attemptId);
  revalidatePath(`/app/results/${assignmentId}/tiers`);
  revalidatePath(`/app/results/${assignmentId}/students/${access.attempt.studentId}`);
  revalidatePath("/app/results/corrections");
  return { assignmentId, number };
});

/**
 * Finish later (Jon, Oct 13 2026): let one student back into their paused
 * test without a code. The clock restarts from the time they had left.
 */
export const letContinue = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  if (access.as !== "teacher") throw new ActionError("Teachers only.", 403);
  // An idle test reads as paused before anyone has touched it; settle it first.
  await settleAttempt(attemptId);
  if (!(await resumeAttempt(attemptId, "teacher")))
    throw new ActionError("That test isn't paused.", 409);
  revalidate(access.attempt.assignmentId, attemptId);
  return { ok: true };
});

/** The resume code to post on the board: the current one, or a new one when `fresh` or none is running. */
export const getResumeCode = withAuthz(async (fresh: boolean) => {
  const session = await requireTeacher();
  const current = fresh ? null : await currentResumeCode(session.userId);
  const code = current ?? (await issueResumeCode(session.userId));
  return { code: code.code, expiresAt: code.expiresAt.toISOString() };
});
