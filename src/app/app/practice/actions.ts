"use server";

import { and, asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireContentAccess, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse, rememberCourse } from "@/lib/current-course";
import { recomputeGatesForStudent } from "@/lib/gates";
import { setCompletionVerified } from "@/lib/practice";
import { GUIDED_NOTES_MAX_PROMPTS, GUIDED_NOTES_MIN_PROMPTS } from "@/lib/practice-rules";

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
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null);

function revalidate(ref?: { type: "practice_set" | "relearning_activity"; id: string }) {
  revalidatePath("/app/practice");
  revalidatePath("/app");
  revalidatePath("/student");
  if (ref?.type === "practice_set") revalidatePath(`/app/practice/sets/${ref.id}`);
  if (ref?.type === "relearning_activity") revalidatePath(`/app/practice/activities/${ref.id}`);
}

const SET = "practice_set" as const;
const ACT = "relearning_activity" as const;

// Rule: an item's targets must belong to its course.
async function assertTargetsOnCourse(courseId: string | null, targetIds: string[]) {
  if (targetIds.length === 0) return;
  if (!courseId) throw new ActionError("Give the item a course before tagging targets.", 400);
  const rows = await db
    .select({ id: schema.learningTargets.id })
    .from(schema.learningTargets)
    .where(
      and(
        inArray(schema.learningTargets.id, targetIds),
        eq(schema.learningTargets.courseId, courseId)
      )
    );
  if (rows.length !== targetIds.length)
    throw new ActionError("Every target must be on this item's course.", 400);
}
function targetIdsFrom(formData: FormData): string[] {
  const ids = Array.from(new Set(formData.getAll("targetIds").map(String).filter(Boolean)));
  if (ids.some((id) => !uuid.safeParse(id).success)) throw new ActionError("Bad target.", 400);
  return ids;
}

/** Every student who has a final score on a summative on this course: their gates may change. */
async function recomputeGatesForCourse(courseId: string | null) {
  if (!courseId) return;
  const rows = await db
    .selectDistinct({ studentId: schema.assignmentFinalScores.studentId })
    .from(schema.assignmentFinalScores)
    .innerJoin(
      schema.assignments,
      eq(schema.assignmentFinalScores.assignmentId, schema.assignments.id)
    )
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(
      and(eq(schema.assessments.courseId, courseId), eq(schema.assessments.type, "summative"))
    );
  for (const r of rows) await recomputeGatesForStudent(r.studentId);
}

// ---------------------------------------------------------------------------
// Practice sets
// ---------------------------------------------------------------------------

const createSetSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  courseId: uuid,
});

export const createPracticeSet = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = createSetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  if (!(await ownsCourse(session.userId, parsed.data.courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const [{ last }] = await db
    .select({ last: max(schema.practiceSets.sortOrder) })
    .from(schema.practiceSets)
    .where(eq(schema.practiceSets.ownerId, session.userId));
  const [s] = await db
    .insert(schema.practiceSets)
    .values({ ownerId: session.userId, ...parsed.data, sortOrder: (last ?? -1) + 1 })
    .returning({ id: schema.practiceSets.id });
  await rememberCourse(parsed.data.courseId);
  revalidate({ type: SET, id: s.id });
  return { practiceSetId: s.id };
});

const setSettingsSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  description: optText(2000),
  source: z.enum(["fixed", "pool"]),
  poolId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  drawCount: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 100),
      "Draw between 1 and 100 questions."
    ),
});

