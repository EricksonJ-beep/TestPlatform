/**
 * Seeds what the end-to-end student run needs (scripts/e2e-student.mjs; hardening plan H7.5):
 * a teacher, a class, one student with their own password, and a short quiz with one question
 * of each kind the run touches. Fresh rows every time, so runs never collide. Prints one JSON
 * line: {"assignmentId", "username", "password"}. Made-up names only; never run against
 * production (it refuses a Neon database).
 */
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/password";

if (/neon\.tech/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("e2e-seed: refusing to seed a Neon database.");
  process.exit(1);
}

const tag = Date.now().toString(36);
const password = "e2e-student-pass-1";
const [teacher] = await db
  .insert(schema.users)
  .values({
    email: `e2e.teacher.${tag}@example.test`,
    passwordHash: await hashPassword("e2e-teacher-pass-1"),
    role: "teacher",
    firstName: "Tess",
    lastName: "Teacher",
  })
  .returning();
const username = `e2e.student.${tag}`;
const [student] = await db
  .insert(schema.users)
  .values({
    username,
    passwordHash: await hashPassword(password),
    role: "student",
    firstName: "Sam",
    lastName: "Sample",
  })
  .returning();
const [course] = await db
  .insert(schema.courses)
  .values({ ownerId: teacher.id, name: `E2E Biology ${tag}` })
  .returning();
const [lt] = await db
  .insert(schema.learningTargets)
  .values({ courseId: course.id, code: "U1.LT1", title: "Cells", sortOrder: 1 })
  .returning();
const [cls] = await db
  .insert(schema.classes)
  .values({ ownerId: teacher.id, courseId: course.id, name: "E2E Period 1" })
  .returning();
await db.insert(schema.enrollments).values({ classId: cls.id, studentId: student.id });
const [bank] = await db
  .insert(schema.questionBanks)
  .values({ ownerId: teacher.id, courseId: course.id, name: "E2E Quiz bank" })
  .returning();

const questionIds: string[] = [];
for (let i = 1; i <= 3; i++) {
  const [q] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: teacher.id,
      type: "multiple_choice",
      stem: `Multiple choice ${i}: pick the right one.`,
      explanation: "The first choice is the right one.",
    })
    .returning();
  await db.insert(schema.questionOptions).values([
    { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
    { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
  ]);
  await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt.id });
  questionIds.push(q.id);
}
const [fill] = await db
  .insert(schema.questions)
  .values({
    bankId: bank.id,
    ownerId: teacher.id,
    type: "fill_blank",
    stem: "The powerhouse of the cell is the ___.",
    gradingConfig: { acceptedAnswers: ["mitochondria", "mitochondrion"] },
  })
  .returning();
await db.insert(schema.questionTargets).values({ questionId: fill.id, learningTargetId: lt.id });
questionIds.push(fill.id);
const [ordering] = await db
  .insert(schema.questions)
  .values({
    bankId: bank.id,
    ownerId: teacher.id,
    type: "ordering",
    stem: "Put the phases of mitosis in order.",
  })
  .returning();
await db.insert(schema.questionOptions).values(
  ["Prophase", "Metaphase", "Anaphase"].map((content, i) => ({
    questionId: ordering.id,
    content,
    isCorrect: true,
    sortOrder: i,
    correctPosition: i,
  }))
);
await db
  .insert(schema.questionTargets)
  .values({ questionId: ordering.id, learningTargetId: lt.id });
questionIds.push(ordering.id);

const [assessment] = await db
  .insert(schema.assessments)
  .values({
    ownerId: teacher.id,
    courseId: course.id,
    type: "formative",
    title: `E2E quiz ${tag}`,
    isPublished: true,
  })
  .returning();
const [section] = await db
  .insert(schema.assessmentSections)
  .values({ assessmentId: assessment.id, title: "U1.LT1", learningTargetId: lt.id, sortOrder: 0 })
  .returning();
await db
  .insert(schema.assessmentQuestions)
  .values(
    questionIds.map((questionId, i) => ({ sectionId: section.id, questionId, sortOrder: i }))
  );
const [assignment] = await db
  .insert(schema.assignments)
  .values({
    ownerId: teacher.id,
    assessmentId: assessment.id,
    classId: cls.id,
    attemptsAllowed: 3,
    timeLimitMinutes: 20,
  })
  .returning();

console.log(JSON.stringify({ assignmentId: assignment.id, username, password }));
process.exit(0);
