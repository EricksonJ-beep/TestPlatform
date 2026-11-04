"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  requireAssignmentAccess,
  requireCheckRoundAccess,
  requirePracticeCheckAccess,
  withAuthz,
} from "@/lib/authz";
import {
  answerCheckQuestion,
  CheckError,
  nextRound,
  openPracticeCheck,
} from "@/lib/practice-check-server";

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

/** Run a check step and turn its refusals into what the student sees. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof CheckError) throw new ActionError(err.message, err.status);
    throw err;
  }
}

function revalidate(assignmentId: string) {
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/app/results/${assignmentId}`);
}

/**
 * Open the practice check the relearning path asks for (P5): the one after a relearning bundle
 * (`kind` path; its bundle, or the first one ready), or the fresh one before the next attempt
 * (`kind` attempt, Q6). Students only, on an assignment of their class.
 */
export const startPracticeCheck = withAuthz(
  async (assignmentId: string, kind: "path" | "attempt", bundleId: string | null) => {
    const access = await requireAssignmentAccess(assignmentId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    const parsed = z
      .object({ kind: z.enum(["path", "attempt"]), bundleId: z.string().uuid().nullable() })
      .safeParse({ kind, bundleId });
    if (!parsed.success) throw new ActionError("That isn't a practice check.", 400);
    const r = await refusing(() =>
      openPracticeCheck({ assignmentId, studentId: access.userId, ...parsed.data })
    );
    revalidate(assignmentId);
    return r;
  }
);

/** A question's first answer (P2): checked on the spot, never changed afterwards. */
export const answerPracticeCheck = withAuthz(
  async (roundId: string, questionId: string, answer: unknown) => {
    const access = await requireCheckRoundAccess(roundId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    const parsed = answerSchema.safeParse(answer);
    if (!parsed.success || !z.string().uuid().safeParse(questionId).success)
      throw new ActionError("That answer couldn't be read.", 400);
    const r = await refusing(() => answerCheckQuestion(roundId, questionId, parsed.data));
    if (r.round.finished) revalidate(access.check.assignmentId);
    return r;
  }
);

/** "Try a new 5" (P3), after a round that didn't reach the pass mark. */
export const nextPracticeCheckRound = withAuthz(async (checkId: string) => {
  const access = await requirePracticeCheckAccess(checkId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  return refusing(() => nextRound(checkId));
});
