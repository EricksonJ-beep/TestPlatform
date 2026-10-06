/**
 * Content packs (Jon, Oct 2 2026): a quiz shipped in the repo under
 * content/packs/<name>/ (pack.json + questions.csv, pictures under
 * public/quiz-images/<name>/) that Bloom applies itself on deploy, right after
 * migrations. Each pack applies once: its name is recorded in content_packs.
 *
 * Applying a pack: find the teacher by email and their course by name, create
 * the bank if missing, import the CSV through the same importer the Import page
 * uses, build a published assessment from the imported questions in CSV order,
 * and assign it to the named classes with the given attempt policy.
 *
 * A pack can also ship a relearning activity (Jon, Oct 6 2026: "you can just do
 * the adding for me"): `activity` names an interactive page Bloom hosts under
 * public/activities/ (or a video / link), the learning targets it satisfies by
 * code, and whether it is published. Such a pack needs no bank or CSV.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCsvRecords } from "@/lib/csv";
import { parseQuestionRecords } from "@/lib/import/question-csv";
import { commitImport } from "@/lib/import/question-import";

export type PackDefinition = {
  name: string;
  teacherEmail: string;
  course: string;
  /** The bank the CSV imports into; absent for an activity-only pack. */
  bank?: string;
  /** Earlier names this pack's bank went by; a bank still using one is renamed to `bank` on deploy. */
  formerBankNames?: string[];
  assessment?: {
    title: string;
    /** Earlier titles; an assessment still using one is renamed to `title` on deploy. */
    formerTitles?: string[];
    type: "practice" | "formative" | "summative";
    instructions?: string;
  };
  assign?: {
    class: string;
    attemptsAllowed?: number | null;
    retakeWaitHours?: number;
    retakesNeedUnlock?: boolean;
  }[];
  /** A relearning activity to create for the teacher in this course. */
  activity?: {
    /** Defaults to "interactive": a page under public/activities/ or a full https link. */
    kind?: "interactive" | "video" | "link";
    title: string;
    url: string;
    /** Shown to students before they start (the editor's "Instructions for students"). */
    instructions?: string;
    /** Learning-target codes in this course, e.g. ["U2"]; unknown codes are reported, not created. */
    targets: string[];
    /** Default true; a published activity shows in the student Practice tab. */
    published?: boolean;
  };
};

export type PackOutcome =
  | { name: string; status: "applied"; summary: Record<string, unknown> }
  | { name: string; status: "already_applied"; renamed: string[] }
  | { name: string; status: "skipped"; reason: string };

const key = (s: string) => s.trim().toLowerCase();

/** Every pack folder under content/packs, in name order. */
export function listPacks(root = join(process.cwd(), "content", "packs")): PackDefinition[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "pack.json")))
    .map((d) => {
      const def = JSON.parse(
        readFileSync(join(root, d.name, "pack.json"), "utf8")
      ) as PackDefinition;
      return { ...def, name: def.name || d.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The pack file is the source of truth for names. If the teacher's bank (or
 * assessment) still carries one of the former names listed in the pack, rename
 * it to the current one. Runs on every deploy, applied pack or not, and does
 * nothing once the names match (or if the teacher already has one by the new name).
 */
async function syncNames(def: PackDefinition, teacherId: string): Promise<string[]> {
  const renamed: string[] = [];
  const bankName = def.bank;
  const former = (def.formerBankNames ?? []).map(key).filter((n) => n !== key(bankName ?? ""));
  if (bankName && former.length) {
    const current = await db.query.questionBanks.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.questionBanks.ownerId, teacherId),
        sql`lower(${schema.questionBanks.name}) = ${key(bankName)}`
      ),
    });
    const old = current
      ? null
      : await db.query.questionBanks.findFirst({
          columns: { id: true, name: true },
          where: and(
            eq(schema.questionBanks.ownerId, teacherId),
            sql`lower(${schema.questionBanks.name}) in ${former}`
          ),
        });
    if (old) {
      await db
        .update(schema.questionBanks)
        .set({ name: bankName })
        .where(eq(schema.questionBanks.id, old.id));
      renamed.push(`bank "${old.name}" → "${bankName}"`);
    }
  }
  const a = def.assessment;
  const formerTitles = (a?.formerTitles ?? []).map(key).filter((t) => a && t !== key(a.title));
  if (a && formerTitles.length) {
    const current = await db.query.assessments.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.assessments.ownerId, teacherId),
        sql`lower(${schema.assessments.title}) = ${key(a.title)}`
      ),
    });
    const old = current
      ? null
      : await db.query.assessments.findFirst({
          columns: { id: true, title: true },
          where: and(
            eq(schema.assessments.ownerId, teacherId),
            sql`lower(${schema.assessments.title}) in ${formerTitles}`
          ),
        });
    if (old) {
      await db
        .update(schema.assessments)
        .set({ title: a.title })
        .where(eq(schema.assessments.id, old.id));
      renamed.push(`assessment "${old.title}" → "${a.title}"`);
    }
  }
  return renamed;
}

