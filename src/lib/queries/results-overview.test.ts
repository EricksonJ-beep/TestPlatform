/**
 * The Results table's per-assignment overview (Jon, Nov 5 2026): unit, period, class average and
 * median over enrolled students, and waiting retake requests. In-memory
 * Postgres with real migrations.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { db, schema } from "@/db";
import { getResultsOverview } from "@/lib/queries/results";

const ids = { teacher: "", other: "", scored: "", empty: "", others: "" };

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      ...["Ava Adams", "Ben Brooks", "Cora Carter", "Dylan Dunn"].map((n, i) => ({
        email: `s${i}@s`,
        passwordHash: "x",
        role: "student" as const,
        firstName: n.split(" ")[0],
        lastName: n.split(" ")[1],
      })),
    ])
    .returning();
  const [t, o, s1, s2, s3, gone] = users;
  ids.teacher = t.id;
  ids.other = o.id;
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science A" })
    .returning();
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId: course.id, name: "Unit 3 · Bonding", sortOrder: 2 })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "Phy Sci 3rd", period: "3" })
    .returning();
  await db
    .insert(schema.enrollments)
    .values([s1, s2, s3].map((s) => ({ classId: cls.id, studentId: s.id })));
  const [quiz, test] = await db
    .insert(schema.assessments)
    .values([
      { ownerId: t.id, courseId: course.id, unitId: unit.id, type: "formative", title: "3.1 quiz" },
      { ownerId: t.id, courseId: course.id, type: "summative", title: "No-unit test" },
    ])
    .returning();
  const [scored, empty] = await db
    .insert(schema.assignments)
    .values([
      { ownerId: t.id, classId: cls.id, assessmentId: quiz.id },
      { ownerId: t.id, classId: cls.id, assessmentId: test.id },
    ])
    .returning();
  ids.scored = scored.id;
  ids.empty = empty.id;
  // Another teacher's assignment never shows up.
  const [oCls] = await db
    .insert(schema.classes)
    .values({ ownerId: o.id, name: "Theirs" })
    .returning();
  const [oA] = await db
    .insert(schema.assessments)
    .values({ ownerId: o.id, type: "formative", title: "Theirs" })
    .returning();
  const [others] = await db
    .insert(schema.assignments)
    .values({ ownerId: o.id, classId: oCls.id, assessmentId: oA.id })
    .returning();
  ids.others = others.id;

  // Counting scores 60 / 70 / 100 for the class, and 0 for a student who has left it.
  const final = (studentId: string, percent: number) => ({
    assignmentId: scored.id,
    studentId,
    totalEarned: percent / 10,
    totalPossible: 10,
    percent,
  });
  await db
    .insert(schema.assignmentFinalScores)
    .values([final(s1.id, 60), final(s2.id, 70), final(s3.id, 100), final(gone.id, 0)]);

  // One waiting request, one already approved.
  await db.insert(schema.attemptUnlocks).values([
    { assignmentId: scored.id, studentId: s1.id, attemptNumber: 2, requestedAt: new Date() },
    {
      assignmentId: scored.id,
      studentId: s2.id,
      attemptNumber: 2,
      requestedAt: new Date(),
      grantedAt: new Date(),
    },
  ]);
});

describe("getResultsOverview", () => {
  it("gives unit, period, average and median over enrolled students, and waiting requests", async () => {
    const o = await getResultsOverview(ids.teacher);
    expect(o.get(ids.scored)).toEqual({
      unitName: "Unit 3 · Bonding",
      unitOrder: 2,
      period: "3",
      average: (60 + 70 + 100) / 3,
      median: 70,
      scored: 3,
      requests: 1,
    });
  });

  it("leaves the average empty with no scores", async () => {
    const o = await getResultsOverview(ids.teacher);
    expect(o.get(ids.empty)).toEqual({
      unitName: null,
      unitOrder: null,
      period: "3",
      average: null,
      median: null,
      scored: 0,
      requests: 0,
    });
  });

  it("covers only the teacher's own assignments", async () => {
    const o = await getResultsOverview(ids.teacher);
    expect([...o.keys()].sort()).toEqual([ids.scored, ids.empty].sort());
    expect((await getResultsOverview(ids.other)).has(ids.scored)).toBe(false);
  });
});