/** Title, description, targets, and the source (fixed questions or a pool draw). */
export const updatePracticeSet = withAuthz(async (setId: string, formData: FormData) => {
  const access = await requireContentAccess({ type: SET, id: setId });
  const parsed = setSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const targetIds = targetIdsFrom(formData);
  await assertTargetsOnCourse(access.courseId, targetIds);
  const { source, poolId, drawCount, ...rest } = parsed.data;
  let pool: string | null = null;
  if (source === "pool") {
    if (!poolId) throw new ActionError("Pick a pool.", 400, { poolId: ["Pick a pool."] });
    const p = await db.query.questionPools.findFirst({
      columns: { courseId: true },
      where: eq(schema.questionPools.id, poolId),
    });
    if (!p || !access.courseId || p.courseId !== access.courseId)
      throw new ActionError("That pool isn't on this set's course.", 400);
    pool = poolId;
  }
  await db
    .update(schema.practiceSets)
    .set({ ...rest, poolId: pool, drawCount: pool ? drawCount : null })
    .where(eq(schema.practiceSets.id, setId));
  await db
    .delete(schema.practiceSetTargets)
    .where(eq(schema.practiceSetTargets.practiceSetId, setId));
  if (targetIds.length)
    await db
      .insert(schema.practiceSetTargets)
      .values(targetIds.map((learningTargetId) => ({ practiceSetId: setId, learningTargetId })));
  await recomputeGatesForCourse(access.courseId);
  revalidate({ type: SET, id: setId });
  return { ok: true };
});

/** Add fixed questions. Rule: live questions from banks on the set's course that the caller owns or can view. */
export const addPracticeQuestions = withAuthz(async (setId: string, questionIds: string[]) => {
  const access = await requireContentAccess({ type: SET, id: setId });
  const ids = Array.from(new Set(questionIds));
  if (ids.length === 0 || ids.length > 100)
    throw new ActionError("Pick between 1 and 100 questions.", 400);
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
    if (!access.courseId || r.bankCourse !== access.courseId)
      throw new ActionError("Questions must come from a bank on this set's course.", 400);
    if (r.bankOwner !== access.userId) {
      const share = await db.query.shares.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.shares.resourceType, "question_bank"),
          eq(schema.shares.resourceId, r.bankId),
          eq(schema.shares.sharedWithUserId, access.userId)
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
      await db.query.practiceSetQuestions.findMany({
        columns: { questionId: true },
        where: eq(schema.practiceSetQuestions.practiceSetId, setId),
      })
    ).map((x) => x.questionId)
  );
  const [{ last }] = await db
    .select({ last: max(schema.practiceSetQuestions.sortOrder) })
    .from(schema.practiceSetQuestions)
    .where(eq(schema.practiceSetQuestions.practiceSetId, setId));
  let order = (last ?? -1) + 1;
  let added = 0;
  for (const id of ids) {
    if (already.has(id)) continue;
    await db
      .insert(schema.practiceSetQuestions)
      .values({ practiceSetId: setId, questionId: id, sortOrder: order++ });
    added++;
  }
  revalidate({ type: SET, id: setId });
  return { added };
});

export const removePracticeQuestion = withAuthz(async (setId: string, questionId: string) => {
  await requireContentAccess({ type: SET, id: setId });
  await db
    .delete(schema.practiceSetQuestions)
    .where(
      and(
        eq(schema.practiceSetQuestions.practiceSetId, setId),
        eq(schema.practiceSetQuestions.questionId, questionId)
      )
    );
  revalidate({ type: SET, id: setId });
  return { ok: true };
});

export const movePracticeQuestion = withAuthz(
  async (setId: string, questionId: string, direction: "up" | "down") => {
    await requireContentAccess({ type: SET, id: setId });
    const rows = await db
      .select({ questionId: schema.practiceSetQuestions.questionId })
      .from(schema.practiceSetQuestions)
      .where(eq(schema.practiceSetQuestions.practiceSetId, setId))
      .orderBy(asc(schema.practiceSetQuestions.sortOrder));
    const i = rows.findIndex((r) => r.questionId === questionId);
    if (i === -1) throw new ActionError("That question isn't on this set.", 404);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return { ok: true };
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [k, r] of rows.entries())
      await db
        .update(schema.practiceSetQuestions)
        .set({ sortOrder: k })
        .where(
          and(
            eq(schema.practiceSetQuestions.practiceSetId, setId),
            eq(schema.practiceSetQuestions.questionId, r.questionId)
          )
        );
    revalidate({ type: SET, id: setId });
    return { ok: true };
  }
);

