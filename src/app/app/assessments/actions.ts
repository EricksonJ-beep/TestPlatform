"use server";

import { and, asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireShared, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse } from "@/lib/current-course";

const uuid = z.string().uuid();
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues)
    (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}
const invalid = (e: z.ZodError) => new ActionError("Check the form.", 400, fieldErrors(e));
const bool = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");
const optInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= min && v <= max),
      `Must be a whole number between ${min} and ${max}.`
    );

function revalidate(assessmentId: string) {
  revalidatePath("/app/assessments");
  revalidatePath(`/app/assessments/${assessmentId}`);
  revalidatePath(`/app/assessments/${assessmentId}/preview`);
  revalidatePath("/app");
}

const edit = { type: "assessment" as const };

// Rule: sections and items must belong to the assessment the caller was authorized for.
async function assertSection(assessmentId: string, sectionId: string) {
  const s = await db.query.assessmentSections.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.assessmentSections.id, sectionId),
      eq(schema.assessmentSections.assessmentId, assessmentId)
    ),
  });
  if (!s) throw new ActionError("That section isn't on this assessment.", 404);
}
async function assertItem(assessmentId: string, itemId: string) {
  const [row] = await db
    .select({ id: schema.assessmentQuestions.id, sectionId: schema.assessmentQuestions.sectionId })
    .from(schema.assessmentQuestions)
    .innerJoin(
      schema.assessmentSections,
      eq(schema.assessmentQuestions.sectionId, schema.assessmentSections.id)
    )
    .where(
      and(
        eq(schema.assessmentQuestions.id, itemId),
        eq(schema.assessmentSections.assessmentId, assessmentId)
      )
    )
    .limit(1);
  if (!row) throw new ActionError("That item isn't on this assessment.", 404);
  return row;
}
async function courseOf(assessmentId: string): Promise<string | null> {
  const a = await db.query.assessments.findFirst({
    columns: { courseId: true },
    where: eq(schema.assessments.id, assessmentId),
  });
  return a?.courseId ?? null;
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  type: z.enum(["practice", "formative", "summative"]),
  courseId: uuid,
});

/** Create an assessment on one of your courses. Defaults follow PLAN.md §2 by type. */
export const createAssessment = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  if (!(await ownsCourse(session.userId, parsed.data.courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const { title, type, courseId } = parsed.data;
  const [a] = await db
    .insert(schema.assessments)
    .values({
      ownerId: session.userId,
      courseId,
      title,
      type,
      attemptLimit: type === "practice" ? null : type === "formative" ? 3 : 2,
      reviewMode: "auto",
      showResultsImmediately: type !== "summative",
    })
    .returning({ id: schema.assessments.id });
  revalidate(a.id);
  return { assessmentId: a.id };
});

const settingsSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  type: z.enum(["practice", "formative", "summative"]),
  instructions: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  attemptLimit: optInt(1, 20),
  reviewMode: z.enum(["auto", "teacher_approved"]),
  retakeThreshold: z
    .string()
    .transform(Number)
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 100, "Threshold is 0–100."),
  optionalRetakes: bool,
  randomizeQuestions: bool,
  randomizeOptions: bool,
  oneAtATime: bool,
  allowBacktrack: bool,
  showResultsImmediately: bool,
});

export const updateAssessmentSettings = withAuthz(
  async (assessmentId: string, formData: FormData) => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw invalid(parsed.error);
    await db
      .update(schema.assessments)
      .set(parsed.data)
      .where(eq(schema.assessments.id, assessmentId));
    revalidate(assessmentId);
    return { ok: true };
  }
);

/** Publishing makes an assessment assignable; unpublishing is refused while assignments exist. */
export const setPublished = withAuthz(async (assessmentId: string, published: boolean) => {
  await requireShared({ ...edit, id: assessmentId }, "co_edit");
  if (published) {
    const n = await db.$count(
      schema.assessmentQuestions,
      inArray(
        schema.assessmentQuestions.sectionId,
        db
          .select({ id: schema.assessmentSections.id })
          .from(schema.assessmentSections)
          .where(eq(schema.assessmentSections.assessmentId, assessmentId))
      )
    );
    if (n === 0)
      throw new ActionError("Add at least one question or pool draw before publishing.", 400);
  } else {
    const n = await db.$count(
      schema.assignments,
      eq(schema.assignments.assessmentId, assessmentId)
    );
    if (n > 0)
      throw new ActionError(
        "This assessment is assigned to a class; close those assignments first.",
        409
      );
  }
  await db
    .update(schema.assessments)
    .set({ isPublished: published })
    .where(eq(schema.assessments.id, assessmentId));
  revalidate(assessmentId);
  return { ok: true };
});

