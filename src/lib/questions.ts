/**
 * Question writes shared by the editor actions and bulk tools: validation,
 * create, save-as-new-version, duplicate. Callers must already have passed the
 * bank access check (owner or co_edit share).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { GradingConfig } from "@/db/types";
import { ActionError } from "@/lib/authz";
import { BLOOM_LEVELS, IMPORTABLE_TYPES } from "@/lib/question-types";

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  content: z.string().trim().min(1, "Option text is required."),
  isCorrect: z.boolean().default(false),
  feedback: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
  matchText: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null),
  correctPosition: z
    .number()
    .int()
    .min(1)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
});

const numericSchema = z.object({
  mode: z.enum(["exact", "tolerance", "percent_tolerance", "range"]),
  answer: z.number().optional().nullable(),
  tolerance: z.number().min(0).optional().nullable(),
  percent: z.number().min(0).optional().nullable(),
  min: z.number().optional().nullable(),
  max: z.number().optional().nullable(),
  unit: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

/** Absolute http(s) URL or a media path the app serves itself. */
const mediaUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\//i.test(v) || v.startsWith("/api/media/"), {
    message: "Use a full https:// link or upload the file.",
  });

export const questionPayloadSchema = z.object({
  type: z.enum(IMPORTABLE_TYPES),
  stem: z.string().trim().min(1, "Write the question stem.").max(5000),
  explanation: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  points: z.number().int().min(0).max(100).default(1),
  difficulty: z.number().int().min(1).max(5).default(3),
  bloom: z
    .enum(BLOOM_LEVELS)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  grading: z.enum(["auto", "manual"]).default("auto"),
  topic: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => v || null),
  unitId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => v || null),
  targetIds: z.array(z.string().uuid()).max(10).default([]),
  standardCodes: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  mediaUrl,
  videoUrl: mediaUrl,
  stimulusId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  options: z.array(optionSchema).max(10).default([]),
  acceptedAnswers: z.array(z.string().trim().min(1)).max(50).default([]),
  keywords: z.array(z.string().trim().min(1)).max(50).default([]),
  partialCredit: z.boolean().default(false),
  numeric: numericSchema.optional().nullable(),
});
export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues)
    (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

/** Type-specific rules that zod's shape alone can't express. Throws ActionError with field errors. */
export function validatePayload(p: QuestionPayload): {
  options: QuestionPayload["options"];
  gradingConfig: GradingConfig | null;
  grading: "auto" | "manual";
} {
  const errs: Record<string, string[]> = {};
  const err = (f: string, m: string) => (errs[f] ??= []).push(m);
  let options = p.options;
  let gradingConfig: GradingConfig | null = null;
  let grading = p.grading;

  switch (p.type) {
    case "multiple_choice":
      if (options.length < 2) err("options", "Add at least two options.");
      if (options.filter((o) => o.isCorrect).length !== 1)
        err("options", "Mark exactly one option correct.");
      break;
    case "multiple_select":
      if (options.length < 2) err("options", "Add at least two options.");
      if (!options.some((o) => o.isCorrect)) err("options", "Mark at least one option correct.");
      gradingConfig = { partialCredit: p.partialCredit };
      break;
    case "true_false": {
      const correct = options.find((o) => o.isCorrect)?.content?.toLowerCase();
      if (correct !== "true" && correct !== "false")
        err("options", "Choose True or False as the answer.");
      options = [
        {
          content: "True",
          isCorrect: correct === "true",
          feedback: null,
          matchText: null,
          correctPosition: null,
        },
        {
          content: "False",
          isCorrect: correct === "false",
          feedback: null,
          matchText: null,
          correctPosition: null,
        },
      ];
      break;
    }
    case "fill_blank":
      if (p.acceptedAnswers.length === 0)
        err("acceptedAnswers", "List at least one accepted answer.");
      if (!p.stem.includes("___")) err("stem", "Put ___ where the blank goes.");
      options = [];
      gradingConfig = { acceptedAnswers: p.acceptedAnswers, caseSensitive: false };
      break;
    case "short_answer":
      options = [];
      gradingConfig = { keywords: p.keywords, minMatches: p.keywords.length ? 1 : 0 };
      if (grading === "auto" && p.keywords.length === 0)
        err("keywords", "Auto-grading needs at least one keyword, or switch to manual.");
      break;
    case "extended_response":
      options = [];
      grading = "manual";
      break;
    case "numeric": {
      const n = p.numeric;
      if (!n) {
        err("numeric", "Enter the answer.");
        break;
      }
      const cfg: Record<string, unknown> = { mode: n.mode, unit: n.unit ?? null };
      if (n.mode === "range") {
        if (n.min == null || n.max == null) err("numeric", "Enter both min and max.");
        else if (n.min > n.max) err("numeric", "Min must not be greater than max.");
        cfg.min = n.min;
        cfg.max = n.max;
      } else {
        if (n.answer == null) err("numeric", "Enter the answer.");
        cfg.answer = n.answer;
        if (n.mode === "tolerance") {
          if (n.tolerance == null) err("numeric", "Enter the ± tolerance.");
          cfg.tolerance = n.tolerance;
        }
        if (n.mode === "percent_tolerance") {
          if (n.percent == null) err("numeric", "Enter the % tolerance.");
          cfg.percent = n.percent;
        }
      }
      options = [];
      gradingConfig = cfg as GradingConfig;
      break;
    }
    case "ordering":
      if (options.length < 2) err("options", "Add at least two options.");
      options = options.map((o, i) => ({ ...o, correctPosition: o.correctPosition ?? i + 1 }));
      break;
    case "matching":
      if (options.length < 2) err("options", "Add at least two pairs.");
      if (options.some((o) => !o.matchText)) err("options", "Every pair needs a right-hand side.");
      break;
  }
  if (Object.keys(errs).length) throw new ActionError("Check the question.", 400, errs);
  return { options, gradingConfig, grading };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type BankCtx = { id: string; ownerId: string; courseId: string | null };

export async function loadBankCtx(bankId: string): Promise<BankCtx> {
  const bank = await db.query.questionBanks.findFirst({
    columns: { id: true, ownerId: true, courseId: true },
    where: eq(schema.questionBanks.id, bankId),
  });
  if (!bank) throw new ActionError("Bank not found.", 404);
  return bank;
}

// Rule: a question may only be tagged with targets (and units) from its bank's course.
async function assertCourseScoped(bank: BankCtx, targetIds: string[], unitId: string | null) {
  if (targetIds.length) {
    if (!bank.courseId)
      throw new ActionError("Give the bank a course before tagging targets.", 400);
    const rows = await db
      .select({ id: schema.learningTargets.id })
      .from(schema.learningTargets)
      .where(
        and(
          eq(schema.learningTargets.courseId, bank.courseId),
          inArray(schema.learningTargets.id, targetIds)
        )
      );
    if (rows.length !== new Set(targetIds).size)
      throw new ActionError("One of those targets isn't in this bank's course.", 400);
  }
  if (unitId) {
    const u = await db.query.units.findFirst({
      columns: { courseId: true },
      where: eq(schema.units.id, unitId),
    });
    if (!u || u.courseId !== bank.courseId)
      throw new ActionError("That unit isn't in this bank's course.", 400);
  }
}

async function ensureStandards(codes: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)))) {
    const found = await db.query.standards.findFirst({
      columns: { id: true },
      where: sql`lower(${schema.standards.code}) = ${raw.toLowerCase()}`,
    });
    if (found) {
      ids.push(found.id);
      continue;
    }
    const framework = /^(HS|MS|K|[1-5])-/i.test(raw) ? "NGSS" : "Other";
    const [s] = await db
      .insert(schema.standards)
      .values({ framework, code: raw })
      .returning({ id: schema.standards.id });
    ids.push(s.id);
  }
  return ids;
}

