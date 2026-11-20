/**
 * Practice leaderboard counts (Jon, Nov 20 2026): right answers without a reveal, on the
 * class's course, by its enrolled students, plus practice checks on its assignments.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { db, schema } from "@/db";
import { getClassLeaderboard } from "./leaderboard";

const ids = { cls: "", ana: "", ben: "", cy: "", out: "" };
const right = { isCorrect: true, closed: true, revealed: false };

beforeAll(async () => {
  const [t, ana, ben, cy, out] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "a@s", passwordHash: "x", role: "student", firstName: "Ana", lastName: "Ash" },
      { email: "b@s", passwordHash: "x", role: "student", firstName: "Ben", lastName: "Birch" },
      { email: "c@s", passwordHash: "x", role: "student", firstName: "Cy", lastName: "Cedar" },
      { email: "o@s", passwordHash: "x", role: "student", firstName: "Out", lastName: "Sider" },
    ])
    .returning();
  const [bio, other] = await db
    .insert(schema.courses)
    .values([
      { ownerId: t.id, name: "Biology" },
      { ownerId: t.id, name: "Physical Science" },
    ])
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: bio.id, name: "P3" })
    .returning();
  Object.assign(ids, { cls: cls.id, ana: ana.id, ben: ben.id, cy: cy.id, out: out.id });
  await db
    .insert(schema.enrollments)
    .values([ana, ben, cy].map((s) => ({ classId: cls.id, studentId: s.id })));
  const [set, otherSet] = await db
    .insert(schema.practiceSets)
    .values([
      { ownerId: t.id, courseId: bio.id, title: "Cells", isPublished: true },
      { ownerId: t.id, courseId: other.id, title: "Atoms", isPublished: true },
    ])
    .returning();
  await db.insert(schema.practiceAttempts).values([
    // Ana: two right, one revealed, one still wrong, and a worksheet note that is not a question.
    {
      studentId: ana.id,
      practiceSetId: set.id,
      questionSet: [],
      answers: {
        q1: right,
        q2: right,
        q3: { isCorrect: null, closed: true, revealed: true },
        q4: { isCorrect: false, closed: false, misses: 2 },
        _worksheet: { isCorrect: true },
      },
    },
    // Ana does the set again: it counts again. And one built practice on the course.
    { studentId: ana.id, practiceSetId: set.id, questionSet: [], answers: { q1: right } },
    { studentId: ana.id, courseId: bio.id, questionSet: [], answers: { q9: right } },
    // Ben: one right here; his work on another course doesn't count for this class.
    { studentId: ben.id, practiceSetId: set.id, questionSet: [], answers: { q1: right } },
    {
      studentId: ben.id,
      practiceSetId: otherSet.id,
      questionSet: [],
      answers: { x1: right, x2: right, x3: right },
    },
    // Not in the class.
    { studentId: out.id, practiceSetId: set.id, questionSet: [], answers: { q1: right } },
  ]);
  // A practice check on one of the class's assignments: Ben gets 2 of 3.
  const [assessment] = await db
    .insert(schema.assessments)
    .values({ ownerId: t.id, courseId: bio.id, type: "formative", title: "Quiz" })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id })
    .returning();
  const [check] = await db
    .insert(schema.practiceChecks)
    .values({
      assignmentId: asg.id,
      studentId: ben.id,
      purpose: "attempt",
      targetIds: [],
      unlocksAttemptNumber: 3,
      passMark: 4,
    })
    .returning();
  const at = new Date().toISOString();
  await db.insert(schema.practiceCheckRounds).values({
    checkId: check.id,
    number: 1,
    questionSet: [],
    answers: {
      c1: { answer: null, correct: true, answeredAt: at },
      c2: { answer: null, correct: true, answeredAt: at },
      c3: { answer: null, correct: false, answeredAt: at },
    },
  });
});

describe("getClassLeaderboard", () => {
  it("counts each enrolled student's right, unrevealed practice answers for the class", async () => {
    const board = await getClassLeaderboard(ids.cls);
    expect(board.map((e) => [e.firstName, e.questions])).toEqual([
      ["Ana", 4],
      ["Ben", 3],
      ["Cy", 0],
    ]);
  });
});