/** Publishing makes a set visible to enrolled students. Rule: it needs at least one question (or a pool) and a target. */
export const setPracticeSetPublished = withAuthz(async (setId: string, published: boolean) => {
  const access = await requireContentAccess({ type: SET, id: setId });
  if (published) {
    const set = await db.query.practiceSets.findFirst({
      columns: { poolId: true, courseId: true },
      where: eq(schema.practiceSets.id, setId),
    });
    const n = set?.poolId
      ? await db.$count(schema.poolQuestions, eq(schema.poolQuestions.poolId, set.poolId))
      : await db.$count(
          schema.practiceSetQuestions,
          eq(schema.practiceSetQuestions.practiceSetId, setId)
        );
    if (n === 0) throw new ActionError("Add at least one question (or pick a pool) first.", 400);
    if (!set?.courseId) throw new ActionError("The set needs a course.", 400);
    const t = await db.$count(
      schema.practiceSetTargets,
      eq(schema.practiceSetTargets.practiceSetId, setId)
    );
    if (t === 0) throw new ActionError("Tag at least one learning target first.", 400);
  }
  await db
    .update(schema.practiceSets)
    .set({ isPublished: published })
    .where(eq(schema.practiceSets.id, setId));
  await recomputeGatesForCourse(access.courseId);
  revalidate({ type: SET, id: setId });
  return { ok: true };
});

export const deletePracticeSet = withAuthz(async (setId: string) => {
  const access = await requireContentAccess({ type: SET, id: setId });
  await db.delete(schema.practiceSets).where(eq(schema.practiceSets.id, setId));
  await recomputeGatesForCourse(access.courseId);
  revalidate();
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Relearning activities
// ---------------------------------------------------------------------------

const KINDS = ["video", "reading", "link", "guided_notes"] as const;

const createActivitySchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  kind: z.enum(KINDS),
  courseId: uuid,
});

export const createActivity = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = createActivitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  if (!(await ownsCourse(session.userId, parsed.data.courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const [{ last }] = await db
    .select({ last: max(schema.relearningActivities.sortOrder) })
    .from(schema.relearningActivities)
    .where(eq(schema.relearningActivities.ownerId, session.userId));
  const [a] = await db
    .insert(schema.relearningActivities)
    .values({
      ownerId: session.userId,
      ...parsed.data,
      sortOrder: (last ?? -1) + 1,
      prompts: parsed.data.kind === "guided_notes" ? [] : null,
    })
    .returning({ id: schema.relearningActivities.id });
  await rememberCourse(parsed.data.courseId);
  revalidate({ type: ACT, id: a.id });
  return { activityId: a.id };
});

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "Use a full http(s) link.");

const activitySchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  content: optText(50_000),
  url: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ?? "").trim() || null),
  requiresTeacherVerification: bool,
});

/** Content by kind: video needs a URL (YouTube or upload), reading needs text, link needs a URL, guided notes need 2–5 prompts. */
export const updateActivity = withAuthz(async (activityId: string, formData: FormData) => {
  const access = await requireContentAccess({ type: ACT, id: activityId });
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const targetIds = targetIdsFrom(formData);
  await assertTargetsOnCourse(access.courseId, targetIds);
  const existing = await db.query.relearningActivities.findFirst({
    columns: { kind: true },
    where: eq(schema.relearningActivities.id, activityId),
  });
  if (!existing) throw new ActionError("Not found.", 404);
  const kind = existing.kind;
  const errors: Record<string, string[]> = {};
  const d = parsed.data;
  if ((kind === "video" || kind === "link") && d.url) {
    const u = httpUrl.safeParse(d.url);
    if (!u.success) errors.url = [u.error.issues[0]?.message ?? "Bad link."];
  }
  if ((kind === "video" || kind === "link") && !d.url) errors.url = ["Add a link first."];
  if (kind === "reading" && !d.content) errors.content = ["Write or paste the reading."];
  let prompts: { id: string; prompt: string }[] | null = null;
  if (kind === "guided_notes") {
    const texts = formData
      .getAll("prompts")
      .map((p) => String(p).trim())
      .filter(Boolean);
    if (texts.length < GUIDED_NOTES_MIN_PROMPTS || texts.length > GUIDED_NOTES_MAX_PROMPTS)
      errors.prompts = [
        `Guided notes have ${GUIDED_NOTES_MIN_PROMPTS} to ${GUIDED_NOTES_MAX_PROMPTS} prompts.`,
      ];
    const ids = formData.getAll("promptIds").map(String);
    prompts = texts.map((prompt, i) => ({
      id:
        ids[i] && /^[a-z0-9-]{1,40}$/.test(ids[i])
          ? ids[i]
          : `p${i + 1}-${Date.now().toString(36)}`,
      prompt: prompt.slice(0, 1000),
    }));
  }
  if (Object.keys(errors).length) throw new ActionError("Check the form.", 400, errors);
  await db
    .update(schema.relearningActivities)
    .set({
      title: d.title,
      content: d.content,
      url: kind === "video" || kind === "link" ? d.url : null,
      requiresTeacherVerification: kind === "link" ? d.requiresTeacherVerification : false,
      prompts,
    })
    .where(eq(schema.relearningActivities.id, activityId));
  await db.delete(schema.activityTargets).where(eq(schema.activityTargets.activityId, activityId));
  if (targetIds.length)
    await db
      .insert(schema.activityTargets)
      .values(targetIds.map((learningTargetId) => ({ activityId, learningTargetId })));
  await recomputeGatesForCourse(access.courseId);
  revalidate({ type: ACT, id: activityId });
  return { ok: true };
});

