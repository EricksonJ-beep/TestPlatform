/**
 * Removing the relearning walkthrough (Jon, Nov 20 2026: "lets remove the Relearning
 * Walkthrough"; he chose to delete everything). The practice course made on Nov 5 2026
 * (relearning revamp L0) goes for good, with its practice class, its WT banks and questions, its
 * quiz and test, their assignments and every attempt taken on them, its practice content, units,
 * targets and Read · Watch · Do. Student accounts are untouched: a pretend student Jon added is
 * only unenrolled.
 *
 * Found by the owner's email and the course's exact name, so nothing else can match. Before
 * anything is deleted it checks that nothing outside the walkthrough uses its questions (another
 * course's quiz, a response on some other assignment); if something does, it stops and deletes
 * nothing. The database driver on Vercel has no transactions, so the deletes run leaves first:
 * a run that stops partway leaves only walkthrough rows behind, and the next run finishes it.
 * Does nothing once the course is gone.
 */
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const WALKTHROUGH = {
  teacherEmail: "EricksonJ@cadott.k12.wi.us",
  course: "Relearning Walkthrough",
} as const;

export type RemoveWalkthroughOutcome =
  | { status: "absent"; reason: string; packRows: number }
  | { status: "blocked"; reason: string }
  | {
      status: "removed";
      classes: number;
      assignments: number;
      attempts: number;
      assessments: number;
      banks: number;
      questions: number;
      packRows: number;
    };

/** The packs that filled the course: their "applied" rows go too, whether or not the course is there. */
async function forgetPacks(): Promise<number> {
  const gone = await db
    .delete(schema.contentPacks)
    .where(like(schema.contentPacks.name, "walkthrough-%"))
    .returning({ name: schema.contentPacks.name });
  return gone.length;
}

export async function removeWalkthrough(
  target: { teacherEmail: string; course: string } = WALKTHROUGH
): Promise<RemoveWalkthroughOutcome> {
  const teacher = await db.query.users.findFirst({
    columns: { id: true },
    where: sql`lower(${schema.users.email}) = ${target.teacherEmail.trim().toLowerCase()}`,
  });
  if (!teacher)
    return {
      status: "absent",
      reason: `no teacher ${target.teacherEmail}`,
      packRows: await forgetPacks(),
    };
  const courses = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(and(eq(schema.courses.ownerId, teacher.id), eq(schema.courses.name, target.course)));
  if (courses.length === 0)
    return {
      status: "absent",
      reason: "the course is already gone",
      packRows: await forgetPacks(),
    };
  if (courses.length > 1)
    return { status: "blocked", reason: `${courses.length} courses are named ${target.course}` };
  const courseId = courses[0].id;

  const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);
  const [classIds, assessmentIds, bankIds] = await Promise.all([
    ids(
      db
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(eq(schema.classes.courseId, courseId))
    ),
    ids(
      db
        .select({ id: schema.assessments.id })
        .from(schema.assessments)
        .where(eq(schema.assessments.courseId, courseId))
    ),
    ids(
      db
        .select({ id: schema.questionBanks.id })
        .from(schema.questionBanks)
        .where(eq(schema.questionBanks.courseId, courseId))
    ),
  ]);
  const questionIds = bankIds.length
    ? await ids(
        db
          .select({ id: schema.questions.id })
          .from(schema.questions)
          .where(inArray(schema.questions.bankId, bankIds))
      )
    : [];
  // Every assignment of the walkthrough's quiz or test, and anything assigned to its class.
  const assignmentFilter = or(
    classIds.length ? inArray(schema.assignments.classId, classIds) : undefined,
    assessmentIds.length ? inArray(schema.assignments.assessmentId, assessmentIds) : undefined
  );
  const assignmentIds = assignmentFilter
    ? await ids(
        db.select({ id: schema.assignments.id }).from(schema.assignments).where(assignmentFilter)
      )
    : [];

  // --- Nothing outside the walkthrough may use its questions. Checked before any delete. ---
  if (questionIds.length) {
    const outsideQuizzes = await db
      .select({ title: schema.assessments.title })
      .from(schema.assessmentQuestions)
      .innerJoin(
        schema.assessmentSections,
        eq(schema.assessmentSections.id, schema.assessmentQuestions.sectionId)
      )
      .innerJoin(
        schema.assessments,
        eq(schema.assessments.id, schema.assessmentSections.assessmentId)
      )
      .where(
        and(
          inArray(schema.assessmentQuestions.questionId, questionIds),
          sql`${schema.assessments.courseId} is distinct from ${courseId}`
        )
      )
      .limit(1);
    if (outsideQuizzes.length)
      return {
        status: "blocked",
        reason: `"${outsideQuizzes[0].title}" in another course uses walkthrough questions`,
      };
    const kept = assignmentIds.length
      ? sql`${schema.attempts.assignmentId} not in (${sql.join(
          assignmentIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql`true`;
    const outsideAnswers = await db
      .select({ id: schema.responses.id })
      .from(schema.responses)
      .innerJoin(schema.attempts, eq(schema.attempts.id, schema.responses.attemptId))
      .where(and(inArray(schema.responses.questionId, questionIds), kept))
      .limit(1);
    if (outsideAnswers.length)
      return {
        status: "blocked",
        reason: "a test outside the walkthrough has answers to walkthrough questions",
      };
  }

  // --- Leaves first. ---
  const attempts = assignmentIds.length
    ? await db.$count(schema.attempts, inArray(schema.attempts.assignmentId, assignmentIds))
    : 0;
  // Assignments take their attempts, responses, corrections, scores and unlocks with them.
  if (assignmentIds.length)
    await db.delete(schema.assignments).where(inArray(schema.assignments.id, assignmentIds));
  // Classes take their enrollments; the student accounts stay.
  if (classIds.length) await db.delete(schema.classes).where(inArray(schema.classes.id, classIds));
  // Assessments take their sections and question lists.
  if (assessmentIds.length)
    await db.delete(schema.assessments).where(inArray(schema.assessments.id, assessmentIds));
  await db.delete(schema.practiceSets).where(eq(schema.practiceSets.courseId, courseId));
  await db
    .delete(schema.relearningActivities)
    .where(eq(schema.relearningActivities.courseId, courseId));
  await db.delete(schema.worksheets).where(eq(schema.worksheets.courseId, courseId));
  if (questionIds.length)
    await db.delete(schema.questions).where(inArray(schema.questions.id, questionIds));
  await db.delete(schema.stimuli).where(eq(schema.stimuli.courseId, courseId));
  await db.delete(schema.questionPools).where(eq(schema.questionPools.courseId, courseId));
  if (bankIds.length)
    await db.delete(schema.questionBanks).where(inArray(schema.questionBanks.id, bankIds));
  // The course takes its units, learning targets (and their Read · Watch · Do) and practice attempts.
  await db.delete(schema.courses).where(eq(schema.courses.id, courseId));

  return {
    status: "removed",
    classes: classIds.length,
    assignments: assignmentIds.length,
    attempts,
    assessments: assessmentIds.length,
    banks: bankIds.length,
    questions: questionIds.length,
    packRows: await forgetPacks(),
  };
}
