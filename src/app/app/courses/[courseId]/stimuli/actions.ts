"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireOwner, withAuthz } from "@/lib/authz";

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

const stimulusSchema = z
  .object({
    kind: z.enum(["text", "image", "video", "audio"]),
    title: z
      .string()
      .trim()
      .max(160)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => v || null),
    ref: z
      .string()
      .trim()
      .max(60)
      .regex(/^[A-Za-z0-9._-]*$/, "Use letters, numbers, dots, dashes, or underscores.")
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => v || null),
    content: z
      .string()
      .trim()
      .max(20000)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => v || null),
    mediaUrl,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "text" && !v.content)
      ctx.addIssue({ code: "custom", path: ["content"], message: "Write the passage." });
    if (v.kind !== "text" && !v.mediaUrl)
      ctx.addIssue({ code: "custom", path: ["mediaUrl"], message: `Add the ${v.kind}.` });
    if (!v.title && !v.ref)
      ctx.addIssue({ code: "custom", path: ["title"], message: "Give it a title (or a CSV ref)." });
  });

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues)
    (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}

function fromForm(fd: FormData) {
  return {
    kind: fd.get("kind"),
    title: fd.get("title"),
    ref: fd.get("ref"),
    content: fd.get("content"),
    mediaUrl: fd.get("mediaUrl"),
  };
}

function revalidate(courseId: string) {
  revalidatePath(`/app/courses/${courseId}/stimuli`);
  revalidatePath(`/app/courses/${courseId}`);
  revalidatePath("/app/banks");
}

// Rule: a CSV ref is unique within a course (case-insensitive) so imports can match it.
async function assertUniqueRef(courseId: string, ref: string | null, exceptId?: string) {
  if (!ref) return;
  const clash = await db.query.stimuli.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.stimuli.courseId, courseId),
      sql`lower(${schema.stimuli.ref}) = ${ref.toLowerCase()}`
    ),
  });
  if (clash && clash.id !== exceptId) {
    throw new ActionError(`Ref "${ref}" is already used in this course.`, 409, {
      ref: [`Ref "${ref}" is already used in this course.`],
    });
  }
}

async function assertInCourse(courseId: string, stimulusId: string) {
  const row = await db.query.stimuli.findFirst({
    columns: { id: true },
    where: and(eq(schema.stimuli.id, stimulusId), eq(schema.stimuli.courseId, courseId)),
  });
  if (!row) throw new ActionError("That stimulus isn't in this course.", 404);
}

/** Create a stimulus on a course you own. */
export const createStimulus = withAuthz(async (courseId: string, formData: FormData) => {
  const session = await requireOwner({ type: "course", id: courseId });
  const parsed = stimulusSchema.safeParse(fromForm(formData));
  if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
  await assertUniqueRef(courseId, parsed.data.ref);
  const media = parsed.data.mediaUrl
    ? await db.query.mediaAssets.findFirst({
        columns: { id: true },
        where: eq(schema.mediaAssets.url, parsed.data.mediaUrl),
      })
    : null;
  const [row] = await db
    .insert(schema.stimuli)
    .values({ ...parsed.data, ownerId: session.userId, courseId, mediaAssetId: media?.id ?? null })
    .returning({ id: schema.stimuli.id });
  revalidate(courseId);
  return { stimulusId: row.id };
});

export const updateStimulus = withAuthz(
  async (courseId: string, stimulusId: string, formData: FormData) => {
    await requireOwner({ type: "course", id: courseId });
    await assertInCourse(courseId, stimulusId);
    const parsed = stimulusSchema.safeParse(fromForm(formData));
    if (!parsed.success) throw new ActionError("Check the form.", 400, fieldErrors(parsed.error));
    await assertUniqueRef(courseId, parsed.data.ref, stimulusId);
    const media = parsed.data.mediaUrl
      ? await db.query.mediaAssets.findFirst({
          columns: { id: true },
          where: eq(schema.mediaAssets.url, parsed.data.mediaUrl),
        })
      : null;
    await db
      .update(schema.stimuli)
      .set({ ...parsed.data, mediaAssetId: media?.id ?? null })
      .where(eq(schema.stimuli.id, stimulusId));
    revalidate(courseId);
    return { ok: true };
  }
);

/** Refuse to delete a stimulus that live questions still use; detach them first. */
export const deleteStimulus = withAuthz(async (courseId: string, stimulusId: string) => {
  await requireOwner({ type: "course", id: courseId });
  await assertInCourse(courseId, stimulusId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.questions)
    .where(
      and(eq(schema.questions.stimulusId, stimulusId), eq(schema.questions.isArchived, false))
    );
  if (n > 0)
    throw new ActionError(`${n} question(s) still use this stimulus. Detach them first.`, 409);
  await db.delete(schema.stimuli).where(eq(schema.stimuli.id, stimulusId));
  revalidate(courseId);
  return { ok: true };
});
