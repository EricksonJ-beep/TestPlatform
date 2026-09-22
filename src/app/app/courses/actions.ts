"use server";

import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireOwner, requireTeacher, withAuthz } from "@/lib/authz";
import { CURRENT_COURSE_COOKIE } from "@/lib/current-course";

const uuid = z.string().uuid();
const name = (label: string, maxLen = 80) =>
  z.string().trim().min(1, `${label} is required.`).max(maxLen);
const optionalText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null));

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
const invalid = (error: z.ZodError) => new ActionError("Check the form.", 400, fieldErrors(error));

function revalidateCourse(courseId: string) {
  revalidatePath("/app/courses");
  revalidatePath(`/app/courses/${courseId}`);
  revalidatePath("/app", "layout");
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

const courseSchema = z.object({ name: name("Course name"), description: optionalText(500) });

/** Create a course owned by the signed-in teacher; names are unique per teacher (case-insensitive). */
export const createCourse = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  await assertUniqueCourseName(session.userId, parsed.data.name);
  const me = await db.query.users.findFirst({
    columns: { organizationId: true },
    where: eq(schema.users.id, session.userId),
  });
  const [course] = await db
    .insert(schema.courses)
    .values({ ...parsed.data, ownerId: session.userId, organizationId: me?.organizationId ?? null })
    .returning({ id: schema.courses.id });
  revalidateCourse(course.id);
  return { courseId: course.id };
});

export const updateCourse = withAuthz(async (courseId: string, formData: FormData) => {
  const session = await requireOwner({ type: "course", id: courseId });
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  await assertUniqueCourseName(session.userId, parsed.data.name, courseId);
  await db.update(schema.courses).set(parsed.data).where(eq(schema.courses.id, courseId));
  revalidateCourse(courseId);
  return { ok: true };
});

async function assertUniqueCourseName(ownerId: string, courseName: string, exceptId?: string) {
  const clash = await db.query.courses.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.courses.ownerId, ownerId),
      sql`lower(${schema.courses.name}) = ${courseName.toLowerCase()}`
    ),
  });
  if (clash && clash.id !== exceptId) {
    throw new ActionError("You already have a course with that name.", 409, {
      name: ["You already have a course with that name."],
    });
  }
}

