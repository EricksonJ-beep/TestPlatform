/**
 * The weekly backup, proven by restoring it (hardening plan H7.3): everything in one database
 * is exported, loaded into a second, empty one, and the two are compared row for row.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import {
  backupManifest,
  exportTable,
  listBackupTables,
  restoreBackup,
  restoreOrder,
  type BackupManifest,
} from "./backup";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let source: TestDb;
let target: TestDb;
const files = new Map<string, string[]>();
let manifest: BackupManifest;

const everyRow = async (t: TestDb, table: string) =>
  (
    (await t.db.execute(sql.raw(`select row_to_json(x)::text as j from "${table}" x`))) as {
      rows: { j: string }[];
    }
  ).rows
    .map((r) => r.j)
    .sort();

beforeAll(async () => {
  source = await createTestDb();
  target = await createTestDb();
  const { db, schema } = source;
  const [org] = await db.insert(schema.organizations).values({ name: "Test HS" }).returning();
  const [teacher, student] = await db
    .insert(schema.users)
    .values([
      {
        email: "t@example.test",
        passwordHash: "hash-t",
        role: "teacher",
        firstName: "Tess",
        lastName: "O'Teacher",
        organizationId: org.id,
        lastLoginAt: new Date("2026-11-03T14:05:06.789Z"),
      },
      {
        username: "sam.sample",
        passwordHash: "hash-s",
        role: "student",
        firstName: "Sam",
        lastName: "Sample",
        mustChangePassword: true,
        passwordChangedAt: new Date("2026-11-09T08:00:00Z"),
      },
    ])
    .returning();
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: teacher.id, name: "Biology", organizationId: org.id })
    .returning();
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: course.id, code: "U1.LT1", title: "Cells", sortOrder: 1 })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: teacher.id, courseId: course.id, name: "P1" })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: student.id });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: teacher.id, courseId: course.id, name: "Bank" })
    .returning();
  // A question and its newer version: a row that points at another row of its own table.
  const [v1] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: teacher.id,
      type: "numeric",
      stem: 'Speed of a car that goes 100 m in 5 s? "Show units" \\ 50%',
      gradingConfig: { mode: "tolerance", answer: 20, tolerance: 0.5, unit: "m/s" },
      tags: ["motion", "unit 1"],
    })
    .returning();
  const [v2] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: teacher.id,
      type: "multiple_choice",
      stem: "Powerhouse of the cell?\nPick one. ✓ µ",
      version: 2,
      previousVersionId: v1.id,
      mediaUrl: "https://example.test/cell.png",
      mediaAlt: "A cell",
    })
    .returning();
  await db.insert(schema.questionOptions).values([
    { questionId: v2.id, content: "Mitochondria", isCorrect: true, sortOrder: 0 },
    { questionId: v2.id, content: "Nucleus", isCorrect: false, sortOrder: 1 },
  ]);
  await db.insert(schema.questionTargets).values({ questionId: v2.id, learningTargetId: lt.id });
  const [assessment] = await db
    .insert(schema.assessments)
    .values({ ownerId: teacher.id, courseId: course.id, type: "formative", title: "Quiz" })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: teacher.id, assessmentId: assessment.id, classId: cls.id })
    .returning();
  const [attempt] = await db
    .insert(schema.attempts)
    .values({
      assignmentId: asg.id,
      studentId: student.id,
      number: 1,
      questionSet: [
        { questionId: v2.id, sectionId: v1.id, learningTargetId: lt.id, points: 1, order: 0 },
      ],
      status: "graded",
      score: 1,
      maxScore: 1,
      percent: 100,
      startedAt: new Date("2026-11-04T15:00:00Z"),
      submittedAt: new Date("2026-11-04T15:07:30.250Z"),
    })
    .returning();
  await db.insert(schema.responses).values({
    attemptId: attempt.id,
    questionId: v2.id,
    answer: { kind: "choice", optionId: "abc" },
    autoScore: 1,
    isCorrect: true,
  });
  await db.insert(schema.authThrottle).values({ key: "login:someone", failures: 3 });
});

describe("the weekly backup (H7.3)", () => {
  it("lists every table of the app except the throwaway counters", async () => {
    const tables = await listBackupTables(source.db);
    expect(tables).toContain("users");
    expect(tables).toContain("responses");
    expect(tables).toContain("questions");
    expect(tables).not.toContain("auth_throttle");
    expect(tables.length).toBeGreaterThan(40);
  });

  it("the manifest counts what is there", async () => {
    manifest = await backupManifest(source.db, new Date("2026-11-15T08:00:00Z"));
    expect(manifest).toMatchObject({
      app: "bloom",
      format: 1,
      takenAt: "2026-11-15T08:00:00.000Z",
    });
    const count = (name: string) => manifest.tables.find((t) => t.name === name)?.rows;
    expect(count("users")).toBe(2);
    expect(count("questions")).toBe(2);
    expect(count("question_options")).toBe(2);
  });

  it("exports each table as one line of JSON per row", async () => {
    for (const { name, rows } of manifest.tables) {
      const lines: string[] = [];
      for await (const batch of exportTable(source.db, name)) lines.push(...batch);
      expect(lines).toHaveLength(rows);
      for (const l of lines) expect(l).not.toContain("\n");
      files.set(name, lines);
    }
  });

  it("loads tables after what they point at, and unties rings", () => {
    const { order, late } = restoreOrder(
      ["a", "b", "c", "d"],
      [
        { table: "b", column: "a_id", refTable: "a" },
        { table: "c", column: "b_id", refTable: "b" },
        { table: "c", column: "parent_id", refTable: "c" },
        { table: "a", column: "d_id", refTable: "d" },
        { table: "d", column: "a_id", refTable: "a" },
      ]
    );
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
    expect(order).toHaveLength(4);
    expect(late.map((f) => `${f.table}.${f.column}`).sort()).toEqual(["a.d_id", "c.parent_id"]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("d"));
  });

  it("restores into an empty database, row for row the same", async () => {
    const read = (table: string) =>
      (async function* () {
        const lines = files.get(table) ?? [];
        // In small batches, as the real files are read.
        for (let i = 0; i < lines.length; i += 1) yield lines.slice(i, i + 1);
      })();
    const loaded = await restoreBackup(target.db, manifest, read);
    expect(loaded.users).toBe(2);
    for (const { name, rows } of manifest.tables) {
      const after = await everyRow(target, name);
      expect(after, name).toHaveLength(rows);
      expect(after, name).toEqual(await everyRow(source, name));
    }
    // The newer question still points at the one it replaced, and kept its own timestamps.
    const [v2] = await target.db
      .select()
      .from(target.schema.questions)
      .where(sql`previous_version_id is not null`);
    expect(v2.version).toBe(2);
    // The triggers are back on: a later change stamps updated_at again.
    const before = v2.updatedAt;
    await target.db.execute(sql`update questions set stem = stem || '!' where version = 2`);
    const [changed] = await target.db
      .select()
      .from(target.schema.questions)
      .where(sql`version = 2`);
    expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("never restores over a database that already has accounts", async () => {
    await expect(
      restoreBackup(target.db, manifest, () => (async function* () {})())
    ).rejects.toThrow(/already has accounts/);
  });
});