export const deleteAssessment = withAuthz(async (assessmentId: string) => {
  const access = await requireShared({ ...edit, id: assessmentId }, "co_edit");
  if (access.access !== "owner")
    throw new ActionError("Only the owner can delete an assessment.", 403);
  const n = await db.$count(schema.assignments, eq(schema.assignments.assessmentId, assessmentId));
  if (n > 0) throw new ActionError("This assessment has assignments; it can't be deleted.", 409);
  await db.delete(schema.assessments).where(eq(schema.assessments.id, assessmentId));
  revalidate(assessmentId);
  return { ok: true };
});

/** Copy structure and settings into a new, unpublished assessment you own. */
export const duplicateAssessment = withAuthz(async (assessmentId: string) => {
  const session = await requireShared({ ...edit, id: assessmentId }, "view");
  const src = await db.query.assessments.findFirst({
    where: eq(schema.assessments.id, assessmentId),
  });
  if (!src) throw new ActionError("Not found.", 404);
  if (src.courseId && !(await ownsCourse(session.userId, src.courseId))) {
    throw new ActionError(
      "You can only copy an assessment onto a course you own; ask for the course to be shared first.",
      400
    );
  }
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [copy] = await db
    .insert(schema.assessments)
    .values({ ...rest, ownerId: session.userId, title: `${src.title} (copy)`, isPublished: false })
    .returning({ id: schema.assessments.id });
  const sections = await db.query.assessmentSections.findMany({
    where: eq(schema.assessmentSections.assessmentId, assessmentId),
    orderBy: (s, { asc: a }) => [a(s.sortOrder)],
  });
  for (const s of sections) {
    const [ns] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId: copy.id,
        title: s.title,
        instructions: s.instructions,
        sortOrder: s.sortOrder,
        learningTargetId: s.learningTargetId,
      })
      .returning({ id: schema.assessmentSections.id });
    const items = await db.query.assessmentQuestions.findMany({
      where: eq(schema.assessmentQuestions.sectionId, s.id),
    });
    if (items.length) {
      await db.insert(schema.assessmentQuestions).values(
        items.map((i) => ({
          sectionId: ns.id,
          questionId: i.questionId,
          poolId: i.poolId,
          drawCount: i.drawCount,
          sortOrder: i.sortOrder,
          points: i.points,
        }))
      );
    }
  }
  revalidate(copy.id);
  return { assessmentId: copy.id };
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const sectionSchema = z.object({
  title: z.string().trim().min(1, "Give the section a title.").max(160),
  instructions: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  learningTargetId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

// Rule: a section's target must belong to the assessment's course.
async function assertTargetOnCourse(assessmentId: string, learningTargetId: string | null) {
  if (!learningTargetId) return;
  const courseId = await courseOf(assessmentId);
  const t = await db.query.learningTargets.findFirst({
    columns: { courseId: true },
    where: eq(schema.learningTargets.id, learningTargetId),
  });
  if (!t || !courseId || t.courseId !== courseId)
    throw new ActionError("That target isn't on this assessment's course.", 400);
}

export const addSection = withAuthz(async (assessmentId: string, formData: FormData) => {
  await requireShared({ ...edit, id: assessmentId }, "co_edit");
  const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  await assertTargetOnCourse(assessmentId, parsed.data.learningTargetId);
  const [{ last }] = await db
    .select({ last: max(schema.assessmentSections.sortOrder) })
    .from(schema.assessmentSections)
    .where(eq(schema.assessmentSections.assessmentId, assessmentId));
  const [s] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId, ...parsed.data, sortOrder: (last ?? -1) + 1 })
    .returning({ id: schema.assessmentSections.id });
  revalidate(assessmentId);
  return { sectionId: s.id };
});