/** Rule: a published activity has its content and at least one target. */
export const setActivityPublished = withAuthz(async (activityId: string, published: boolean) => {
  const access = await requireContentAccess({ type: ACT, id: activityId });
  if (published) {
    const a = await db.query.relearningActivities.findFirst({
      where: eq(schema.relearningActivities.id, activityId),
    });
    if (!a) throw new ActionError("Not found.", 404);
    const ready =
      a.kind === "video" || a.kind === "link"
        ? !!a.url
        : a.kind === "reading"
          ? !!a.content
          : a.kind === "guided_notes"
            ? (a.prompts?.length ?? 0) >= GUIDED_NOTES_MIN_PROMPTS
            : !!a.worksheetId;
    if (!ready) throw new ActionError("Finish the activity's content before publishing.", 400);
    if (!a.courseId) throw new ActionError("The activity needs a course.", 400);
    const t = await db.$count(
      schema.activityTargets,
      eq(schema.activityTargets.activityId, activityId)
    );
    if (t === 0) throw new ActionError("Tag at least one learning target first.", 400);
  }
  await db
    .update(schema.relearningActivities)
    .set({ isPublished: published })
    .where(eq(schema.relearningActivities.id, activityId));
  await recomputeGatesForCourse(access.courseId);
  revalidate({ type: ACT, id: activityId });
  return { ok: true };
});

export const deleteActivity = withAuthz(async (activityId: string) => {
  const access = await requireContentAccess({ type: ACT, id: activityId });
  await db
    .delete(schema.relearningActivities)
    .where(eq(schema.relearningActivities.id, activityId));
  await recomputeGatesForCourse(access.courseId);
  revalidate();
  return { ok: true };
});

