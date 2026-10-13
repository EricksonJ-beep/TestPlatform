"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  ActionError,
  requireContentAccess,
  requirePracticeAttemptAccess,
  requireSession,
  studentCourseIds,
  withAuthz,
} from "@/lib/authz";
import { logActivity } from "@/lib/activity-log";
import { customPracticeTitle, startCustomPractice } from "@/lib/custom-practice";
import {
  answerPracticeQuestion,
  completeActivity,
  revealPracticeAnswer,
  startPracticeAttempt,
} from "@/lib/practice";

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
  interactive: z
    .object({
      activity: z.string().max(200).optional(),
      total: z.number(),
      firstTry: z.number().default(0),
      misses: z.number().default(0),
      seconds: z.number().default(0),
      missedTerms: z.array(z.string().max(200)).max(500).default([]),
    })
    .optional(),
});

function revalidate() {
  revalidatePath("/student");
  revalidatePath("/app/practice");
}

/** Start a new attempt on a published practice set, or resume the open one. Always allowed: practice never closes. */
export const startPractice = withAuthz(async (practiceSetId: string) => {
  const access = await requireContentAccess({ type: "practice_set", id: practiceSetId });
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const set = await db.query.practiceSets.findFirst({
    columns: { worksheetId: true },
    where: eq(schema.practiceSets.id, practiceSetId),
  });
  if (set?.worksheetId)
    throw new ActionError("Open the worksheet itself; it completes when you submit it.", 409);
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

/** Log a finished practice set; the error the student sees when a question isn't theirs. */
async function afterPracticeChange<T extends { completed: boolean }>(
  access: { userId: string; attempt: { id: string; practiceSetId: string | null } },
  run: () => Promise<T>
): Promise<T> {
  try {
    const r = await run();
    if (r.completed) {
      await logActivity({
        userId: access.userId,
        kind: "practice_completed",
        detail: { title: await attemptTitle(access.attempt.id, access.attempt.practiceSetId) },
      });
      revalidate();
    }
    return r;
  } catch (err) {
    if (err instanceof Error && err.message === "not on attempt")
      throw new ActionError("That question isn't on this attempt.", 400);
    throw err;
  }
}

/**
 * Check one answer and get feedback. A miss leaves the question open to try
 * again (hint after three); a closed question returns its feedback unchanged.
 */
export const answerPractice = withAuthz(
  async (attemptId: string, questionId: string, rawAnswer: unknown) => {
    const access = await requirePracticeAttemptAccess(attemptId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    if (access.attempt.completedAt) throw new ActionError("This attempt is finished.", 409);
    const parsed = answerSchema.safeParse(rawAnswer);
    if (!parsed.success) throw new ActionError("Couldn't read that answer.", 400);
    return afterPracticeChange(access, () =>
      answerPracticeQuestion(attemptId, questionId, parsed.data)
    );
  }
);

/** Show the answer and explanation; the question closes as not correct. */
export const revealPractice = withAuthz(async (attemptId: string, questionId: string) => {
  const access = await requirePracticeAttemptAccess(attemptId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  if (access.attempt.completedAt) throw new ActionError("This attempt is finished.", 409);
  return afterPracticeChange(access, () => revealPracticeAnswer(attemptId, questionId));
});

async function attemptTitle(attemptId: string, practiceSetId: string | null) {
  if (practiceSetId) {
    const set = await db.query.practiceSets.findFirst({
      columns: { title: true },
      where: eq(schema.practiceSets.id, practiceSetId),
    });
    return set?.title;
  }
  const a = await db.query.practiceAttempts.findFirst({
    columns: { courseId: true, targetIds: true },
    where: eq(schema.practiceAttempts.id, attemptId),
  });
  return a?.courseId ? customPracticeTitle(a.courseId, a.targetIds ?? []) : undefined;
}

const customSchema = z.object({
  courseId: z.string().uuid(),
  targetIds: z.array(z.string().uuid()).min(1).max(200),
  count: z.number().int().min(1).max(100),
});

/**
 * "Build my practice" (Jon, Oct 13 2026): deal a fresh practice on the
 * targets the student picked. Rule: students only, on a course their classes
 * use; the targets must belong to that course (checked when dealing).
 */
export const startBuiltPractice = withAuthz(async (raw: unknown) => {
  const session = await requireSession();
  if (session.role !== "student") throw new ActionError("Students only.", 403);
  const parsed = customSchema.safeParse(raw);
  if (!parsed.success) throw new ActionError("Pick at least one learning target.", 400);
  const { courseId, targetIds, count } = parsed.data;
  if (!(await studentCourseIds(session.userId)).includes(courseId))
    throw new ActionError("You're not in a class for that course.", 403);
  try {
    const r = await startCustomPractice(session.userId, courseId, targetIds, count);
    revalidate();
    return r;
  } catch (err) {
    if (err instanceof Error && err.message === "empty")
      throw new ActionError("There are no practice questions for those targets yet.", 409);
    throw err;
  }
});

/** Mark an activity complete once its rule is met (checked server-side); gates recompute. */
export const finishActivity = withAuthz(async (activityId: string, rawEvidence: unknown) => {
  const access = await requireContentAccess({ type: "relearning_activity", id: activityId });
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const parsed = evidenceSchema.safeParse(rawEvidence ?? {});
  if (!parsed.success) throw new ActionError("Couldn't read that.", 400);
  const r = await completeActivity(activityId, access.userId, parsed.data);
  if (!r.ok) throw new ActionError(r.reason, 400);
  const activity = await db.query.relearningActivities.findFirst({
    columns: { title: true },
    where: eq(schema.relearningActivities.id, activityId),
  });
  await logActivity({
    userId: access.userId,
    kind: "activity_completed",
    detail: { title: activity?.title },
  });
  revalidate();
  return {
    completed: true,
    awaitingTeacher: !!r.requiresTeacherVerification && !r.teacherVerified,
  };
});
