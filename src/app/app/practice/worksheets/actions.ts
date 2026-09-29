"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireOwner, requireTeacher, withAuthz } from "@/lib/authz";
import { ownsCourse, rememberCourse } from "@/lib/current-course";
import {
  parseWorksheetRef,
  pendingScriptId,
  normalizeStudentUrl,
  reprocessEmail,
  reprocessWorksheet,
  syncLinkedContent,
} from "@/lib/worksheets";

const uuid = z.string().uuid();
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues)
    (out[String(issue.path[0] ?? "form")] ??= []).push(issue.message);
  return out;
}
const invalid = (e: z.ZodError) => new ActionError("Check the form.", 400, fieldErrors(e));

function revalidate(worksheetId?: string) {
  revalidatePath("/app/practice");
  revalidatePath("/app/practice/worksheets");
  if (worksheetId) revalidatePath(`/app/practice/worksheets/${worksheetId}`);
  revalidatePath("/app");
  revalidatePath("/student");
}

function targetIdsFrom(formData: FormData): string[] {
  const ids = Array.from(new Set(formData.getAll("targetIds").map(String).filter(Boolean)));
  if (ids.some((id) => !uuid.safeParse(id).success)) throw new ActionError("Bad target.", 400);
  return ids;
}
async function assertTargetsOnCourse(courseId: string, targetIds: string[]) {
  if (targetIds.length === 0) return;
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
    throw new ActionError("Every target must be on the worksheet's course.", 400);
}
/** Section → target entries arrive as `map:<section title>` = target id ("" clears). */
function sectionMapFrom(formData: FormData, targetIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("map:")) continue;
    const section = k.slice(4).trim();
    const target = String(v);
    if (!section || !target) continue;
    if (!targetIds.includes(target))
      throw new ActionError("Map sections to targets the worksheet is tagged with.", 400);
    map[section] = target;
  }
  return map;
}

const registerSchema = z.object({
  ref: z.string().trim().min(1, "Paste the student link or the script id."),
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  courseId: uuid,
  countsAs: z.enum(["practice", "activity", "both"]),
});

/**
 * Register a worksheet (PLAN.md §3.7a): by student link or script id, choose
 * what it counts as, tag targets. Claims an unregistered entry a webhook
 * created, or creates one; then any submissions already received are applied.
 */
export const registerWorksheet = withAuthz(async (formData: FormData) => {
  const session = await requireTeacher();
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const ref = parseWorksheetRef(parsed.data.ref);
  if (!ref)
    throw new ActionError("Check the form.", 400, {
      ref: ["That isn't a student link (…/exec), an editor link, or a script id."],
    });
  if (!(await ownsCourse(session.userId, parsed.data.courseId)))
    throw new ActionError("That course isn't yours.", 403);
  const targetIds = targetIdsFrom(formData);
  if (targetIds.length === 0)
    throw new ActionError("Check the form.", 400, { targetIds: ["Tag at least one target."] });
  await assertTargetsOnCourse(parsed.data.courseId, targetIds);

  const scriptId = ref.scriptId ?? pendingScriptId(ref.studentUrl!);
  let existing = await db.query.worksheets.findFirst({
    where: eq(schema.worksheets.scriptId, scriptId),
  });
  if (!existing && ref.studentUrl) {
    existing = await db.query.worksheets.findFirst({
      where: eq(schema.worksheets.studentUrl, ref.studentUrl),
    });
  }
  if (existing?.ownerId && existing.ownerId !== session.userId)
    throw new ActionError("Another teacher already registered that worksheet.", 403);
  const values = {
    ownerId: session.userId,
    courseId: parsed.data.courseId,
    countsAs: parsed.data.countsAs,
    registered: true,
    title: parsed.data.title ?? existing?.title ?? null,
    studentUrl: ref.studentUrl ?? existing?.studentUrl ?? null,
  };
  let worksheetId: string;
  if (existing) {
    await db.update(schema.worksheets).set(values).where(eq(schema.worksheets.id, existing.id));
    worksheetId = existing.id;
  } else {
    const [row] = await db
      .insert(schema.worksheets)
      .values({ scriptId, ...values })
      .returning({ id: schema.worksheets.id });
    worksheetId = row.id;
  }
  await syncLinkedContent(worksheetId, targetIds);
  const result = await reprocessWorksheet(worksheetId);
  await rememberCourse(parsed.data.courseId);
  revalidate(worksheetId);
  return { worksheetId, ...result };
});

const updateSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(200),
  studentUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? normalizeStudentUrl(v) : null))
    .refine((v) => v === null || /^https?:\/\//i.test(v), "Use a full http(s) link."),
  countsAs: z.enum(["practice", "activity", "both"]),
});

export const updateWorksheet = withAuthz(async (worksheetId: string, formData: FormData) => {
  await requireOwner({ type: "worksheet", id: worksheetId });
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error);
  const ws = await db.query.worksheets.findFirst({ where: eq(schema.worksheets.id, worksheetId) });
  if (!ws || !ws.courseId) throw new ActionError("Not found.", 404);
  const targetIds = targetIdsFrom(formData);
  if (targetIds.length === 0)
    throw new ActionError("Check the form.", 400, { targetIds: ["Tag at least one target."] });
  await assertTargetsOnCourse(ws.courseId, targetIds);
  const sectionTargetMap = sectionMapFrom(formData, targetIds);
  await db
    .update(schema.worksheets)
    .set({ ...parsed.data, sectionTargetMap, registered: true })
    .where(eq(schema.worksheets.id, worksheetId));
  await syncLinkedContent(worksheetId, targetIds);
  const result = await reprocessWorksheet(worksheetId);
  revalidate(worksheetId);
  return result;
});

/** Removes the worksheet, its events, and the linked practice set / activity (their completions with them). */
export const deleteWorksheet = withAuthz(async (worksheetId: string) => {
  await requireOwner({ type: "worksheet", id: worksheetId });
  await db.delete(schema.practiceSets).where(eq(schema.practiceSets.worksheetId, worksheetId));
  await db
    .delete(schema.relearningActivities)
    .where(eq(schema.relearningActivities.worksheetId, worksheetId));
  await db.delete(schema.worksheets).where(eq(schema.worksheets.id, worksheetId));
  revalidate();
  return { ok: true };
});

/** Re-run email matching and apply every submit (after a student joins with their email, say). */
export const rerunMatching = withAuthz(async (worksheetId: string) => {
  await requireOwner({ type: "worksheet", id: worksheetId });
  const result = await reprocessWorksheet(worksheetId);
  revalidate(worksheetId);
  return result;
});

/**
 * Give a student in one of the teacher's classes the Cadott email a worksheet
 * reported, so past and future submissions match them. Rule: only a student
 * with no email yet, and only an email no other account uses.
 */
export const linkEmailToStudent = withAuthz(async (email: string, studentId: string) => {
  const session = await requireTeacher();
  const lower = z.string().trim().toLowerCase().email().safeParse(email);
  if (!lower.success || !uuid.safeParse(studentId).success)
    throw new ActionError("Bad email or student.", 400);
  const [enrolled] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.enrollments)
    .innerJoin(schema.classes, eq(schema.enrollments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
    .where(
      and(
        eq(schema.classes.ownerId, session.userId),
        eq(schema.users.id, studentId),
        eq(schema.users.role, "student")
      )
    )
    .limit(1);
  if (!enrolled) throw new ActionError("That student isn't in one of your classes.", 404);
  if (enrolled.email && enrolled.email.toLowerCase() !== lower.data)
    throw new ActionError(
      `That student already logs in as ${enrolled.email}; the worksheet used ${lower.data}.`,
      409
    );
  if (!enrolled.email) {
    const taken = await db.query.users.findFirst({
      columns: { id: true },
      where: and(sql`lower(${schema.users.email}) = ${lower.data}`, ne(schema.users.id, studentId)),
    });
    if (taken) throw new ActionError("Another account already uses that email.", 409);
    await db.update(schema.users).set({ email: lower.data }).where(eq(schema.users.id, studentId));
  }
  const result = await reprocessEmail(lower.data);
  revalidate();
  return result;
});