export async function applyPack(
  def: PackDefinition,
  root = join(process.cwd(), "content", "packs")
): Promise<PackOutcome> {
  const teacher = await db.query.users.findFirst({
    columns: { id: true },
    where: sql`lower(${schema.users.email}) = ${key(def.teacherEmail)}`,
  });
  if (!teacher)
    return { name: def.name, status: "skipped", reason: `no teacher ${def.teacherEmail}` };

  const renamed = await syncNames(def, teacher.id);
  const done = await db.query.contentPacks.findFirst({
    where: eq(schema.contentPacks.name, def.name),
  });
  if (done) return { name: def.name, status: "already_applied", renamed };
  const course = await db.query.courses.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(schema.courses.ownerId, teacher.id),
      sql`lower(${schema.courses.name}) = ${key(def.course)}`
    ),
  });
  if (!course) return { name: def.name, status: "skipped", reason: `no course "${def.course}"` };

  const summary: Record<string, unknown> = {};
  const errors: string[] = [];
  if (def.bank)
    Object.assign(summary, await applyQuiz(def, def.bank, teacher.id, course.id, root, errors));
  if (def.activity)
    summary.activity = await applyActivity(def.activity, teacher.id, course.id, errors);
  summary.errors = errors;
  await db.insert(schema.contentPacks).values({ name: def.name, summary });
  return { name: def.name, status: "applied", summary };
}

/** The quiz half of a pack: bank, CSV import, published assessment, assignments. */
async function applyQuiz(
  def: PackDefinition,
  bankName: string,
  teacherId: string,
  courseId: string,
  root: string,
  errors: string[]
): Promise<Record<string, unknown>> {
  let bank = await db.query.questionBanks.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.questionBanks.ownerId, teacherId),
      sql`lower(${schema.questionBanks.name}) = ${key(bankName)}`
    ),
  });
  if (!bank) {
    [bank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: teacherId, courseId, name: bankName })
      .returning({ id: schema.questionBanks.id });
  }

  const csvText = readFileSync(join(root, def.name, "questions.csv"), "utf8");
  const { records } = parseCsvRecords(csvText);
  const rows = parseQuestionRecords(records);
  const result = await commitImport(bank.id, rows);
  const questionIds = result.rows.flatMap((r) => (r.questionId ? [r.questionId] : []));
  errors.push(...result.rows.filter((r) => r.error).map((r) => `line ${r.line}: ${r.error}`));

  let assessmentId: string | null = null;
  const assignments: string[] = [];
  if (def.assessment && questionIds.length) {
    const existing = await db.query.assessments.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.assessments.ownerId, teacherId),
        sql`lower(${schema.assessments.title}) = ${key(def.assessment.title)}`
      ),
    });
    if (existing) assessmentId = existing.id;
    else {
      const [a] = await db
        .insert(schema.assessments)
        .values({
          ownerId: teacherId,
          courseId,
          type: def.assessment.type,
          title: def.assessment.title,
          instructions: def.assessment.instructions ?? null,
          attemptLimit: def.assessment.type === "formative" ? 3 : null,
          isPublished: true,
        })
        .returning({ id: schema.assessments.id });
      assessmentId = a.id;
      const [sec] = await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: "Questions", sortOrder: 0 })
        .returning({ id: schema.assessmentSections.id });
      await db
        .insert(schema.assessmentQuestions)
        .values(
          questionIds.map((questionId, i) => ({ sectionId: sec.id, questionId, sortOrder: i }))
        );
    }
    for (const target of def.assign ?? []) {
      const cls = await db.query.classes.findFirst({
        columns: { id: true, name: true },
        where: and(
          eq(schema.classes.ownerId, teacherId),
          sql`lower(${schema.classes.name}) = ${key(target.class)}`
        ),
      });
      if (!cls) {
        errors.push(`class "${target.class}" not found; not assigned`);
        continue;
      }
      const already = await db.query.assignments.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.assignments.assessmentId, assessmentId),
          eq(schema.assignments.classId, cls.id)
        ),
      });
      if (already) continue;
      await db.insert(schema.assignments).values({
        ownerId: teacherId,
        assessmentId,
        classId: cls.id,
        attemptsAllowed: target.attemptsAllowed === undefined ? 3 : target.attemptsAllowed,
        retakeWaitHours: target.retakeWaitHours ?? 0,
        retakesNeedUnlock: target.retakesNeedUnlock ?? false,
      });
      assignments.push(cls.name);
    }
  }

  return {
    bankId: bank.id,
    imported: result.counts,
    questions: questionIds.length,
    assessmentId,
    assignedTo: assignments,
  };
}

