/**
 * Removing the relearning walkthrough (Jon, Nov 20 2026): the course and everything in it goes;
 * his real courses, their classes, tests and attempts, and every account stay. It stops, deleting
 * nothing, if something outside the walkthrough uses its questions.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { removeWalkthrough, WALKTHROUGH } from "@/lib/remove-walkthrough";

let teacherId = "";
let studentId = "";

/** A course with a class, a bank of two questions, a quiz on them, assigned, with one attempt. */
async function seedCourse(name: string) {
  const [course] = await db.insert(schema.courses).values({ ownerId: teacherId, name }).returning();
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId: course.id, name: `${name} unit`, sortOrder: 1 })
    .returning();
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: course.id, code: "U3.LT1", title: "Formulas", sortOrder: 1 })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: teacherId, courseId: course.id, name: `${name} class` })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: teacherId, courseId: course.id, name: `${name} bank` })
    .returning();
  const questions = await db
    .insert(schema.questions)
    .values(
      [1, 2].map((i) => ({
        bankId: bank.id,
        ownerId: teacherId,
        type: "multiple_choice" as const,
        stem: `${name} question ${i}`,
      }))
    )
    .returning();
  await db
    .insert(schema.questionTargets)
    .values(questions.map((q) => ({ questionId: q.id, learningTargetId: lt.id })));
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: teacherId,
      courseId: course.id,
      unitId: unit.id,
      type: "formative",
      title: `${name} quiz`,
      isPublished: true,
    })
    .returning();
  const [section] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "U3.LT1", learningTargetId: lt.id, sortOrder: 0 })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values(questions.map((q, i) => ({ sectionId: section.id, questionId: q.id, sortOrder: i })));
  const [assignment] = await db
    .insert(schema.assignments)
    .values({ ownerId: teacherId, assessmentId: assessment.id, classId: cls.id })
    .returning();
  const [attempt] = await db
    .insert(schema.attempts)
    .values({
      assignmentId: assignment.id,
      studentId,
      number: 1,
      status: "graded",
      percent: 50,
      questionSet: questions.map((q, i) => ({
        questionId: q.id,
        sectionId: section.id,
        learningTargetId: lt.id,
        points: 1,
        order: i,
      })),
    })
    .returning();
  await db
    .insert(schema.responses)
    .values(questions.map((q) => ({ attemptId: attempt.id, questionId: q.id, answer: "x" })));
  await db.insert(schema.assignmentFinalScores).values({
    assignmentId: assignment.id,
    studentId,
    totalEarned: 1,
    totalPossible: 2,
    percent: 50,
  });
  return { course, cls, bank, questions, assessment, section, assignment, attempt };
}

const counts = async () => ({
  courses: await db.$count(schema.courses),
  units: await db.$count(schema.units),
  targets: await db.$count(schema.learningTargets),
  classes: await db.$count(schema.classes),
  enrollments: await db.$count(schema.enrollments),
  banks: await db.$count(schema.questionBanks),
  questions: await db.$count(schema.questions),
  assessments: await db.$count(schema.assessments),
  assignments: await db.$count(schema.assignments),
  attempts: await db.$count(schema.attempts),
  responses: await db.$count(schema.responses),
  finals: await db.$count(schema.assignmentFinalScores),
  users: await db.$count(schema.users),
});

beforeAll(async () => {
  const [t] = await db
    .insert(schema.users)
    .values({
      email: WALKTHROUGH.teacherEmail,
      passwordHash: "x",
      role: "teacher",
      firstName: "Jon",
      lastName: "Erickson",
    })
    .returning();
  teacherId = t.id;
  const [s] = await db
    .insert(schema.users)
    .values({
      username: "pretend.student",
      passwordHash: "x",
      role: "student",
      firstName: "Pretend",
      lastName: "Student",
    })
    .returning();
  studentId = s.id;
});

describe("removing the relearning walkthrough", () => {
  it("does nothing when the course isn't there, but clears its pack records", async () => {
    await db
      .insert(schema.contentPacks)
      .values([{ name: "walkthrough-5-quiz" }, { name: "ps-u1-test-form-b" }]);
    expect(await removeWalkthrough()).toEqual({
      status: "absent",
      reason: "the course is already gone",
      packRows: 1,
    });
    expect((await db.select().from(schema.contentPacks)).map((p) => p.name)).toEqual([
      "ps-u1-test-form-b",
    ]);
    expect(
      await removeWalkthrough({ teacherEmail: "nobody@example.com", course: WALKTHROUGH.course })
    ).toMatchObject({ status: "absent", reason: "no teacher nobody@example.com" });
  });

  it("stops and deletes nothing when another course's quiz uses a walkthrough question", async () => {
    const biology = await seedCourse("Biology");
    const walk = await seedCourse(WALKTHROUGH.course);
    const [borrowed] = await db
      .insert(schema.assessmentQuestions)
      .values({ sectionId: biology.section.id, questionId: walk.questions[0].id, sortOrder: 9 })
      .returning();
    const before = await counts();
    expect(await removeWalkthrough()).toEqual({
      status: "blocked",
      reason: '"Biology quiz" in another course uses walkthrough questions',
    });
    expect(await counts()).toEqual(before);
    await db
      .delete(schema.assessmentQuestions)
      .where(eq(schema.assessmentQuestions.id, borrowed.id));
  });

  it("removes the course and everything in it, and nothing else", async () => {
    // Biology and the walkthrough are both seeded (the test above), each with one of everything.
    expect(await counts()).toMatchObject({ courses: 2, classes: 2, attempts: 2, questions: 4 });
    expect(await removeWalkthrough()).toEqual({
      status: "removed",
      classes: 1,
      assignments: 1,
      attempts: 1,
      assessments: 1,
      banks: 1,
      questions: 2,
      packRows: 0,
    });
    // Exactly Biology's rows are left; both accounts stay (the pretend student is only unenrolled).
    expect(await counts()).toEqual({
      courses: 1,
      units: 1,
      targets: 1,
      classes: 1,
      enrollments: 1,
      banks: 1,
      questions: 2,
      assessments: 1,
      assignments: 1,
      attempts: 1,
      responses: 2,
      finals: 1,
      users: 2,
    });
    expect((await db.select().from(schema.courses))[0].name).toBe("Biology");
    expect((await db.select().from(schema.questions)).map((q) => q.stem).sort()).toEqual([
      "Biology question 1",
      "Biology question 2",
    ]);
    // A second run finds nothing.
    expect(await removeWalkthrough()).toMatchObject({ status: "absent" });
  });

  it("only matches the exact course name on Jon's account", async () => {
    await seedCourse("Relearning Walkthrough 2");
    expect(await removeWalkthrough()).toMatchObject({ status: "absent" });
    expect(await db.$count(schema.courses)).toBe(2);
  });
});