async function writeQuestionRow(
  bank: BankCtx,
  p: QuestionPayload,
  extra: { version: number; previousVersionId: string | null; externalId: string | null }
): Promise<string> {
  const { options, gradingConfig, grading } = validatePayload(p);
  await assertCourseScoped(bank, p.targetIds, p.unitId);
  const standardIds = await ensureStandards(p.standardCodes);

  const [q] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: bank.ownerId,
      unitId: p.unitId,
      type: p.type,
      stem: p.stem,
      explanation: p.explanation,
      points: p.points,
      difficulty: p.difficulty,
      bloom: p.bloom,
      grading,
      gradingConfig,
      topic: p.topic,
      tags: Array.from(new Set(p.tags.map((t) => t.trim()).filter(Boolean))),
      notes: p.notes,
      mediaUrl: p.mediaUrl,
      videoUrl: p.videoUrl,
      stimulusId: p.stimulusId,
      externalId: extra.externalId,
      version: extra.version,
      previousVersionId: extra.previousVersionId,
    })
    .returning({ id: schema.questions.id });

  if (options.length) {
    await db.insert(schema.questionOptions).values(
      options.map((o, i) => ({
        questionId: q.id,
        content: o.content,
        isCorrect: o.isCorrect,
        feedback: o.feedback,
        matchText: o.matchText,
        correctPosition: o.correctPosition,
        sortOrder: i,
      }))
    );
  }
  if (p.targetIds.length) {
    await db.insert(schema.questionTargets).values(
      Array.from(new Set(p.targetIds)).map((learningTargetId) => ({
        questionId: q.id,
        learningTargetId,
      }))
    );
  }
  if (standardIds.length) {
    await db
      .insert(schema.questionStandards)
      .values(standardIds.map((standardId) => ({ questionId: q.id, standardId })));
  }
  return q.id;
}

/** Create a brand-new question (version 1). */
export async function createQuestionRow(bank: BankCtx, p: QuestionPayload): Promise<string> {
  return writeQuestionRow(bank, p, { version: 1, previousVersionId: null, externalId: null });
}

/**
 * Save an edit as a new version: the old row is archived (keeping its options
 * and tags for history), its external_id and pool memberships move to the new row.
 */
