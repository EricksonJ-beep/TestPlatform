/**
 * Ticket R2 (docs/retake-cycle-plan.md): a test's retake bank. Done when: a retake on one target
 * serves that target's questions from the bank, none seen before, with the same points possible as
 * attempt 1's section; the test's total never changes.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createAttempt } from "./attempts";
import {
  attachRetakeBank,
  mirrorShortfall,
  retakePoolName,
  sectionByTarget,
} from "./test-sections";

const ids = {
  teacher: "",
  student: "",
  course: "",
  bank: "",
  lt: [] as string[],
  test: [] as string[],
  retake: [] as string[],
  assessment: "",
  assignment: "",
};

async function questions(n: number, target: string, points: (i: number) => number, difficulty = 3) {
  const rows = await db
    .insert(schema.questions)
    .values(
      Array.from({ length: n }, (_, i) => ({
        bankId: ids.bank,
        ownerId: ids.teacher,
        type: "true_false" as const,
        stem: `${target} ${i}`,
        points: points(i),
        difficulty,
      }))
    )
    .returning({ id: schema.questions.id });
  await db
    .insert(schema.questionTargets)
    .values(rows.map((r) => ({ questionId: r.id, learningTargetId: target })));
  return rows.map((r) => r.id);
}

beforeAll(async () => {
  const [t] = await db
    .insert(schema.users)
    .values({ email: "t@x", passwordHash: "x", role: "teacher", firstName: "T", lastName: "T" })
    .returning();
  const [s] = await db
    .insert(schema.users)
    .values({ email: "s@x", passwordHash: "x", role: "student", firstName: "S", lastName: "S" })
    .returning();
  ids.teacher = t.id;
  ids.student = s.id;
  const [c] = await db.insert(schema.courses).values({ ownerId: t.id, name: "Bio" }).returning();
  ids.course = c.id;
  const lts = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: c.id, code: "LT1", title: "One", sortOrder: 0 },
      { courseId: c.id, code: "LT4", title: "Four", sortOrder: 1 },
    ])
    .returning();
  ids.lt = lts.map((l) => l.id);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: c.id, name: "Unit test bank" })
    .returning();
  ids.bank = bank.id;
  // The test: LT1 five 1-pointers; LT4 nine 1-pointers and one 4-point matching (13 points).
  ids.test = [
    ...(await questions(5, ids.lt[0], () => 1)),
    ...(await questions(10, ids.lt[1], (i) => (i === 9 ? 4 : 1))),
  ];
  // The retake bank: fifteen LT4 questions, two of them worth 4.
  ids.retake = await questions(15, ids.lt[1], (i) => (i < 2 ? 4 : 1));

  const [a] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: c.id,
      type: "summative",
      title: "Unit 2 Test",
      isPublished: true,
    })
    .returning();
  ids.assessment = a.id;
  await sectionByTarget(a.id, c.id, ids.test);
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: c.id, name: "P1" })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ assessmentId: a.id, classId: cls.id, ownerId: t.id, attemptsAllowed: 2 })
    .returning();
  ids.assignment = asg.id;
});

describe("retake bank", () => {
  it("attaches one pool per target section, tagged to the target, and reports a short bank", async () => {
    const out = await attachRetakeBank({
      assessmentId: ids.assessment,
      ownerId: ids.teacher,
      courseId: ids.course,
      testTitle: "Unit 2 Test",
      questionIds: ids.retake,
    });
    expect(out).toEqual({ attached: 15, unplaced: 0, short: ["LT1"] }); // LT1 has no bank
    const sections = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, ids.assessment))
      .orderBy(schema.assessmentSections.sortOrder);
    expect(sections[0].retakePoolId).toBeNull(); // LT1 has no bank
    const pool = (await db.query.questionPools.findFirst({
      where: eq(schema.questionPools.id, sections[1].retakePoolId!),
    }))!;
    expect(pool.name).toBe(retakePoolName("Unit 2 Test", "LT4"));
    const tags = await db
      .select()
      .from(schema.poolTargets)
      .where(eq(schema.poolTargets.poolId, pool.id));
    expect(tags.map((t) => t.learningTargetId)).toEqual([ids.lt[1]]);
  });

  it("a retake on LT4 serves ten unseen bank questions with the same 13 points; attempt 1 never sees the bank", async () => {
    const a1 = await createAttempt({ assignmentId: ids.assignment, studentId: ids.student });
    const [first] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, a1.attemptId));
    expect(first.questionSet.map((q) => q.questionId).sort()).toEqual([...ids.test].sort());
    const sum = (qs: { points: number }[]) => qs.reduce((n, q) => n + q.points, 0);
    const lt4First = first.questionSet.filter((q) => q.learningTargetId === ids.lt[1]);
    expect(sum(lt4First)).toBe(13);

    const a2 = await createAttempt({
      assignmentId: ids.assignment,
      studentId: ids.student,
      scope: [ids.lt[1]],
    });
    const [retake] = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.id, a2.attemptId));
    expect(retake.questionSet).toHaveLength(10);
    expect(retake.questionSet.every((q) => q.learningTargetId === ids.lt[1])).toBe(true);
    expect(retake.questionSet.every((q) => ids.retake.includes(q.questionId))).toBe(true);
    expect(sum(retake.questionSet)).toBe(13);
    expect(retake.questionSet.filter((q) => q.points === 4)).toHaveLength(1);
  });

  it("mirrorShortfall names the point values a bank cannot cover", () => {
    expect(mirrorShortfall([1, 1, 4], [1, 1, 1, 4])).toEqual([]);
    expect(mirrorShortfall([1, 1, 4, 4], [1, 4, 2])).toEqual([1, 4]);
  });
});
