/**
 * CVTC rules and the capped-retake agreement (Jon, Oct 13 2026). A non-CVTC
 * capped formative at or above the threshold is corrections → 100% with no
 * retake; below it, corrections lift to the threshold and then the retake is
 * open. In a course with CVTC rules corrections are never owed and earn
 * nothing; the retake is the only way up. The student card and startAttempt
 * must say the same thing. In-memory Postgres with the real migrations.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeAttempt } from "@/lib/attempts";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getCorrectionsSummary } from "@/lib/queries/corrections";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { setCourseCvtcRules } from "../app/courses/actions";
import { unlockNextAttempt } from "../app/results/actions";
import { startAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  s3: "",
  s4: "",
  bio: "", // course without CVTC rules
  ap: "", // Anatomy and Physiology, CVTC rules on
  bioQuiz: "", // capped formative (the default), auto review, 3 attempts
  apQuiz: "", // formative, cap left on, but the course's CVTC rules win
  apTest: "", // summative on one target
  bioQ: [] as { id: string; right: string; wrong: string }[],
  apQ: [] as { id: string; right: string; wrong: string }[],
  attempts: {} as Record<string, string>,
};

const as = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const refused = async (
  p: Promise<{ ok: true } | { ok: false; status: number; error: string }>,
  status: number,
  text?: RegExp
) => {
  const r = await p;
  expect(r).toMatchObject({ ok: false, status });
  if (text && !r.ok) expect(r.error).toMatch(text);
};
const card = async (studentId: string, assignmentId: string) =>
  (await listStudentAssignments(studentId)).find((a) => a.id === assignmentId)!;
const finalOf = async (assignmentId: string, studentId: string) =>
  (await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, assignmentId),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  }))!;

const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed the two terms up on the quiz. The right one is the one that matches the definition in our notes.",
};

/** Start as the student, answer the first `right` questions correctly and the rest wrong, submit. */
async function take(
  studentId: string,
  assignmentId: string,
  questions: { id: string; right: string; wrong: string }[],
  right: number
): Promise<string> {
  as(studentId, "student");
  const { attemptId } = await ok(startAttempt(assignmentId, null));
  await db.insert(schema.responses).values(
    questions.map((q, i) => ({
      attemptId,
      questionId: q.id,
      answer: { kind: "choice" as const, optionId: i < right ? q.right : q.wrong },
    }))
  );
  await finalizeAttempt(attemptId);
  return attemptId;
}

async function correctAll(studentId: string, attemptId: string) {
  as(studentId, "student");
  const summary = (await getCorrectionsSummary(attemptId))!;
  const form = await db
    .select({ questionId: schema.responses.questionId, autoScore: schema.responses.autoScore })
    .from(schema.responses)
    .where(eq(schema.responses.attemptId, attemptId));
  for (const r of form.filter((x) => x.autoScore === 0))
    await ok(saveCorrection(attemptId, r.questionId, WHY));
  expect(summary.needed).toBe(form.filter((x) => x.autoScore === 0).length);
  return ok(submitCorrections(attemptId));
}