/** Summative helper: one section per course target that doesn't have one yet (PLAN.md §3.4). */
export const addSectionPerTarget = withAuthz(async (assessmentId: string) => {
  await requireShared({ ...edit, id: assessmentId }, "co_edit");
  const courseId = await courseOf(assessmentId);
  if (!courseId) throw new ActionError("The assessment needs a course.", 400);
  const targets = await db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
    })
    .from(schema.learningTargets)
    .where(eq(schema.learningTargets.courseId, courseId))
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));
  const existing = new Set(
    (
      await db.query.assessmentSections.findMany({
        columns: { learningTargetId: true },
        where: eq(schema.assessmentSections.assessmentId, assessmentId),
      })
    ).map((s) => s.learningTargetId)
  );
  const [{ last }] = await db
    .select({ last: max(schema.assessmentSections.sortOrder) })
    .from(schema.assessmentSections)
    .where(eq(schema.assessmentSections.assessmentId, assessmentId));
  let order = (last ?? -1) + 1;
  let created = 0;
  for (const t of targets) {
    if (existing.has(t.id)) continue;
    await db.insert(schema.assessmentSections).values({
      assessmentId,
      title: `${t.code} · ${t.title}`,
      learningTargetId: t.id,
      sortOrder: order++,
    });
    created++;
  }
  revalidate(assessmentId);
  return { created };
});

export const updateSection = withAuthz(
  async (assessmentId: string, sectionId: string, formData: FormData) => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    await assertSection(assessmentId, sectionId);
    const parsed = sectionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw invalid(parsed.error);
    await assertTargetOnCourse(assessmentId, parsed.data.learningTargetId);
    await db
      .update(schema.assessmentSections)
      .set(parsed.data)
      .where(eq(schema.assessmentSections.id, sectionId));
    revalidate(assessmentId);
    return { ok: true };
  }
);

export const deleteSection = withAuthz(async (assessmentId: string, sectionId: string) => {
  await requireShared({ ...edit, id: assessmentId }, "co_edit");
  await assertSection(assessmentId, sectionId);
  await db.delete(schema.assessmentSections).where(eq(schema.assessmentSections.id, sectionId));
  revalidate(assessmentId);
  return { ok: true };
});

export const moveSection = withAuthz(
  async (assessmentId: string, sectionId: string, direction: "up" | "down") => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    const rows = await db
      .select({ id: schema.assessmentSections.id })
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, assessmentId))
      .orderBy(asc(schema.assessmentSections.sortOrder));
    const i = rows.findIndex((r) => r.id === sectionId);
    if (i === -1) throw new ActionError("That section isn't on this assessment.", 404);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return { ok: true };
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [k, r] of rows.entries())
      await db
        .update(schema.assessmentSections)
        .set({ sortOrder: k })
        .where(eq(schema.assessmentSections.id, r.id));
    revalidate(assessmentId);
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// Items: fixed questions and pool draws
// ---------------------------------------------------------------------------

async function nextItemOrder(sectionId: string) {
  const [{ last }] = await db
    .select({ last: max(schema.assessmentQuestions.sortOrder) })
    .from(schema.assessmentQuestions)
    .where(eq(schema.assessmentQuestions.sectionId, sectionId));
  return (last ?? -1) + 1;
}

/** Add fixed questions. Rule: each question must be live, on the assessment's course, and in a bank the caller can at least view. */
export const addQuestions = withAuthz(
  async (assessmentId: string, sectionId: string, questionIds: string[]) => {
    const session = await requireShared({ ...edit, id: assessmentId }, "co_edit");
    await assertSection(assessmentId, sectionId);
    const ids = Array.from(new Set(questionIds));
    if (ids.length === 0 || ids.length > 100)
      throw new ActionError("Pick between 1 and 100 questions.", 400);
    const courseId = await courseOf(assessmentId);
    const rows = await db
      .select({
        id: schema.questions.id,
        bankId: schema.questions.bankId,
        bankOwner: schema.questionBanks.ownerId,
        bankCourse: schema.questionBanks.courseId,
        archived: schema.questions.isArchived,
      })
      .from(schema.questions)
      .innerJoin(schema.questionBanks, eq(schema.questions.bankId, schema.questionBanks.id))
      .where(inArray(schema.questions.id, ids));
    if (rows.length !== ids.length)
      throw new ActionError("Some of those questions don't exist.", 404);
    for (const r of rows) {
      if (r.archived) throw new ActionError("One of those questions is archived.", 400);
      if (!courseId || r.bankCourse !== courseId)
        throw new ActionError("Questions must come from a bank on this assessment's course.", 400);
      if (r.bankOwner !== session.userId) {
        const share = await db.query.shares.findFirst({
          columns: { id: true },
          where: and(
            eq(schema.shares.resourceType, "question_bank"),
            eq(schema.shares.resourceId, r.bankId),
            eq(schema.shares.sharedWithUserId, session.userId)
          ),
        });
        if (!share)
          throw new ActionError(
            "One of those questions is in a bank that isn't shared with you.",
            403
          );
      }
    }
    const already = new Set(
      (
        await db.query.assessmentQuestions.findMany({
          columns: { questionId: true },
          where: eq(schema.assessmentQuestions.sectionId, sectionId),
        })
      ).map((x) => x.questionId)
    );
    let order = await nextItemOrder(sectionId);
    let added = 0;
    for (const id of ids) {
      if (already.has(id)) continue;
      await db
        .insert(schema.assessmentQuestions)
        .values({ sectionId, questionId: id, sortOrder: order++ });
      added++;
    }
    revalidate(assessmentId);
    return { added };
  }
);