/** Remember the current course in a cookie. Only the owner's own courses are accepted. */
export const setCurrentCourse = withAuthz(async (courseId: string | null) => {
  const jar = await cookies();
  if (courseId === null) {
    await requireTeacher();
    jar.delete(CURRENT_COURSE_COOKIE);
  } else {
    await requireOwner({ type: "course", id: courseId });
    jar.set(CURRENT_COURSE_COOKIE, courseId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  revalidatePath("/app", "layout");
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const unitSchema = z.object({ name: name("Unit name") });

export const createUnit = withAuthz(async (courseId: string, formData: FormData) => {
  await requireOwner({ type: "course", id: courseId });
  const parsed = unitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const [{ last }] = await db
    .select({ last: max(schema.units.sortOrder) })
    .from(schema.units)
    .where(eq(schema.units.courseId, courseId));
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId, name: parsed.data.name, sortOrder: (last ?? -1) + 1 })
    .returning({ id: schema.units.id });
  revalidateCourse(courseId);
  return { unitId: unit.id };
});

export const updateUnit = withAuthz(
  async (courseId: string, unitId: string, formData: FormData) => {
    await requireOwner({ type: "course", id: courseId });
    await assertUnitInCourse(courseId, unitId);
    const parsed = unitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw invalid(parsed.error);
    await db
      .update(schema.units)
      .set({ name: parsed.data.name })
      .where(eq(schema.units.id, unitId));
    revalidateCourse(courseId);
    return { ok: true };
  }
);

/** Delete a unit; its targets and questions stay, with unit cleared (FK set null). */
export const deleteUnit = withAuthz(async (courseId: string, unitId: string) => {
  await requireOwner({ type: "course", id: courseId });
  await assertUnitInCourse(courseId, unitId);
  await db.delete(schema.units).where(eq(schema.units.id, unitId));
  revalidateCourse(courseId);
  return { ok: true };
});

/** Move a unit one step up or down in the course order. */
export const moveUnit = withAuthz(
  async (courseId: string, unitId: string, direction: "up" | "down") => {
    await requireOwner({ type: "course", id: courseId });
    const units = await db
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(eq(schema.units.courseId, courseId))
      .orderBy(asc(schema.units.sortOrder), asc(schema.units.name));
    const i = units.findIndex((u) => u.id === unitId);
    if (i === -1) throw new ActionError("That unit isn't in this course.", 404);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= units.length) return { ok: true };
    [units[i], units[j]] = [units[j], units[i]];
    for (const [k, u] of units.entries()) {
      await db.update(schema.units).set({ sortOrder: k }).where(eq(schema.units.id, u.id));
    }
    revalidateCourse(courseId);
    return { ok: true };
  }
);

async function assertUnitInCourse(courseId: string, unitId: string) {
  const row = await db.query.units.findFirst({
    columns: { id: true },
    where: and(eq(schema.units.id, unitId), eq(schema.units.courseId, courseId)),
  });
  if (!row) throw new ActionError("That unit isn't in this course.", 404);
}

// ---------------------------------------------------------------------------
// Learning targets
// ---------------------------------------------------------------------------

const targetSchema = z.object({
  code: z.string().trim().min(1, "Code is required (e.g. LT4).").max(20, "Keep the code short."),
  title: name("Title", 160),
  description: optionalText(1000),
  unitId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export const createTarget = withAuthz(async (courseId: string, formData: FormData) => {
  await requireOwner({ type: "course", id: courseId });
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const { code, title, description, unitId } = parsed.data;
  if (unitId) await assertUnitInCourse(courseId, unitId);
  await assertUniqueCode(courseId, code);
  const [{ last }] = await db
    .select({ last: max(schema.learningTargets.sortOrder) })
    .from(schema.learningTargets)
    .where(eq(schema.learningTargets.courseId, courseId));
  const [target] = await db
    .insert(schema.learningTargets)
    .values({ courseId, code, title, description, unitId, sortOrder: (last ?? -1) + 1 })
    .returning({ id: schema.learningTargets.id });
  revalidateCourse(courseId);
  return { targetId: target.id };
});

export const updateTarget = withAuthz(
  async (courseId: string, targetId: string, formData: FormData) => {
    await requireOwner({ type: "course", id: courseId });
    await assertTargetInCourse(courseId, targetId);
    const parsed = targetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw invalid(parsed.error);
    const { code, title, description, unitId } = parsed.data;
    if (unitId) await assertUnitInCourse(courseId, unitId);
    await assertUniqueCode(courseId, code, targetId);
    await db
      .update(schema.learningTargets)
      .set({ code, title, description, unitId })
      .where(eq(schema.learningTargets.id, targetId));
    revalidateCourse(courseId);
    return { ok: true };
  }
);

/** Refuse to delete a target that questions, pools, or sections still point at. */
export const deleteTarget = withAuthz(async (courseId: string, targetId: string) => {
  await requireOwner({ type: "course", id: courseId });
  await assertTargetInCourse(courseId, targetId);
  const [refs] = await db
    .select({
      questions: sql<number>`(select count(*)::int from ${schema.questionTargets} where learning_target_id = ${targetId})`,
      pools: sql<number>`(select count(*)::int from ${schema.poolTargets} where learning_target_id = ${targetId})`,
      sections: sql<number>`(select count(*)::int from ${schema.assessmentSections} where learning_target_id = ${targetId})`,
    })
    .from(sql`(select 1) as one`);
  const total = refs.questions + refs.pools + refs.sections;
  if (total > 0) {
    throw new ActionError(
      `This target is used by ${refs.questions} question(s), ${refs.pools} pool(s), and ${refs.sections} test section(s). Untag those first.`,
      409
    );
  }
  await db.delete(schema.learningTargets).where(eq(schema.learningTargets.id, targetId));
  revalidateCourse(courseId);
  return { ok: true };
});

async function assertTargetInCourse(courseId: string, targetId: string) {
  const row = await db.query.learningTargets.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.learningTargets.id, targetId),
      eq(schema.learningTargets.courseId, courseId)
    ),
  });
  if (!row) throw new ActionError("That learning target isn't in this course.", 404);
}

// Rule: learning-target codes are unique within a course, case-insensitively.
async function assertUniqueCode(courseId: string, code: string, exceptId?: string) {
  const clash = await db.query.learningTargets.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.learningTargets.courseId, courseId),
      sql`lower(${schema.learningTargets.code}) = ${code.toLowerCase()}`
    ),
  });
  if (clash && clash.id !== exceptId) {
    throw new ActionError(`"${code}" is already used in this course.`, 409, {
      code: [`"${code}" is already used in this course.`],
    });
  }
}

// ---------------------------------------------------------------------------
// Question pools
// ---------------------------------------------------------------------------

