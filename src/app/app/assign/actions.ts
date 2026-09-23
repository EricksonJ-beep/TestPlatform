"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { defaultAttempts, parseLocalDateTime } from "@/lib/assignments";
import { ActionError, requireOwner, requireShared, requireTeacher, withAuthz } from "@/lib/authz";

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
const optInt = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), msg);

function revalidate() {
  revalidatePath("/app/assign");
  revalidatePath("/app");
  revalidatePath("/student");
}

const settingsSchema = z.object({
  opensAt: z.string().optional().default(""),
  closesAt: z.string().optional().default(""),
  tzOffset: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 0)),
  accessCode: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().toUpperCase())
    .refine(
      (v) => v === "" || /^[A-Z0-9-]{3,12}$/.test(v),
      "Codes are 3–12 letters, digits, or dashes."
    )
    .transform((v) => v || null),
  timeLimitMinutes: optInt(1, 600, "Time limit is 1–600 minutes."),
  attemptsAllowed: optInt(1, 50, "Attempts are 1–50, or blank for unlimited."),
  reviewMode: z.enum(["auto", "teacher_approved"]),
  retakeThreshold: z
    .string()
    .transform(Number)
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 100, "Threshold is 0–100."),
  optionalRetakes: bool,
  tier2Max: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 2))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 20, "Tier 2 max is 1–20."),
  resultsReleased: bool,
  retakeWaitHours: optInt(0, 24 * 30, "Wait is 0–720 hours."),
});

function parseWindow(d: z.infer<typeof settingsSchema>) {
  const opensAt = d.opensAt ? parseLocalDateTime(d.opensAt, d.tzOffset) : null;
  const closesAt = d.closesAt ? parseLocalDateTime(d.closesAt, d.tzOffset) : null;
  const errors: Record<string, string[]> = {};
  if (d.opensAt && !opensAt) errors.opensAt = ["Couldn't read that date."];
  if (d.closesAt && !closesAt) errors.closesAt = ["Couldn't read that date."];
  if (opensAt && closesAt && closesAt <= opensAt) errors.closesAt = ["Close must be after open."];
  if (Object.keys(errors).length) throw new ActionError("Check the window.", 400, errors);
  return { opensAt, closesAt };
}

function settingsFrom(d: z.infer<typeof settingsSchema>) {
  const { opensAt, closesAt } = parseWindow(d);
  return {
    opensAt,
    closesAt,
    accessCode: d.accessCode,
    timeLimitMinutes: d.timeLimitMinutes,
    attemptsAllowed: d.attemptsAllowed,
    reviewMode: d.reviewMode,
    retakeThreshold: d.retakeThreshold,
    optionalRetakes: d.optionalRetakes,
    tier2Max: d.tier2Max,
    resultsReleased: d.resultsReleased,
    retakeWaitHours: d.retakeWaitHours ?? 0,
  };
}

const createSchema = settingsSchema.extend({
  assessmentId: z.string().uuid("Pick an assessment."),
  useTypeDefault: bool,
});

/**
 * Assign one assessment to one or more classes. Rule: the caller owns every class
 * and owns (or has a copy/co_edit share on) the assessment, which must be published.
 */
export const createAssignments = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const classIds = Array.from(new Set(formData.getAll("classIds").map(String).filter(Boolean)));
  const parsed = createSchema.safeParse(
    Object.fromEntries([...formData.entries()].filter(([k]) => k !== "classIds"))
  );
  if (!parsed.success) throw invalid(parsed.error);
  if (classIds.length === 0)
    throw new ActionError("Pick at least one class.", 400, {
      classIds: ["Pick at least one class."],
    });
  await requireShared({ type: "assessment", id: parsed.data.assessmentId }, "copy");
  const assessment = await db.query.assessments.findFirst({
    columns: { id: true, type: true, isPublished: true },
    where: eq(schema.assessments.id, parsed.data.assessmentId),
  });
  if (!assessment) throw new ActionError("Not found.", 404);
  if (!assessment.isPublished)
    throw new ActionError("Publish the assessment before assigning it.", 400);
  for (const classId of classIds) await requireOwner({ type: "class", id: classId });

  const settings = settingsFrom(parsed.data);
  if (parsed.data.useTypeDefault) settings.attemptsAllowed = defaultAttempts(assessment.type);
  const rows = await db
    .insert(schema.assignments)
    .values(
      classIds.map((classId) => ({
        ownerId: session.userId,
        assessmentId: assessment.id,
        classId,
        ...settings,
      }))
    )
    .returning({ id: schema.assignments.id });
  revalidate();
  return { assignmentIds: rows.map((r) => r.id) };
});

export const updateAssignment = withAuthz(async (assignmentId: string, formData: FormData) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  await db
    .update(schema.assignments)
    .set(settingsFrom(parsed.data))
    .where(eq(schema.assignments.id, assignmentId));
  revalidate();
  return { ok: true };
});

/** Quick action: close the window right now (students mid-attempt keep their attempt deadline). */
export const closeAssignmentNow = withAuthz(async (assignmentId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  await db
    .update(schema.assignments)
    .set({ closesAt: new Date() })
    .where(eq(schema.assignments.id, assignmentId));
  revalidate();
  return { ok: true };
});

/** Quick action: push the close later by N minutes (from now if it has already closed). */
export const extendAssignment = withAuthz(async (assignmentId: string, minutes: number) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60 * 24 * 30)
    throw new ActionError("Extend by 1 minute to 30 days.", 400);
  const a = await db.query.assignments.findFirst({
    columns: { closesAt: true },
    where: eq(schema.assignments.id, assignmentId),
  });
  if (!a) throw new ActionError("Not found.", 404);
  const now = new Date();
  const base = a.closesAt && a.closesAt > now ? a.closesAt : now;
  await db
    .update(schema.assignments)
    .set({ closesAt: new Date(base.getTime() + minutes * 60_000) })
    .where(eq(schema.assignments.id, assignmentId));
  revalidate();
  return { ok: true };
});

/** Rule: an assignment with attempts is closed, never deleted, so student work survives. */
export const deleteAssignment = withAuthz(async (assignmentId: string) => {
  await requireOwner({ type: "assignment", id: assignmentId });
  const n = await db.$count(schema.attempts, eq(schema.attempts.assignmentId, assignmentId));
  if (n > 0)
    throw new ActionError("Students have started this; close it instead of deleting.", 409);
  await db.delete(schema.assignments).where(eq(schema.assignments.id, assignmentId));
  revalidate();
  return { ok: true };
});