/**
 * The activity half of a pack. Reuses the teacher's activity in this course
 * that already carries the title or (for a page) the same address, so a draft
 * made by hand is completed rather than duplicated; otherwise creates it. Tags
 * every listed target code that exists in the course and publishes when asked.
 */
async function applyActivity(
  act: NonNullable<PackDefinition["activity"]>,
  teacherId: string,
  courseId: string,
  errors: string[]
): Promise<Record<string, unknown>> {
  const kind = act.kind ?? "interactive";
  const published = act.published ?? true;
  const targets = await db.query.learningTargets.findMany({
    columns: { id: true, code: true },
    where: eq(schema.learningTargets.courseId, courseId),
  });
  const wanted = act.targets.map(key);
  const targetIds = targets.filter((t) => wanted.includes(key(t.code))).map((t) => t.id);
  for (const code of act.targets)
    if (!targets.some((t) => key(t.code) === key(code)))
      errors.push(`learning target "${code}" not found in the course; not tagged`);
  if (published && !targetIds.length) {
    errors.push("no learning target matched, so the activity stays a draft");
  }
  const canPublish = published && targetIds.length > 0;

  const existing = await db.query.relearningActivities.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.relearningActivities.ownerId, teacherId),
      eq(schema.relearningActivities.courseId, courseId),
      or(
        sql`lower(${schema.relearningActivities.title}) = ${key(act.title)}`,
        and(
          eq(schema.relearningActivities.kind, kind),
          eq(schema.relearningActivities.url, act.url)
        )
      )
    ),
  });
  let activityId: string;
  if (existing) {
    activityId = existing.id;
    await db
      .update(schema.relearningActivities)
      .set({
        title: act.title,
        kind,
        url: act.url,
        content: act.instructions ?? null,
        ...(canPublish ? { isPublished: true } : {}),
      })
      .where(eq(schema.relearningActivities.id, activityId));
  } else {
    const [a] = await db
      .insert(schema.relearningActivities)
      .values({
        ownerId: teacherId,
        courseId,
        kind,
        title: act.title,
        url: act.url,
        content: act.instructions ?? null,
        isPublished: canPublish,
      })
      .returning({ id: schema.relearningActivities.id });
    activityId = a.id;
  }
  if (targetIds.length)
    await db
      .insert(schema.activityTargets)
      .values(targetIds.map((learningTargetId) => ({ activityId, learningTargetId })))
      .onConflictDoNothing();
  return {
    activityId,
    reused: Boolean(existing),
    targets: targetIds.length,
    published: canPublish,
  };
}

/** Apply every pack that has not been applied yet; never throws for one bad pack. */
export async function applyAllPacks(root?: string): Promise<PackOutcome[]> {
  const out: PackOutcome[] = [];
  for (const def of listPacks(root)) {
    try {
      out.push(await applyPack(def, root));
    } catch (err) {
      out.push({
        name: def.name,
        status: "skipped",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
