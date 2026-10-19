/**
 * Ticket R3 (docs/retake-cycle-plan.md, Jon Oct 19 2026): on a test, corrections come first, then
 * one relearning item (an activity or a practice set). Relearning done before corrections does not
 * count; one practice set alone clears the step.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createAttempt, finalizeAttempt } from "./attempts";
import { recomputeGates } from "./gates";

const ids = {
  teacher: "",
  student: "",
  lt: "",
  q: [] as { id: string; right: string; wrong: string }[],
  assignment: "",
  attempt: "",
  activity: "",
  set: "",
};

const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 14, min));

async function gate() {
  const [g] = await recomputeGates(ids.assignment, ids.student);
  return g;
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
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: c.id, code: "LT1", title: "Atoms" })
    .returning();
  ids.lt = lt.id;
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: c.id, name: "Bank" })
    .returning();
  for (let i = 0; i < 2; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({ bankId: bank.id, ownerId: t.id, type: "multiple_choice", stem: `Q${i}` })
      .returning();
    const [right, wrong] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt.id });
    ids.q.push({ id: q.id, right: right.id, wrong: wrong.id });
  }
  const [a] = await db
    .insert(schema.assessments)
    .values({ ownerId: t.id, courseId: c.id, type: "summative", title: "Test" })
    .returning();
  const [sec] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: a.id, title: "LT1", learningTargetId: lt.id })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values(ids.q.map((q, i) => ({ sectionId: sec.id, questionId: q.id, sortOrder: i })));
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: c.id, name: "P1" })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ assessmentId: a.id, classId: cls.id, ownerId: t.id, attemptsAllowed: 2 })
    .returning();
  ids.assignment = asg.id;

  // Published relearning for LT1: a reading and a practice set.
  const [act] = await db
    .insert(schema.relearningActivities)
    .values({ ownerId: t.id, courseId: c.id, kind: "reading", title: "Atoms", isPublished: true })
    .returning();
  await db.insert(schema.activityTargets).values({ activityId: act.id, learningTargetId: lt.id });
  ids.activity = act.id;
  const [set] = await db
    .insert(schema.practiceSets)
    .values({ ownerId: t.id, courseId: c.id, title: "LT1 practice", isPublished: true })
    .returning();
  await db
    .insert(schema.practiceSetTargets)
    .values({ practiceSetId: set.id, learningTargetId: lt.id });
  ids.set = set.id;

  // Attempt 1 at 14:00: one right, one wrong (50%), so LT1 must be retaken.
  const { attemptId } = await createAttempt({
    assignmentId: ids.assignment,
    studentId: ids.student,
    now: at(0),
  });
  ids.attempt = attemptId;
  await db.insert(schema.responses).values([
    { attemptId, questionId: ids.q[0].id, answer: { kind: "choice", optionId: ids.q[0].right } },
    { attemptId, questionId: ids.q[1].id, answer: { kind: "choice", optionId: ids.q[1].wrong } },
  ]);
  await finalizeAttempt(attemptId, at(1));
});

describe("relearning comes after corrections, and one item is enough", () => {
  it("a reading done before corrections does not count, and relearning stays shut", async () => {
    await db
      .insert(schema.activityCompletions)
      .values({ studentId: ids.student, activityId: ids.activity, completedAt: at(5) });
    expect(await gate()).toMatchObject({
      required: true,
      correctionsOk: false,
      activityOk: false,
      practiceOk: false,
      unlockedAt: null,
    });
  });

  it("corrections approved at 14:10 still leave the 14:05 reading uncounted", async () => {
    await db.insert(schema.corrections).values({
      attemptId: ids.attempt,
      questionId: ids.q[1].id,
      studentId: ids.student,
      correctAnswer: "Right",
      explanation: "I mixed up the two terms; the right one matches the definition.",
      status: "approved",
      submittedAt: at(9),
      reviewedAt: at(10),
    });
    expect(await gate()).toMatchObject({
      correctionsOk: true,
      activityOk: false,
      practiceOk: false,
      unlockedAt: null,
    });
  });

  it("one practice set finished after corrections clears relearning on its own and unlocks", async () => {
    await db.insert(schema.practiceAttempts).values({
      studentId: ids.student,
      practiceSetId: ids.set,
      questionSet: [],
      startedAt: at(12),
      completedAt: at(15),
    });
    const g = await gate();
    expect(g).toMatchObject({ correctionsOk: true, activityOk: true, practiceOk: true });
    expect(g.unlockedAt).not.toBeNull();
    const [row] = await db
      .select()
      .from(schema.retakeGates)
      .where(
        and(
          eq(schema.retakeGates.assignmentId, ids.assignment),
          eq(schema.retakeGates.studentId, ids.student)
        )
      );
    expect(row).toMatchObject({ activityOk: true, practiceOk: true });
  });
});
