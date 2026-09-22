"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireShared, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse } from "@/lib/current-course";
import { missingHeaders, parseQuestionRecords, type RawRecord } from "@/lib/import/question-csv";
import { commitImport, planImport } from "@/lib/import/question-import";

const bankSchema = z.object({
  name: z.string().trim().min(1, "Give the bank a name.").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  courseId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues)
    (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

function revalidateBank(bankId: string) {
  revalidatePath("/app/banks");
  revalidatePath("/app/shared");
  revalidatePath(`/app/banks/${bankId}`);
  revalidatePath("/app");
}

/** Create a bank you own, attached to one of your courses. */
export const createBank = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = bankSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
  const { name, description, courseId } = parsed.data;
  if (courseId && !(await ownsCourse(session.userId, courseId))) {
    throw new ActionError("That course isn't yours.", 403);
  }
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: session.userId, courseId, name, description })
    .returning({ id: schema.questionBanks.id });
  revalidateBank(bank.id);
  return { bankId: bank.id };
});

/** Rename / re-describe / re-course a bank. Owner or co_edit share. Only the owner can change the course. */
export const updateBank = withAuthz(async (bankId: string, formData: FormData) => {
  const access = await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  const parsed = bankSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
  const { name, description, courseId } = parsed.data;
  const patch: Partial<typeof schema.questionBanks.$inferInsert> = { name, description };
  if (formData.has("courseId")) {
    if (access.access !== "owner")
      throw new ActionError("Only the owner can move a bank to another course.", 403);
    if (courseId && !(await ownsCourse(access.userId, courseId)))
      throw new ActionError("That course isn't yours.", 403);
    patch.courseId = courseId;
  }
  await db.update(schema.questionBanks).set(patch).where(eq(schema.questionBanks.id, bankId));
  revalidateBank(bankId);
  return { ok: true };
});

/** Archive hides a bank from lists without deleting its questions. Owner or co_edit. */
export const setBankArchived = withAuthz(async (bankId: string, archived: boolean) => {
  await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  await db
    .update(schema.questionBanks)
    .set({ isArchived: archived })
    .where(eq(schema.questionBanks.id, bankId));
  revalidateBank(bankId);
  return { ok: true };
});

const MAX_ROWS = 1000;

function parseRecords(headers: string[], records: RawRecord[]) {
  const missing = missingHeaders(headers);
  if (missing.length) {
    throw new ActionError(`The CSV is missing required column(s): ${missing.join(", ")}.`, 400);
  }
  if (records.length === 0) throw new ActionError("The CSV has a header but no rows.", 400);
  if (records.length > MAX_ROWS)
    throw new ActionError(`Import at most ${MAX_ROWS} rows at a time.`, 400);
  return parseQuestionRecords(records);
}

/** Dry run of an Appendix A import: per-row status, actions, and what would be created. Nothing is written. */
export const previewQuestionImport = withAuthz(
  async (bankId: string, headers: string[], records: RawRecord[]) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    const rows = parseRecords(headers, records);
    const plan = await planImport(bankId, rows);
    return plan;
  }
);

/** Write an Appendix A import. Rows with errors and rows in `skipLines` are skipped; the rest are inserted or updated. */
export const commitQuestionImport = withAuthz(
  async (bankId: string, headers: string[], records: RawRecord[], skipLines: number[]) => {
    await requireShared({ type: "question_bank", id: bankId }, "co_edit");
    const rows = parseRecords(headers, records);
    const result = await commitImport(bankId, rows, { skipLines });
    revalidateBank(bankId);
    revalidatePath("/app/courses");
    return result;
  }
);
