"use server";

import { and, eq, gt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { finalizeAttempt } from "@/lib/attempts";
import {
  ActionError,
  type AttemptAccess,
  requireAttemptAccess,
  requireOwner,
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

/** Let one student start their next attempt (used + 1). Idempotent. */
export const unlockNextAttempt = withAuthz(async (assignmentId: string, studentId: string) => {
  const session = await requireOwner({ type: "assignment", id: assignmentId });
  const { asg, used, open } = await enrolledStudent(assignmentId, studentId);
  if (used === 0) throw new ActionError("The first attempt never needs an unlock.", 409);
  if (open > 0) throw new ActionError("They're in the middle of an attempt.", 409);
  const next = used + 1;
  if (asg.attemptsAllowed !== null && next > asg.attemptsAllowed)
    throw new ActionError("They've used every attempt.", 409);
  await db
    .insert(schema.attemptUnlocks)
    .values({ assignmentId, studentId, attemptNumber: next, grantedBy: session.userId })
    .onConflictDoNothing();
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
  return { attemptNumber: next };
});

/** Take back an unlock the student hasn't used yet. */
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
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath("/student");
  return { ok: true };
});