/** Add a "draw N from pool" item. Rule: the pool must be on the assessment's course. */
export const addPoolDraw = withAuthz(
  async (assessmentId: string, sectionId: string, poolId: string, drawCount: number) => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    await assertSection(assessmentId, sectionId);
    if (!Number.isInteger(drawCount) || drawCount < 1 || drawCount > 100)
      throw new ActionError("Draw between 1 and 100 questions.", 400);
    const courseId = await courseOf(assessmentId);
    const pool = await db.query.questionPools.findFirst({
      columns: { courseId: true },
      where: eq(schema.questionPools.id, poolId),
    });
    if (!pool || !courseId || pool.courseId !== courseId)
      throw new ActionError("That pool isn't on this assessment's course.", 400);
    const [item] = await db
      .insert(schema.assessmentQuestions)
      .values({ sectionId, poolId, drawCount, sortOrder: await nextItemOrder(sectionId) })
      .returning({ id: schema.assessmentQuestions.id });
    revalidate(assessmentId);
    return { itemId: item.id };
  }
);

const itemPatch = z.object({
  points: z.number().int().min(0).max(100).nullable().optional(),
  drawCount: z.number().int().min(1).max(100).optional(),
});

export const updateItem = withAuthz(
  async (assessmentId: string, itemId: string, patch: unknown) => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    await assertItem(assessmentId, itemId);
    const parsed = itemPatch.safeParse(patch);
    if (!parsed.success) throw new ActionError("Invalid change.", 400);
    await db
      .update(schema.assessmentQuestions)
      .set(parsed.data)
      .where(eq(schema.assessmentQuestions.id, itemId));
    revalidate(assessmentId);
    return { ok: true };
  }
);

export const removeItem = withAuthz(async (assessmentId: string, itemId: string) => {
  await requireShared({ ...edit, id: assessmentId }, "co_edit");
  await assertItem(assessmentId, itemId);
  await db.delete(schema.assessmentQuestions).where(eq(schema.assessmentQuestions.id, itemId));
  revalidate(assessmentId);
  return { ok: true };
});

export const moveItem = withAuthz(
  async (assessmentId: string, itemId: string, direction: "up" | "down") => {
    await requireShared({ ...edit, id: assessmentId }, "co_edit");
    const item = await assertItem(assessmentId, itemId);
    const rows = await db
      .select({ id: schema.assessmentQuestions.id })
      .from(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.sectionId, item.sectionId))
      .orderBy(asc(schema.assessmentQuestions.sortOrder));
    const i = rows.findIndex((r) => r.id === itemId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return { ok: true };
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [k, r] of rows.entries())
      await db
        .update(schema.assessmentQuestions)
        .set({ sortOrder: k })
        .where(eq(schema.assessmentQuestions.id, r.id));
    revalidate(assessmentId);
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// Picker search (read-only, but still a server action so it is guarded)
// ---------------------------------------------------------------------------

export type PickerQuestion = {
  id: string;
  type: string;
  stem: string;
  points: number;
  stimulusTitle: string | null;
  targets: { id: string; code: string; title: string }[];
};

/** Questions from one bank for the builder's picker. Rule: caller can view the assessment and the bank. */
export const searchBankQuestions = withAuthz(
  async (
    assessmentId: string,
    bankId: string,
    filters: { q?: string; targetId?: string; type?: string }
  ) => {
    await requireShared({ ...edit, id: assessmentId }, "view");
    await requireShared({ type: "question_bank", id: bankId }, "view");
    const { listBankQuestions } = await import("@/lib/queries/banks");
    const rows = await listBankQuestions(bankId, {
      q: filters.q,
      targetId: filters.targetId,
      type: filters.type,
    });
    return rows.map((r): PickerQuestion => ({
      id: r.id,
      type: r.type,
      stem: r.stem,
      points: r.points,
      stimulusTitle: r.stimulus?.title ?? (r.stimulus ? "Shared stimulus" : null),
      targets: r.targets,
    }));
  }
);
