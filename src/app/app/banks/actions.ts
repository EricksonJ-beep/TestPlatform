"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireShared, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse, rememberCourse } from "@/lib/current-course";
import { missingHeaders, parseQuestionRecords, type RawRecord } from "@/lib/import/question-csv";
import { commitImport, planImport } from "@/lib/import/question-import";
import {
  DOCUMENT_TYPES,
  extractQuestions,
  isAiConfigured,
  MAX_DOCUMENT_BYTES,
} from "@/lib/ai/extract-questions";
import { extractedToRecords } from "@/lib/ai/to-records";
import { listTargets } from "@/lib/queries/courses";

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
  if (courseId) await rememberCourse(courseId);
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

// ---------------------------------------------------------------------------
// Word / PDF import (Ticket 1.17)
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string(),
  base64: z.string().min(1),
});

/** Per-teacher cap on model calls: enough for a planning period, not a runaway script. */
const AI_CALLS_PER_HOUR = 20;
const aiCalls = new Map<string, number[]>();
function checkRateLimit(teacherId: string, now = Date.now()) {
  const recent = (aiCalls.get(teacherId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= AI_CALLS_PER_HOUR)
    throw new ActionError(
      `You've used ${AI_CALLS_PER_HOUR} document imports this hour; try again a little later.`,
      429
    );
  recent.push(now);
  aiCalls.set(teacherId, recent);
}

/**
 * Turn a past test (.pdf, .docx, .txt) into Appendix A rows with Claude's
 * help, for the same preview-and-confirm wizard as a CSV. Nothing is written
 * here; the teacher reviews every row. Owner or co_edit on the bank.
 */
export const parseDocumentImport = withAuthz(async (bankId: string, input: unknown) => {
  const access = await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("Couldn't read that upload.", 400);
  const kind = DOCUMENT_TYPES[parsed.data.contentType as keyof typeof DOCUMENT_TYPES];
  if (!kind) throw new ActionError("Upload a .pdf, .docx, or .txt file.", 400);
  if (parsed.data.base64.length > MAX_DOCUMENT_BYTES * 1.4)
    throw new ActionError("That file is over 10 MB.", 400);
  if (!isAiConfigured())
    throw new ActionError(
      "Document import isn't set up on this server yet (ANTHROPIC_API_KEY).",
      503
    );
  const bank = await db.query.questionBanks.findFirst({
    columns: { courseId: true },
    where: eq(schema.questionBanks.id, bankId),
  });
  const course = bank?.courseId
    ? await db.query.courses.findFirst({
        columns: { name: true },
        where: eq(schema.courses.id, bank.courseId),
      })
    : null;
  if (!bank?.courseId || !course)
    throw new ActionError("Give this bank a course before importing.", 400);
  checkRateLimit(access.userId);
  const bytes = Buffer.from(parsed.data.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES)
    throw new ActionError("That file is empty or over 10 MB.", 400);
  const targets = (await listTargets(bank.courseId)).map((t) => ({ code: t.code, title: t.title }));
  let result;
  try {
    result = await extractQuestions({
      fileName: parsed.data.fileName,
      kind,
      bytes,
      courseName: course.name,
      targets,
      teacherId: access.userId,
    });
  } catch (err) {
    throw new ActionError(
      err instanceof Error ? err.message : "The document couldn't be read.",
      502
    );
  }
  const { headers, records } = extractedToRecords(result.questions, {
    courseName: course.name,
    targets,
    fileName: parsed.data.fileName,
  });
  return { headers, records, notes: result.notes, usage: result.usage };
});

/**
 * Delete a bank for good. Owner only. Rule: refused while any of its questions
 * sits on an assessment, a practice set, or a student's served attempt; those
 * banks are archived instead, so grading and retakes keep their questions.
 */
export const deleteBank = withAuthz(async (bankId: string) => {
  const access = await requireShared({ type: "question_bank", id: bankId }, "co_edit");
  if (access.access !== "owner") throw new ActionError("Only the owner can delete a bank.", 403);
  const [used] = await db
    .select({
      onAssessments: sql<number>`(select count(*)::int from ${schema.assessmentQuestions} aq inner join ${schema.questions} q on q.id = aq.question_id where q.bank_id = ${bankId})`,
      onPractice: sql<number>`(select count(*)::int from ${schema.practiceSetQuestions} pq inner join ${schema.questions} q on q.id = pq.question_id where q.bank_id = ${bankId})`,
      served: sql<number>`(select count(*)::int from ${schema.attempts} a, jsonb_array_elements(a.question_set) e where (e->>'questionId')::uuid in (select id from ${schema.questions} q where q.bank_id = ${bankId}))`,
      practiced: sql<number>`(select count(*)::int from ${schema.practiceAttempts} a, jsonb_array_elements(a.question_set) e where (e->>'questionId')::uuid in (select id from ${schema.questions} q where q.bank_id = ${bankId}))`,
    })
    .from(schema.questionBanks)
    .where(eq(schema.questionBanks.id, bankId));
  if (used.onAssessments || used.onPractice || used.served || used.practiced)
    throw new ActionError(
      "Questions in this bank are on a test, a practice set, or a student's attempt. Archive it instead.",
      409
    );
  await db
    .delete(schema.shares)
    .where(
      and(eq(schema.shares.resourceType, "question_bank"), eq(schema.shares.resourceId, bankId))
    );
  await db.delete(schema.questionBanks).where(eq(schema.questionBanks.id, bankId));
  revalidateBank(bankId);
  return { ok: true };
});