const poolSchema = z.object({
  name: name("Pool name"),
  description: optionalText(500),
  drawStimulusGroups: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

function targetIdsFrom(formData: FormData): string[] {
  const ids = formData.getAll("targetIds").map(String).filter(Boolean);
  const parsed = z.array(uuid).safeParse(ids);
  if (!parsed.success) throw new ActionError("Invalid target selection.", 400);
  return Array.from(new Set(parsed.data));
}

export const createPool = withAuthz(async (courseId: string, formData: FormData) => {
  const session = await requireOwner({ type: "course", id: courseId });
  const parsed = poolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const targetIds = targetIdsFrom(formData);
  await assertTargetsInCourse(courseId, targetIds);
  await assertUniquePoolName(courseId, parsed.data.name);
  const [pool] = await db
    .insert(schema.questionPools)
    .values({ ...parsed.data, courseId, ownerId: session.userId })
    .returning({ id: schema.questionPools.id });
  if (targetIds.length) {
    await db
      .insert(schema.poolTargets)
      .values(targetIds.map((learningTargetId) => ({ poolId: pool.id, learningTargetId })));
  }
  revalidateCourse(courseId);
  return { poolId: pool.id };
});

export const updatePool = withAuthz(
  async (courseId: string, poolId: string, formData: FormData) => {
    await requireOwner({ type: "course", id: courseId });
    await requireOwner({ type: "question_pool", id: poolId });
    await assertPoolInCourse(courseId, poolId);
    const parsed = poolSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw invalid(parsed.error);
    const targetIds = targetIdsFrom(formData);
    await assertTargetsInCourse(courseId, targetIds);
    await assertUniquePoolName(courseId, parsed.data.name, poolId);
    await db
      .update(schema.questionPools)
      .set(parsed.data)
      .where(eq(schema.questionPools.id, poolId));
    await db.delete(schema.poolTargets).where(eq(schema.poolTargets.poolId, poolId));
    if (targetIds.length) {
      await db
        .insert(schema.poolTargets)
        .values(targetIds.map((learningTargetId) => ({ poolId, learningTargetId })));
    }
    revalidateCourse(courseId);
    return { ok: true };
  }
);

/** Refuse to delete a pool that still has questions or that a test section draws from. */
export const deletePool = withAuthz(async (courseId: string, poolId: string) => {
  await requireOwner({ type: "course", id: courseId });
  await requireOwner({ type: "question_pool", id: poolId });
  await assertPoolInCourse(courseId, poolId);
  const [refs] = await db
    .select({
      questions: sql<number>`(select count(*)::int from ${schema.poolQuestions} where pool_id = ${poolId})`,
      draws: sql<number>`(select count(*)::int from ${schema.assessmentQuestions} where pool_id = ${poolId})`,
    })
    .from(sql`(select 1) as one`);
  if (refs.questions + refs.draws > 0) {
    throw new ActionError(
      `This pool holds ${refs.questions} question(s) and ${refs.draws} test section(s) draw from it. Empty it first.`,
      409
    );
  }
  await db.delete(schema.questionPools).where(eq(schema.questionPools.id, poolId));
  revalidateCourse(courseId);
  return { ok: true };
});

async function assertPoolInCourse(courseId: string, poolId: string) {
  const row = await db.query.questionPools.findFirst({
    columns: { id: true },
    where: and(eq(schema.questionPools.id, poolId), eq(schema.questionPools.courseId, courseId)),
  });
  if (!row) throw new ActionError("That pool isn't in this course.", 404);
}

// Rule: a pool may only be tagged with targets from its own course.
async function assertTargetsInCourse(courseId: string, targetIds: string[]) {
  if (targetIds.length === 0) return;
  const rows = await db
    .select({ id: schema.learningTargets.id })
    .from(schema.learningTargets)
    .where(
      and(
        eq(schema.learningTargets.courseId, courseId),
        inArray(schema.learningTargets.id, targetIds)
      )
    );
  if (rows.length !== targetIds.length) {
    throw new ActionError("One of those targets isn't in this course.", 400);
  }
}

async function assertUniquePoolName(courseId: string, poolName: string, exceptId?: string) {
  const clash = await db.query.questionPools.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.questionPools.courseId, courseId),
      sql`lower(${schema.questionPools.name}) = ${poolName.toLowerCase()}`
    ),
  });
  if (clash && clash.id !== exceptId) {
    throw new ActionError("A pool with that name already exists in this course.", 409, {
      name: ["A pool with that name already exists in this course."],
    });
  }
}
