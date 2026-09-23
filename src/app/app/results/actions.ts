"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { finalizeAttempt } from "@/lib/attempts";
import { ActionError, type AttemptAccess, requireAttemptAccess, withAuthz } from "@/lib/authz";

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