export async function saveNewVersion(
  bank: BankCtx,
  questionId: string,
  p: QuestionPayload
): Promise<string> {
  const prior = await db.query.questions.findFirst({
    columns: { id: true, version: true, externalId: true, bankId: true, isArchived: true },
    where: eq(schema.questions.id, questionId),
  });
  if (!prior || prior.bankId !== bank.id)
    throw new ActionError("Question not found in this bank.", 404);
  if (prior.isArchived)
    throw new ActionError("This version is archived; edit the current version instead.", 409);

  await db
    .update(schema.questions)
    .set({ isArchived: true, externalId: null })
    .where(eq(schema.questions.id, prior.id));
  const newId = await writeQuestionRow(bank, p, {
    version: prior.version + 1,
    previousVersionId: prior.id,
    externalId: prior.externalId,
  });
  await db
    .update(schema.poolQuestions)
    .set({ questionId: newId })
    .where(eq(schema.poolQuestions.questionId, prior.id));
  return newId;
}

/** Copy a question (options, targets, standards) into a bank as a fresh version-1 row without an external_id. */
export async function duplicateQuestionRow(
  fromQuestionId: string,
  toBank: BankCtx
): Promise<string> {
  const q = await db.query.questions.findFirst({ where: eq(schema.questions.id, fromQuestionId) });
  if (!q) throw new ActionError("Question not found.", 404);
  const opts = await db.query.questionOptions.findMany({
    where: eq(schema.questionOptions.questionId, fromQuestionId),
    orderBy: (o, { asc }) => [asc(o.sortOrder)],
  });
  const targets = await db.query.questionTargets.findMany({
    where: eq(schema.questionTargets.questionId, fromQuestionId),
  });
  const stds = await db.query.questionStandards.findMany({
    where: eq(schema.questionStandards.questionId, fromQuestionId),
  });

  // Targets, unit, and stimulus only carry over when the destination shares the source course.
  const sameCourse = await sameCourseAs(q.bankId, toBank);
  const [n] = await db
    .insert(schema.questions)
    .values({
      bankId: toBank.id,
      ownerId: toBank.ownerId,
      unitId: sameCourse ? q.unitId : null,
      type: q.type,
      stem: q.stem,
      explanation: q.explanation,
      points: q.points,
      difficulty: q.difficulty,
      bloom: q.bloom,
      grading: q.grading,
      gradingConfig: q.gradingConfig,
      topic: q.topic,
      tags: q.tags,
      notes: q.notes,
      mediaAssetId: q.mediaAssetId,
      mediaUrl: q.mediaUrl,
      videoUrl: q.videoUrl,
      stimulusId: sameCourse ? q.stimulusId : null,
      templateId: q.templateId,
      externalId: null,
      version: 1,
      previousVersionId: null,
    })
    .returning({ id: schema.questions.id });
  if (opts.length) {
    await db.insert(schema.questionOptions).values(
      opts.map((o) => ({
        questionId: n.id,
        content: o.content,
        isCorrect: o.isCorrect,
        feedback: o.feedback,
        matchText: o.matchText,
        correctPosition: o.correctPosition,
        sortOrder: o.sortOrder,
      }))
    );
  }
  if (sameCourse && targets.length) {
    await db
      .insert(schema.questionTargets)
      .values(targets.map((t) => ({ questionId: n.id, learningTargetId: t.learningTargetId })));
  }
  if (stds.length)
    await db
      .insert(schema.questionStandards)
      .values(stds.map((s) => ({ questionId: n.id, standardId: s.standardId })));
  return n.id;
}

async function sameCourseAs(bankId: string, other: BankCtx): Promise<boolean> {
  const b = await db.query.questionBanks.findFirst({
    columns: { courseId: true },
    where: eq(schema.questionBanks.id, bankId),
  });
  return !!b && !!b.courseId && b.courseId === other.courseId;
}

/** Every version of a question, newest first, following previous_version_id back to v1. */
export async function questionHistory(questionId: string) {
  const chain: {
    id: string;
    version: number;
    stem: string;
    updatedAt: Date;
    isArchived: boolean;
  }[] = [];
  let cursor: string | null = questionId;
  // Walk forward first: if this id is an old version, find the newest by following successors.
  for (let i = 0; i < 200 && cursor; i++) {
    const next: { id: string } | undefined = await db.query.questions.findFirst({
      columns: { id: true },
      where: eq(schema.questions.previousVersionId, cursor),
    });
    if (!next) break;
    cursor = next.id;
  }
  for (let i = 0; i < 200 && cursor; i++) {
    const row:
      | {
          id: string;
          version: number;
          stem: string;
          updatedAt: Date;
          isArchived: boolean;
          previousVersionId: string | null;
        }
      | undefined = await db.query.questions.findFirst({
      columns: {
        id: true,
        version: true,
        stem: true,
        updatedAt: true,
        isArchived: true,
        previousVersionId: true,
      },
      where: eq(schema.questions.id, cursor),
    });
    if (!row) break;
    chain.push({
      id: row.id,
      version: row.version,
      stem: row.stem,
      updatedAt: row.updatedAt,
      isArchived: row.isArchived,
    });
    cursor = row.previousVersionId;
  }
  return chain;
}
