"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireOwner, requireShared, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse, rememberCourse } from "@/lib/current-course";
import { findTeacherByEmail, type ShareRef } from "@/lib/queries/shares";

const refSchema = z.object({
  type: z.enum(["question_bank", "assessment"]),
  id: z.string().uuid(),
});
const permissionSchema = z.enum(["view", "copy", "co_edit"]);

function revalidate(ref: ShareRef) {
  revalidatePath("/app/shared");
  revalidatePath("/app/banks");
  revalidatePath("/app/assessments");
  revalidatePath(
    ref.type === "question_bank" ? `/app/banks/${ref.id}` : `/app/assessments/${ref.id}`
  );
}
function parseRef(input: unknown): ShareRef {
  const parsed = refSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("Bad resource.", 400);
  return parsed.data;
}

/**
 * Share a bank or assessment with a colleague by email at view / copy / co_edit
 * (PLAN.md §3.12). Owner only; sharing again changes the permission.
 */
export const shareResource = withAuthz(async (rawRef: unknown, formData: FormData) => {
  const ref = parseRef(rawRef);
  const session = await requireOwner(ref);
  const email = String(formData.get("email") ?? "").trim();
  const permission = permissionSchema.safeParse(formData.get("permission"));
  if (!permission.success) throw new ActionError("Pick a permission.", 400);
  const teacher = await findTeacherByEmail(email);
  if (!teacher)
    throw new ActionError("No teacher account has that email.", 404, {
      email: ["No teacher account has that email."],
    });
  if (teacher.id === session.userId)
    throw new ActionError("That's you.", 400, { email: ["That's your own email."] });
  await db
    .insert(schema.shares)
    .values({
      resourceType: ref.type,
      resourceId: ref.id,
      ownerId: session.userId,
      sharedWithUserId: teacher.id,
      permission: permission.data,
    })
    .onConflictDoUpdate({
      target: [
        schema.shares.resourceType,
        schema.shares.resourceId,
        schema.shares.sharedWithUserId,
      ],
      set: { permission: permission.data },
    });
  revalidate(ref);
  return { userId: teacher.id, permission: permission.data };
});

/** Owner only. The colleague loses access at once; copies they already made are theirs. */
export const revokeShare = withAuthz(async (rawRef: unknown, sharedWithUserId: string) => {
  const ref = parseRef(rawRef);
  await requireOwner(ref);
  if (!z.string().uuid().safeParse(sharedWithUserId).success)
    throw new ActionError("Bad user.", 400);
  await db
    .delete(schema.shares)
    .where(
      and(
        eq(schema.shares.resourceType, ref.type),
        eq(schema.shares.resourceId, ref.id),
        eq(schema.shares.sharedWithUserId, sharedWithUserId)
      )
    );
  revalidate(ref);
  return { ok: true };
});

/** Targets on the destination course keyed by code (lower-cased), for remapping copies. */
async function targetsByCode(courseId: string | null): Promise<Map<string, string>> {
  if (!courseId) return new Map();
  const rows = await db
    .select({ id: schema.learningTargets.id, code: schema.learningTargets.code })
    .from(schema.learningTargets)
    .where(eq(schema.learningTargets.courseId, courseId));
  return new Map(rows.map((r) => [r.code.toLowerCase(), r.id]));
}