beforeAll(async () => {
  const [t, o, s1, s2, s3, s4] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      { email: "s1@s", passwordHash: "x", role: "student", firstName: "Ana", lastName: "A" },
      { email: "s2@s", passwordHash: "x", role: "student", firstName: "Ben", lastName: "B" },
      { email: "s3@s", passwordHash: "x", role: "student", firstName: "Cal", lastName: "C" },
      { email: "s4@s", passwordHash: "x", role: "student", firstName: "Dee", lastName: "D" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: o.id, s1: s1.id, s2: s2.id, s3: s3.id, s4: s4.id });

  const [bio, ap] = await db
    .insert(schema.courses)
    .values([
      { ownerId: t.id, name: "Biology" },
      { ownerId: t.id, name: "Anatomy and Physiology", cvtcRules: true },
    ])
    .returning();
  Object.assign(ids, { bio: bio.id, ap: ap.id });
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: ap.id, code: "LT1", title: "Tissues", sortOrder: 1 })
    .returning();

  for (const [course, list] of [
    [bio, ids.bioQ],
    [ap, ids.apQ],
  ] as const) {
    const [bank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
      .returning();
    for (let i = 0; i < 5; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: bank.id,
          ownerId: t.id,
          type: "multiple_choice",
          stem: `${course.name} ${i}`,
          points: 1,
        })
        .returning();
      await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt.id });
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      list.push({ id: q.id, right: right.id, wrong: wrong.id });
    }
  }

  const [bioCls, apCls] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t.id, courseId: bio.id, name: "Bio 2nd" },
      { ownerId: t.id, courseId: ap.id, name: "A&P 3rd" },
    ])
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: bioCls.id, studentId: s1.id },
    { classId: bioCls.id, studentId: s2.id },
    { classId: apCls.id, studentId: s3.id },
    { classId: apCls.id, studentId: s4.id },
  ]);

  async function assess(
    courseId: string,
    type: "formative" | "summative",
    title: string,
    questions: { id: string }[],
    learningTargetId: string | null
  ) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId, type, title, isPublished: true })
      .returning();
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId: a.id, title: "All", sortOrder: 0, learningTargetId })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values(questions.map((q, i) => ({ sectionId: sec.id, questionId: q.id, sortOrder: i })));
    return a.id;
  }
  const [bq, aq, at] = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        assessmentId: await assess(bio.id, "formative", "Cell quiz", ids.bioQ, null),
        classId: bioCls.id,
        attemptsAllowed: 3,
      },
      {
        ownerId: t.id,
        assessmentId: await assess(ap.id, "formative", "Skin quiz", ids.apQ, null),
        classId: apCls.id,
        attemptsAllowed: 3,
      },
      {
        ownerId: t.id,
        assessmentId: await assess(ap.id, "summative", "Tissue test", ids.apQ, lt.id),
        classId: apCls.id,
        attemptsAllowed: 2,
      },
    ])
    .returning();
  Object.assign(ids, { bioQuiz: bq.id, apQuiz: aq.id, apTest: at.id });
});

describe("non-CVTC capped formative (rule 2)", () => {
  it("at or above the threshold: Do corrections → 100%, and startAttempt refuses a retake before and after", async () => {
    const attemptId = await take(ids.s1, ids.bioQuiz, ids.bioQ, 4); // 80%
    const before = await card(ids.s1, ids.bioQuiz);
    expect(before).toMatchObject({
      state: "corrections_to_full",
      correctionsRule: "to_full",
      correctionsCap: true,
      cvtcRules: false,
      corrections: { state: "needed", needed: 1 },
    });
    await refused(startAttempt(ids.bioQuiz, null), 403, /no retake at your score/);

    expect((await correctAll(ids.s1, attemptId)).state).toBe("approved"); // auto review
    expect(await finalOf(ids.bioQuiz, ids.s1)).toMatchObject({
      percent: 100,
      basis: "corrections_to_full",
    });
    const after = await card(ids.s1, ids.bioQuiz);
    expect(after.state).toBe("done");
    expect(after.attemptsUsed).toBe(1);
    as(ids.s1, "student");
    await refused(startAttempt(ids.bioQuiz, null), 403, /raised this quiz to 100%/);
  });

  it("below the threshold: corrections come first and lift to 80; then the card and startAttempt both open the retake", async () => {
    const attemptId = await take(ids.s2, ids.bioQuiz, ids.bioQ, 2); // 40%
    expect(await card(ids.s2, ids.bioQuiz)).toMatchObject({
      state: "corrections_needed",
      correctionsRule: "gate",
    });
    await refused(startAttempt(ids.bioQuiz, null), 403, /Finish your corrections/);

    await correctAll(ids.s2, attemptId);
    expect(await finalOf(ids.bioQuiz, ids.s2)).toMatchObject({
      percent: 80,
      basis: "corrections_to_threshold",
    });
    expect((await card(ids.s2, ids.bioQuiz)).state).toBe("retake_available");
    as(ids.s2, "student");
    const retake = await ok(startAttempt(ids.bioQuiz, null));
    expect(retake.resumed).toBe(false);
    // A 60% retake stands on its own; the corrected 80 still counts.
    await db.insert(schema.responses).values(
      ids.bioQ.map((q, i) => ({
        attemptId: retake.attemptId,
        questionId: q.id,
        answer: { kind: "choice" as const, optionId: i < 3 ? q.right : q.wrong },
      }))
    );
    await finalizeAttempt(retake.attemptId);
    expect(await finalOf(ids.bioQuiz, ids.s2)).toMatchObject({
      percent: 80,
      basis: "corrections_to_threshold",
    });
  });
});

