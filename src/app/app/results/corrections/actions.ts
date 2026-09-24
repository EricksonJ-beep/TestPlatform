"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, type AttemptAccess, requireAttemptAccess, withAuthz } from "@/lib/authz";

function revalidate(assignmentId: string, attemptId: string) {
  revalidatePath("/app");
  revalidatePath("/app/results");
  revalidatePath("/app/results/corrections");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/app/results/attempts/${attemptId}`);
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/student/corrections/${attemptId}`);
}

const noteSchema = z.string().trim().max(2_000);

// Rule: only the teacher who owns the assignment reviews a set, and only rows that are submitted change.
async function reviewSet(
  access: AttemptAccess,
  status: "approved" | "returned",
  note: string | null
) {
  if (access.as !== "teacher") throw new ActionError("Teachers only.", 403);
  const attemptId = access.attempt.id;
  const updated = await db
    .update(schema.corrections)
    .set({
      status,
      reviewerId: access.userId,
      reviewerNote: note,
      reviewedAt: new Date(),
    })
    .where(
      and(eq(schema.corrections.attemptId, attemptId), eq(schema.corrections.status, "submitted"))
    )
    .returning({ id: schema.corrections.id });
  if (updated.length === 0) throw new ActionError("Nothing here is waiting for review.", 409);
  revalidate(access.attempt.assignmentId, attemptId);
  return { count: updated.length };
}

/** Approve every submitted correction on the attempt (A in the queue). The retake gate opens. */
export const approveCorrections = withAuthz(async (attemptId: string, note?: string) => {
  const access = await requireAttemptAccess(attemptId);
  const parsed = noteSchema.safeParse(note ?? "");
  return reviewSet(access, "approved", parsed.success && parsed.data ? parsed.data : null);
});

/** Send the set back with a note the student reads on the form (R in the queue). */
export const returnCorrections = withAuthz(async (attemptId: string, note: string) => {
  const access = await requireAttemptAccess(attemptId);
  const parsed = noteSchema.min(1, "Tell the student what to fix.").safeParse(note);
  if (!parsed.success)
    throw new ActionError("Add a note so the student knows what to fix.", 400, {
      note: ["Tell the student what to fix."],
    });
  return reviewSet(access, "returned", parsed.data);
});