/** Teacher confirms a student's link activity ("optionally teacher-verified", PLAN.md §3.7). */
export const verifyCompletion = withAuthz(
  async (activityId: string, studentId: string, verified: boolean) => {
    await requireContentAccess({ type: ACT, id: activityId });
    if (!uuid.safeParse(studentId).success) throw new ActionError("Bad student.", 400);
    await setCompletionVerified(activityId, studentId, !!verified);
    revalidate({ type: ACT, id: activityId });
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// Sequencing: one order across both kinds per teacher
// ---------------------------------------------------------------------------

/** Move an item up or down in the teacher's sequence (students see the same order). */
export const moveContent = withAuthz(
  async (
    ref: { type: "practice_set" | "relearning_activity"; id: string },
    direction: "up" | "down"
  ) => {
    const session = await requireTeacher();
    await requireContentAccess(ref);
    const sets = await db
      .select({ id: schema.practiceSets.id, sortOrder: schema.practiceSets.sortOrder })
      .from(schema.practiceSets)
      .where(eq(schema.practiceSets.ownerId, session.userId));
    const acts = await db
      .select({
        id: schema.relearningActivities.id,
        sortOrder: schema.relearningActivities.sortOrder,
      })
      .from(schema.relearningActivities)
      .where(eq(schema.relearningActivities.ownerId, session.userId));
    const all = [
      ...sets.map((s) => ({ ...s, type: SET })),
      ...acts.map((a) => ({ ...a, type: ACT })),
    ].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const i = all.findIndex((x) => x.id === ref.id && x.type === ref.type);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i === -1 || j < 0 || j >= all.length) return { ok: true };
    [all[i], all[j]] = [all[j], all[i]];
    for (const [k, x] of all.entries()) {
      if (x.type === SET)
        await db
          .update(schema.practiceSets)
          .set({ sortOrder: k })
          .where(eq(schema.practiceSets.id, x.id));
      else
        await db
          .update(schema.relearningActivities)
          .set({ sortOrder: k })
          .where(eq(schema.relearningActivities.id, x.id));
    }
    revalidate();
    return { ok: true };
  }
);

/**
 * Swap two items' places in the teacher's sequence (Jon, Oct 1 2026: the
 * practice page groups by unit, so "move up" must swap with the neighbour the
 * teacher can see, not the next item in the global order). Both must be the
 * caller's.
 */
export const swapContent = withAuthz(
  async (
    a: { type: "practice_set" | "relearning_activity"; id: string },
    b: { type: "practice_set" | "relearning_activity"; id: string }
  ) => {
    const session = await requireTeacher();
    const [accessA, accessB] = await Promise.all([
      requireContentAccess(a),
      requireContentAccess(b),
    ]);
    if (accessA.as !== "teacher" || accessB.as !== "teacher")
      throw new ActionError("Teachers only.", 403);
    // Renumber the whole sequence in the order the page shows it (sort order, then title),
    // so ties never swallow a swap, then exchange the two positions.
    const sets = await db
      .select({
        id: schema.practiceSets.id,
        title: schema.practiceSets.title,
        sortOrder: schema.practiceSets.sortOrder,
      })
      .from(schema.practiceSets)
      .where(eq(schema.practiceSets.ownerId, session.userId));
    const acts = await db
      .select({
        id: schema.relearningActivities.id,
        title: schema.relearningActivities.title,
        sortOrder: schema.relearningActivities.sortOrder,
      })
      .from(schema.relearningActivities)
      .where(eq(schema.relearningActivities.ownerId, session.userId));
    const all = [
      ...sets.map((s) => ({ ...s, type: SET })),
      ...acts.map((x) => ({ ...x, type: ACT })),
    ].sort((x, y) => x.sortOrder - y.sortOrder || x.title.localeCompare(y.title));
    const i = all.findIndex((x) => x.id === a.id && x.type === a.type);
    const j = all.findIndex((x) => x.id === b.id && x.type === b.type);
    if (i === -1 || j === -1) throw new ActionError("Not found.", 404);
    [all[i], all[j]] = [all[j], all[i]];
    for (const [k, x] of all.entries()) {
      if (x.type === SET)
        await db
          .update(schema.practiceSets)
          .set({ sortOrder: k })
          .where(eq(schema.practiceSets.id, x.id));
      else
        await db
          .update(schema.relearningActivities)
          .set({ sortOrder: k })
          .where(eq(schema.relearningActivities.id, x.id));
    }
    revalidate();
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// Picker search (read-only, but a server action so it is guarded)
// ---------------------------------------------------------------------------

export type PickerQuestion = {
  id: string;
  type: string;
  stem: string;
  points: number;
  targets: { id: string; code: string; title: string }[];
};

export const searchQuestionsForSet = withAuthz(
  async (setId: string, bankId: string, filters: { q?: string; targetId?: string }) => {
    await requireContentAccess({ type: SET, id: setId });
    const { requireShared } = await import("@/lib/authz");
    await requireShared({ type: "question_bank", id: bankId }, "view");
    const { listBankQuestions } = await import("@/lib/queries/banks");
    const rows = await listBankQuestions(bankId, { q: filters.q, targetId: filters.targetId });
    return rows.map((r): PickerQuestion => ({
      id: r.id,
      type: r.type,
      stem: r.stem,
      points: r.points,
      targets: r.targets,
    }));
  }
);
