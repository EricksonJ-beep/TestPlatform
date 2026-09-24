"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  ActionError,
  type AttemptAccess,
  assertOwnStudentRow,
  requireAttemptAccess,
  withAuthz,
} from "@/lib/authz";
import { correctionIssues, ISSUE_TEXT, type CorrectionIssue } from "@/lib/corrections";
import { getCorrectionScope, getCorrectionsSummary } from "@/lib/queries/corrections";

const draftSchema = z.object({
  correctAnswer: z.string().max(2_000),
  explanation: z.string().max(10_000),
});

function revalidate(assignmentId: string, attemptId: string) {
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/student/corrections/${attemptId}`);
  revalidatePath("/app");
  revalidatePath("/app/results");
  revalidatePath("/app/results/corrections");
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath(`/app/results/attempts/${attemptId}`);
}

// Rule: only the attempt's own student writes corrections, only on a finished attempt, only while the set is editable (draft or returned).
async function editableScope(access: AttemptAccess) {
  assertOwnStudentRow(access, access.attempt);
  const scope = await getCorrectionScope(access.attempt.id);
  if (!scope) throw new ActionError("Not found.", 404);
  if (scope.attempt.status === "in_progress")
    throw new ActionError("Submit the attempt before doing corrections.", 409);
  return scope;
}

/** What the explanation must not copy: the question's explanation and every option's feedback. */
async function copySources(questionId: string) {
  const q = await db.query.questions.findFirst({
    columns: { explanation: true },
    where: eq(schema.questions.id, questionId),
  });
  const opts = await db
    .select({ feedback: schema.questionOptions.feedback })
    .from(schema.questionOptions)
    .where(eq(schema.questionOptions.questionId, questionId));
  return { explanation: q?.explanation ?? null, optionFeedback: opts.map((o) => o.feedback) };
}

/**
 * Autosave one correction. Drafts are stored as typed; the issues come back so
 * the form can show them live, but nothing blocks a save except a locked row.
 */
export const saveCorrection = withAuthz(
  async (attemptId: string, questionId: string, raw: unknown) => {
    const scope = await editableScope(await requireAttemptAccess(attemptId));
    if (!scope.needed.includes(questionId))
      throw new ActionError("That question doesn't need a correction.", 400);
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) throw new ActionError("Couldn't read that.", 400);
    const existing = await db.query.corrections.findFirst({
      columns: { id: true, status: true },
      where: and(
        eq(schema.corrections.attemptId, attemptId),
        eq(schema.corrections.questionId, questionId)
      ),
    });
    if (existing && (existing.status === "submitted" || existing.status === "approved"))
      throw new ActionError(
        existing.status === "approved"
          ? "This correction is already approved."
          : "This set is submitted and waiting for your teacher.",
        409
      );
    const values = {
      correctAnswer: parsed.data.correctAnswer,
      explanation: parsed.data.explanation,
    };
    await db
      .insert(schema.corrections)
      .values({ attemptId, questionId, studentId: scope.attempt.studentId, ...values })
      .onConflictDoUpdate({
        target: [schema.corrections.attemptId, schema.corrections.questionId],
        set: values,
      });
    const issues = correctionIssues(values, await copySources(questionId));
    return { savedAt: new Date().toISOString(), issues };
  }
);

/**
 * Final submit: every needed question must have a complete correction. In auto
 * review mode the set is approved on the spot; otherwise it waits in the
 * teacher's queue. Returned sets are resubmitted the same way.
 */
export const submitCorrections = withAuthz(async (attemptId: string) => {
  const scope = await editableScope(await requireAttemptAccess(attemptId));
  if (scope.needed.length === 0) throw new ActionError("Nothing to correct here.", 409);
  const rows = await db
    .select()
    .from(schema.corrections)
    .where(eq(schema.corrections.attemptId, attemptId));
  const byQ = new Map(rows.map((r) => [r.questionId, r]));
  const problems: Record<string, string[]> = {};
  let firstIssue: CorrectionIssue | null = null;
  let open = 0;
  for (const questionId of scope.needed) {
    const row = byQ.get(questionId);
    if (row && (row.status === "submitted" || row.status === "approved")) continue;
    open++;
    const issues = correctionIssues(
      { correctAnswer: row?.correctAnswer ?? "", explanation: row?.explanation ?? "" },
      await copySources(questionId)
    );
    if (issues.length) {
      problems[questionId] = issues.map((i) => ISSUE_TEXT[i]);
      firstIssue ??= issues[0];
    }
  }
  if (firstIssue) {
    const n = Object.keys(problems).length;
    throw new ActionError(
      n === 1 ? "One correction isn't finished." : `${n} corrections aren't finished.`,
      400,
      problems
    );
  }
  if (open === 0) throw new ActionError("These corrections are already submitted.", 409);
  const now = new Date();
  const approveNow = scope.assignment.reviewMode === "auto";
  await db
    .update(schema.corrections)
    .set({
      status: approveNow ? "approved" : "submitted",
      submittedAt: now,
      reviewedAt: approveNow ? now : null,
      reviewerId: null,
      reviewerNote: null,
    })
    .where(
      and(
        eq(schema.corrections.attemptId, attemptId),
        inArray(schema.corrections.questionId, scope.needed),
        inArray(schema.corrections.status, ["draft", "returned"])
      )
    );
  const summary = (await getCorrectionsSummary(attemptId))!;
  revalidate(scope.attempt.assignmentId, attemptId);
  return { state: summary.state, assignmentId: scope.attempt.assignmentId };
});