describe("CVTC course (rule 3)", () => {
  it("formative: nothing is owed, no cap and no retake window; the card offers the retake and startAttempt agrees", async () => {
    const attemptId = await take(ids.s3, ids.apQuiz, ids.apQ, 2); // 40%
    expect(await getCorrectionsSummary(attemptId)).toMatchObject({ state: "none", needed: 0 });
    expect(await finalOf(ids.apQuiz, ids.s3)).toMatchObject({ percent: 40, basis: "best_attempt" });
    expect(await card(ids.s3, ids.apQuiz)).toMatchObject({
      state: "retake_available",
      correctionsRule: "none",
      cvtcRules: true,
      correctionsCap: false,
      corrections: null,
      retakeBy: null,
    });
    // Corrections can't even be started here.
    as(ids.s3, "student");
    await refused(saveCorrection(attemptId, ids.apQ[4].id, WHY), 400, /doesn.t need a correction/);

    // "Retakes need my OK" still applies on top (teacher unlock rules unchanged).
    await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: true })
      .where(eq(schema.assignments.id, ids.apQuiz));
    expect((await card(ids.s3, ids.apQuiz)).state).toBe("awaiting_unlock");
    as(ids.s3, "student");
    await refused(startAttempt(ids.apQuiz, null), 403, /unlock/);
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.apQuiz, ids.s3));
    expect((await card(ids.s3, ids.apQuiz)).state).toBe("retake_available");
    as(ids.s3, "student");
    expect((await ok(startAttempt(ids.apQuiz, null))).resumed).toBe(false);
  });

  it("summative: the corrections gate is always open, so a required target goes straight to Retake required", async () => {
    await take(ids.s4, ids.apTest, ids.apQ, 2); // LT1 at 40%
    const status = (await getRetakeStatus(ids.apTest, ids.s4))!;
    expect(status.plan).toMatchObject({ required: [status.targets[0].id], canStart: true });
    expect(status.targets[0].gate).toMatchObject({ correctionsOk: true, unlocked: true });
    expect(await card(ids.s4, ids.apTest)).toMatchObject({
      state: "retake_required",
      corrections: null,
    });
    as(ids.s4, "student");
    expect((await ok(startAttempt(ids.apTest, null))).resumed).toBe(false);
  });
});

describe("the course setting", () => {
  it("is owner-only, takes a corrections lift off when switched on, and puts it back when switched off", async () => {
    as(ids.other, "teacher");
    await refused(setCourseCvtcRules(ids.bio, true), 403);
    as(ids.s1, "student");
    await refused(setCourseCvtcRules(ids.bio, true), 403);

    as(ids.teacher, "teacher");
    expect(await ok(setCourseCvtcRules(ids.bio, true))).toMatchObject({ cvtcRules: true });
    // Ben's corrected 80 goes; his best attempt (the 60% retake) counts.
    expect(await finalOf(ids.bioQuiz, ids.s2)).toMatchObject({
      percent: 60,
      basis: "best_attempt",
    });
    expect(await finalOf(ids.bioQuiz, ids.s1)).toMatchObject({
      percent: 80,
      basis: "best_attempt",
    });
    // Ana is no longer held at corrections → 100%: the retake is the way up now.
    expect(await card(ids.s1, ids.bioQuiz)).toMatchObject({
      state: "retake_available",
      correctionsRule: "none",
      corrections: null,
    });

    as(ids.teacher, "teacher");
    expect(await ok(setCourseCvtcRules(ids.bio, false))).toMatchObject({ cvtcRules: false });
    expect(await finalOf(ids.bioQuiz, ids.s2)).toMatchObject({
      percent: 80,
      basis: "corrections_to_threshold",
    });
    expect(await finalOf(ids.bioQuiz, ids.s1)).toMatchObject({
      percent: 100,
      basis: "corrections_to_full",
    });
    const course = await db.query.courses.findFirst({ where: eq(schema.courses.id, ids.bio) });
    expect(course?.cvtcRules).toBe(false);
  });
});
