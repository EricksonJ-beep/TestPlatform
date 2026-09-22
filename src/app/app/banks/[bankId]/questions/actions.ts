"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireShared, withAuthz } from "@/lib/authz";
import { getQuestionForEdit } from "@/lib/queries/banks";
import {
  assertStimulusInCourse,
  createQuestionRow,
  duplicateQuestionRow,
  fieldErrorsOf,
  loadBankCtx,
  questionHistory,
  questionPayloadSchema,
  saveNewVersion,
} from "@/lib/questions";

function revalidate(bankId: string) {
  revalidatePath(`/app/banks/${bankId}`);
  revalidatePath("/app/banks");
  revalidatePath("/app");
}

// Rule: every question id handed to a bulk action must live in the bank the caller was authorized for.
async function assertAllInBank(bankId: string, questionIds: string[]) {
  const ids = Array.from(new Set(questionIds));
  if (ids.length === 0) throw new ActionError("Select at least one question.", 400);
  if (ids.length > 200) throw new ActionError("Select at most 200 questions at a time.", 400);
  const rows = await db
    .select({ id: schema.questions.id })
    .from(schema.questions)
    .where(and(eq(schema.questions.bankId, bankId), inArray(schema.questions.id, ids)));
  if (rows.length !== ids.length)
    throw new ActionError("Some of those questions aren't in this bank.", 404);
  return ids;
}

/** Create a question in a bank (owner or co_edit). */
export const createQuestion = withAuthz(async (bankId: string, payload: unknown) => {
  await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  const parsed = questionPayloadSchema.safeParse(payload);
  if (!parsed.success)
    throw new ActionError("Check the question.", 400, fieldErrorsOf(parsed.error));
  const bank = await loadBankCtx(bankId);
  const questionId = await createQuestionRow(bank, parsed.data);
  revalidate(bankId);
  return { questionId };
});

/** Save an edit as a new version. Returns the new row's id. */
export const updateQuestion = withAuthz(
  async (bankId: string, questionId: string, payload: unknown) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    const parsed = questionPayloadSchema.safeParse(payload);
    if (!parsed.success)
      throw new ActionError("Check the question.", 400, fieldErrorsOf(parsed.error));
    const bank = await loadBankCtx(bankId);
    await assertAllInBank(bankId, [questionId]);
    const newId = await saveNewVersion(bank, questionId, parsed.data);
    revalidate(bankId);
    return { questionId: newId };
  }
);

/** Read-only version list for the editor page. */
export const getHistory = withAuthz(async (bankId: string, questionId: string) => {
  await requireShared({ type: "question_bank", id: bankId }, "view");
  await assertAllInBank(bankId, [questionId]);
  return { versions: await questionHistory(questionId) };
});

const tagList = z.array(z.string().trim().min(1).max(40)).min(1).max(20);

/** Add tags to many questions (existing tags kept, deduped). */
export const bulkTag = withAuthz(async (bankId: string, questionIds: string[], tags: string[]) => {
  await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  const ids = await assertAllInBank(bankId, questionIds);
  const parsed = tagList.safeParse(tags);
  if (!parsed.success) throw new ActionError("Enter at least one tag.", 400);
  for (const id of ids) {
    const q = await db.query.questions.findFirst({
      columns: { tags: true },
      where: eq(schema.questions.id, id),
    });
    const merged = Array.from(new Set([...(q?.tags ?? []), ...parsed.data]));
    await db.update(schema.questions).set({ tags: merged }).where(eq(schema.questions.id, id));
  }
  revalidate(bankId);
  return { updated: ids.length };
});

/** Move questions to another bank on the same course that the caller can edit. Pool memberships and targets stay valid because the course is unchanged. */
export const bulkMove = withAuthz(
  async (bankId: string, questionIds: string[], toBankId: string) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    await requireShared({ type: "question_bank", id: toBankId }, "co_edit");
    if (toBankId === bankId) throw new ActionError("Pick a different bank.", 400);
    const ids = await assertAllInBank(bankId, questionIds);
    const [from, to] = await Promise.all([loadBankCtx(bankId), loadBankCtx(toBankId)]);
    if (!from.courseId || from.courseId !== to.courseId) {
      throw new ActionError(
        "Questions can only move between banks on the same course (their targets belong to it).",
        400
      );
    }
    // external_id is unique per bank; drop it if the destination already has that id.
    for (const id of ids) {
      const q = await db.query.questions.findFirst({
        columns: { externalId: true },
        where: eq(schema.questions.id, id),
      });
      let externalId = q?.externalId ?? null;
      if (externalId) {
        const clash = await db.query.questions.findFirst({
          columns: { id: true },
          where: and(
            eq(schema.questions.bankId, toBankId),
            sql`lower(${schema.questions.externalId}) = ${externalId.toLowerCase()}`
          ),
        });
        if (clash) externalId = null;
      }
      await db
        .update(schema.questions)
        .set({ bankId: toBankId, ownerId: to.ownerId, externalId })
        .where(eq(schema.questions.id, id));
    }
    revalidate(bankId);
    revalidate(toBankId);
    return { moved: ids.length };
  }
);

/** Duplicate questions within the same bank (fresh version-1 rows, no external_id). */
export const bulkDuplicate = withAuthz(async (bankId: string, questionIds: string[]) => {
  await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  const ids = await assertAllInBank(bankId, questionIds);
  const bank = await loadBankCtx(bankId);
  const created: string[] = [];
  for (const id of ids) created.push(await duplicateQuestionRow(id, bank));
  revalidate(bankId);
  return { created };
});

/** Archive (or restore) questions. Archived questions leave lists and pools stay untouched. */
export const bulkArchive = withAuthz(
  async (bankId: string, questionIds: string[], archived: boolean) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    const ids = await assertAllInBank(bankId, questionIds);
    await db
      .update(schema.questions)
      .set({ isArchived: archived })
      .where(inArray(schema.questions.id, ids));
    revalidate(bankId);
    return { updated: ids.length };
  }
);

/** Load one question for the slide-in editor (owner or co_edit). */
export const loadQuestionForEdit = withAuthz(async (bankId: string, questionId: string) => {
  await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  await assertAllInBank(bankId, [questionId]);
  return await getQuestionForEdit(questionId);
});

/** Attach one stimulus to many questions (or detach with null). The stimulus must be on the bank's course. */
export const bulkSetStimulus = withAuthz(
  async (bankId: string, questionIds: string[], stimulusId: string | null) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    const ids = await assertAllInBank(bankId, questionIds);
    const bank = await loadBankCtx(bankId);
    await assertStimulusInCourse(bank, stimulusId);
    await db.update(schema.questions).set({ stimulusId }).where(inArray(schema.questions.id, ids));
    revalidate(bankId);
    return { updated: ids.length };
  }
);