const copySchema = z.object({
  courseId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

/**
 * "Copy to my banks": a new bank I own with every live question, its options,
 * and its target tags remapped by code onto my chosen course. Needs copy or
 * co_edit. The original is untouched.
 */
export const copyBankToMine = withAuthz(async (bankId: string, formData: FormData) => {
  const access = await requireShared({ type: "question_bank", id: bankId }, "copy");
  const parsed = copySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400);
  const courseId = parsed.data.courseId;
  if (courseId && !(await ownsCourse(access.userId, courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const src = await db.query.questionBanks.findFirst({
    where: eq(schema.questionBanks.id, bankId),
  });
  if (!src) throw new ActionError("Not found.", 404);
  const owner = await db.query.users.findFirst({
    columns: { lastName: true },
    where: eq(schema.users.id, src.ownerId),
  });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({
      ownerId: access.userId,
      courseId,
      name:
        access.access === "owner"
          ? `${src.name} (copy)`
          : `${src.name} (from ${owner?.lastName ?? "colleague"})`,
      description: src.description,
    })
    .returning({ id: schema.questionBanks.id });
  const codeMap = await targetsByCode(courseId);
  const questions = await db.query.questions.findMany({
    where: and(eq(schema.questions.bankId, bankId), eq(schema.questions.isArchived, false)),
    orderBy: (q, { asc: a }) => [a(q.createdAt)],
  });
  const ids = questions.map((q) => q.id);
  const options = ids.length
    ? await db
        .select()
        .from(schema.questionOptions)
        .where(inArray(schema.questionOptions.questionId, ids))
        .orderBy(asc(schema.questionOptions.sortOrder))
    : [];
  const targets = ids.length
    ? await db
        .select({
          questionId: schema.questionTargets.questionId,
          code: schema.learningTargets.code,
        })
        .from(schema.questionTargets)
        .innerJoin(
          schema.learningTargets,
          eq(schema.questionTargets.learningTargetId, schema.learningTargets.id)
        )
        .where(inArray(schema.questionTargets.questionId, ids))
    : [];
  let copied = 0;
  let retagged = 0;
  for (const q of questions) {
    const { id: oldId, createdAt: _c, updatedAt: _u, previousVersionId: _p, ...rest } = q;
    const [nq] = await db
      .insert(schema.questions)
      .values({
        ...rest,
        bankId: bank.id,
        ownerId: access.userId,
        // Course-scoped links don't cross courses: units and shared stimuli stay behind.
        unitId: null,
        stimulusId: null,
        version: 1,
        previousVersionId: null,
      })
      .returning({ id: schema.questions.id });
    const opts = options.filter((o) => o.questionId === oldId);
    if (opts.length)
      await db
        .insert(schema.questionOptions)
        .values(
          opts.map(({ id: _i, createdAt: _cc, updatedAt: _uu, ...o }) => ({
            ...o,
            questionId: nq.id,
          }))
        );
    const tids = [
      ...new Set(
        targets
          .filter((t) => t.questionId === oldId)
          .map((t) => codeMap.get(t.code.toLowerCase()))
          .filter((x): x is string => !!x)
      ),
    ];
    if (tids.length) {
      await db
        .insert(schema.questionTargets)
        .values(tids.map((learningTargetId) => ({ questionId: nq.id, learningTargetId })));
      retagged++;
    }
    copied++;
  }
  if (courseId) await rememberCourse(courseId);
  revalidatePath("/app/banks");
  revalidatePath("/app/shared");
  return { bankId: bank.id, copied, retagged };
});

/**
 * "Copy to my assessments": a draft I own on my chosen course, with sections
 * remapped to my targets by code and the items pointing at the same questions
 * and pools. Needs copy or co_edit.
 */
export const copyAssessmentToMine = withAuthz(async (assessmentId: string, formData: FormData) => {
  const access = await requireShared({ type: "assessment", id: assessmentId }, "copy");
  const parsed = copySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400);
  const courseId = parsed.data.courseId;
  if (courseId && !(await ownsCourse(access.userId, courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const src = await db.query.assessments.findFirst({
    where: eq(schema.assessments.id, assessmentId),
  });
  if (!src) throw new ActionError("Not found.", 404);
  const owner = await db.query.users.findFirst({
    columns: { lastName: true },
    where: eq(schema.users.id, src.ownerId),
  });
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  const [copy] = await db
    .insert(schema.assessments)
    .values({
      ...rest,
      ownerId: access.userId,
      courseId,
      title:
        access.access === "owner"
          ? `${src.title} (copy)`
          : `${src.title} (from ${owner?.lastName ?? "colleague"})`,
      isPublished: false,
    })
    .returning({ id: schema.assessments.id });
  const codeMap = await targetsByCode(courseId);
  const sections = await db
    .select({
      id: schema.assessmentSections.id,
      title: schema.assessmentSections.title,
      instructions: schema.assessmentSections.instructions,
      sortOrder: schema.assessmentSections.sortOrder,
      targetCode: schema.learningTargets.code,
    })
    .from(schema.assessmentSections)
    .leftJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(eq(schema.assessmentSections.assessmentId, assessmentId))
    .orderBy(asc(schema.assessmentSections.sortOrder));
  let remapped = 0;
  for (const s of sections) {
    const learningTargetId = s.targetCode
      ? (codeMap.get(s.targetCode.toLowerCase()) ?? null)
      : null;
    if (learningTargetId) remapped++;
    const [ns] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId: copy.id,
        title: s.title,
        instructions: s.instructions,
        sortOrder: s.sortOrder,
        learningTargetId,
      })
      .returning({ id: schema.assessmentSections.id });
    const items = await db.query.assessmentQuestions.findMany({
      where: eq(schema.assessmentQuestions.sectionId, s.id),
    });
    if (items.length)
      await db
        .insert(schema.assessmentQuestions)
        .values(
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
  if (courseId) await rememberCourse(courseId);
  revalidatePath("/app/assessments");
  revalidatePath("/app/shared");
  return { assessmentId: copy.id, sections: sections.length, remapped };
});

/** The current teacher's courses, for the copy dialogs. Read-only but guarded. */
export const listMyCourses = withAuthz(async () => {
  const session = await requireTeacher();
  return db
    .select({ id: schema.courses.id, name: schema.courses.name })
    .from(schema.courses)
    .where(eq(schema.courses.ownerId, session.userId))
    .orderBy(asc(schema.courses.name));
});
