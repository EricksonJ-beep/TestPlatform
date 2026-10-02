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
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCsvRecords } from "@/lib/csv";
import { parseQuestionRecords } from "@/lib/import/question-csv";
import { commitImport } from "@/lib/import/question-import";

export type PackDefinition = {
  name: string;
  teacherEmail: string;
  course: string;
  bank: string;
  assessment?: {
    title: string;
    type: "practice" | "formative" | "summative";
    instructions?: string;
  };
  assign?: {
    class: string;
    attemptsAllowed?: number | null;
    retakeWaitHours?: number;
    retakesNeedUnlock?: boolean;
  }[];
};

export type PackOutcome =
  | { name: string; status: "applied"; summary: Record<string, unknown> }
  | { name: string; status: "already_applied" }
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

export async function applyPack(
  def: PackDefinition,
  root = join(process.cwd(), "content", "packs")
): Promise<PackOutcome> {
  const done = await db.query.contentPacks.findFirst({
    where: eq(schema.contentPacks.name, def.name),
  });
  if (done) return { name: def.name, status: "already_applied" };

  const teacher = await db.query.users.findFirst({
    columns: { id: true },
    where: sql`lower(${schema.users.email}) = ${key(def.teacherEmail)}`,
  });
  if (!teacher)
    return { name: def.name, status: "skipped", reason: `no teacher ${def.teacherEmail}` };
  const course = await db.query.courses.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(schema.courses.ownerId, teacher.id),
      sql`lower(${schema.courses.name}) = ${key(def.course)}`
    ),
  });
  if (!course) return { name: def.name, status: "skipped", reason: `no course "${def.course}"` };

  let bank = await db.query.questionBanks.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.questionBanks.ownerId, teacher.id),
      sql`lower(${schema.questionBanks.name}) = ${key(def.bank)}`
    ),
  });
  if (!bank) {
    [bank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: teacher.id, courseId: course.id, name: def.bank })
      .returning({ id: schema.questionBanks.id });
  }

  const csvText = readFileSync(join(root, def.name, "questions.csv"), "utf8");
  const { records } = parseCsvRecords(csvText);
  const rows = parseQuestionRecords(records);
  const result = await commitImport(bank.id, rows);
  const questionIds = result.rows.flatMap((r) => (r.questionId ? [r.questionId] : []));
  const errors = result.rows.filter((r) => r.error).map((r) => `line ${r.line}: ${r.error}`);

  let assessmentId: string | null = null;
  const assignments: string[] = [];
  if (def.assessment && questionIds.length) {
    const existing = await db.query.assessments.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.assessments.ownerId, teacher.id),
        sql`lower(${schema.assessments.title}) = ${key(def.assessment.title)}`
      ),
    });
    if (existing) assessmentId = existing.id;
    else {
      const [a] = await db
        .insert(schema.assessments)
        .values({
          ownerId: teacher.id,
          courseId: course.id,
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
          eq(schema.classes.ownerId, teacher.id),
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
        ownerId: teacher.id,
        assessmentId,
        classId: cls.id,
        attemptsAllowed: target.attemptsAllowed === undefined ? 3 : target.attemptsAllowed,
        retakeWaitHours: target.retakeWaitHours ?? 0,
        retakesNeedUnlock: target.retakesNeedUnlock ?? false,
      });
      assignments.push(cls.name);
    }
  }

  const summary = {
    bankId: bank.id,
    imported: result.counts,
    questions: questionIds.length,
    assessmentId,
    assignedTo: assignments,
    errors,
  };
  await db.insert(schema.contentPacks).values({ name: def.name, summary });
  return { name: def.name, status: "applied", summary };
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
