"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  requireContentAccess,
  requirePracticeAttemptAccess,
  withAuthz,
} from "@/lib/authz";
import { answerPracticeQuestion, completeActivity, startPracticeAttempt } from "@/lib/practice";

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

const evidenceSchema = z.object({
  watchPercent: z.number().min(0).max(100).optional(),
  scrolledToEnd: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  answers: z.record(z.string().max(40), z.string().max(5_000)).optional(),
});

function revalidate() {
  revalidatePath("/student");
  revalidatePath("/app/practice");
}

/** Start a new attempt on a published practice set, or resume the open one. Always allowed: practice never closes. */
export const startPractice = withAuthz(async (practiceSetId: string) => {
  const access = await requireContentAccess({ type: "practice_set", id: practiceSetId });
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  try {
    const r = await startPracticeAttempt(practiceSetId, access.userId);
    revalidate();
    return r;
  } catch (err) {
    if (err instanceof Error && err.message === "empty")
      throw new ActionError("This practice set has no questions yet. Tell your teacher.", 409);
    throw err;
  }
});

/** Answer one question and get instant feedback. One answer per question per attempt. */
export const answerPractice = withAuthz(
  async (attemptId: string, questionId: string, rawAnswer: unknown) => {
    const access = await requirePracticeAttemptAccess(attemptId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    if (access.attempt.completedAt) throw new ActionError("This attempt is finished.", 409);
    const parsed = answerSchema.safeParse(rawAnswer);
    if (!parsed.success) throw new ActionError("Couldn't read that answer.", 400);
    try {
      const r = await answerPracticeQuestion(attemptId, questionId, parsed.data);
      if (r.completed) revalidate();
      return r;
    } catch (err) {
      if (err instanceof Error && err.message === "not on attempt")
        throw new ActionError("That question isn't on this attempt.", 400);
      throw err;
    }
  }
);

/** Mark an activity complete once its rule is met (checked server-side); gates recompute. */
export const finishActivity = withAuthz(async (activityId: string, rawEvidence: unknown) => {
  const access = await requireContentAccess({ type: "relearning_activity", id: activityId });
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const parsed = evidenceSchema.safeParse(rawEvidence ?? {});
  if (!parsed.success) throw new ActionError("Couldn't read that.", 400);
  const r = await completeActivity(activityId, access.userId, parsed.data);
  if (!r.ok) throw new ActionError(r.reason, 400);
  revalidate();
  return {
    completed: true,
    awaitingTeacher: !!r.requiresTeacherVerification && !r.teacherVerified,
  };
});
