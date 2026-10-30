/**
 * Targeted retake from a retake pool (Jon, Oct 30 2026: "Easton should be able to generate a
 * retake that has around 10 questions for the learning target he needs to improve in"). A
 * summative of fixed questions, like a test from a content pack: LT1 has 4 questions, LT4 has 20,
 * and LT4's section draws a retake of 10 from the 24-question "Bio U2.LT4 Retake Pool", picked
 * automatically because it is tagged to LT4 and named "Retake". 100% on LT1 and 70% on
 * LT4 → LT4 required, LT1 optional; the retake serves 10 pool questions on LT4 only, none from the
 * test; 9/10 counts as 90% of LT4's 20 points.
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

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listFinalScores } from "@/lib/queries/attempts";
import { getAssessmentDetail } from "@/lib/queries/assessments";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { getGradebook, getMasteryGrid } from "@/lib/queries/results";
import { setSectionRetakePool } from "@/app/app/assessments/actions";
import { saveAnswer, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

type Q = { id: string; right: string; wrong: string };
const ids = {
  teacher: "",
  student: "",
  assessment: "",
  assignment: "",
  lt1: "",
  lt4: "",
  lt4Section: "",
  cls: "",
  retakePool: "",
  test: [] as string[],
  pool: [] as string[],
  q: new Map<string, Q>(),
  attempt1: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};

beforeAll(async () => {
  const [t, s] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "e@s", passwordHash: "x", role: "student", firstName: "Easton", lastName: "H" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, student: s.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology A" })
    .returning();
  const [lt1, lt4] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "U2.LT1", title: "Atoms", sortOrder: 1 },
      { courseId: course.id, code: "U2.LT4", title: "Macromolecules", sortOrder: 4 },
    ])
    .returning();
  Object.assign(ids, { lt1: lt1.id, lt4: lt4.id });
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "Bio 2" })
    .returning();
  ids.cls = cls.id;
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: s.id });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  const question = async (lt: string, stem: string, difficulty = 3) => {
    const [q] = await db
      .insert(schema.questions)
      .values({ bankId: bank.id, ownerId: t.id, type: "multiple_choice", stem, difficulty })
      .returning();
    const [right, wrong] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt });
    ids.q.set(q.id, { id: q.id, right: right.id, wrong: wrong.id });
    return q.id;
  };

  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "summative",
      title: "Unit 2 Test",
      isPublished: true,
    })
    .returning();
  ids.assessment = assessment.id;
  for (const [order, lt, n] of [
    [0, lt1.id, 4],
    [1, lt4.id, 20],
  ] as const) {
    const [section] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId: assessment.id,
        title: `S${order}`,
        learningTargetId: lt,
        sortOrder: order,
      })
      .returning();
    if (lt === lt4.id) ids.lt4Section = section.id;
    for (let i = 0; i < n; i++) {
      const qid = await question(lt, `test ${order}.${i}`);
      ids.test.push(qid);
      await db
        .insert(schema.assessmentQuestions)
        .values({ sectionId: section.id, questionId: qid, sortOrder: i });
    }
  }
  const [pool] = await db
    .insert(schema.questionPools)
    .values({ ownerId: t.id, courseId: course.id, name: "Bio U2.LT4 Retake Pool" })
    .returning();
  ids.retakePool = pool.id;
  await db.insert(schema.poolTargets).values({ poolId: pool.id, learningTargetId: lt4.id });
  for (let i = 0; i < 24; i++) {
    const qid = await question(lt4.id, `retake ${i}`, (i % 5) + 1);
    ids.pool.push(qid);
    await db.insert(schema.poolQuestions).values({ poolId: pool.id, questionId: qid });
  }
  const [asg] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      assessmentId: assessment.id,
      classId: cls.id,
      attemptsAllowed: 2,
      retakeThreshold: 80,
      reviewMode: "auto",
      optionalRetakes: true,
    })
    .returning();
  ids.assignment = asg.id;
});

async function answer(attemptId: string, wrong: number) {
  const attempt = (await db.query.attempts.findFirst({
    where: eq(schema.attempts.id, attemptId),
  }))!;
  let left = wrong;
  for (const s of attempt.questionSet) {
    const q = ids.q.get(s.questionId)!;
    const miss = s.learningTargetId === ids.lt4 && left > 0;
    if (miss) left--;
    await ok(saveAnswer(attemptId, q.id, { kind: "choice", optionId: miss ? q.wrong : q.right }));
  }
  return attempt.questionSet;
}

describe("a targeted retake drawn from a retake pool", () => {
  it("only the owning teacher sets a section's retake pool, from the assessment's course", async () => {
    asUser(ids.student, "student");
    expect(
      await setSectionRetakePool(ids.assessment, ids.lt4Section, ids.retakePool, 10)
    ).toMatchObject({ ok: false });
    asUser(ids.teacher, "teacher");
    expect(
      await setSectionRetakePool(ids.assessment, ids.lt4Section, ids.retakePool, 0)
    ).toMatchObject({ ok: false, status: 400 });
    await ok(setSectionRetakePool(ids.assessment, ids.lt4Section, ids.retakePool, 12));
    const sec = (await db.query.assessmentSections.findFirst({
      where: eq(schema.assessmentSections.id, ids.lt4Section),
    }))!;
    expect(sec).toMatchObject({ retakePoolId: ids.retakePool, retakeDrawCount: 12 });
    // Back to automatic: no pool of its own.
    await ok(setSectionRetakePool(ids.assessment, ids.lt4Section, null, 10));
  });

  it("with nothing set, a section uses its target's retake pool automatically (10 questions)", async () => {
    const detail = (await getAssessmentDetail(ids.assessment))!;
    const [lt1Section, lt4Section] = detail.sections;
    expect(lt4Section.retake).toMatchObject({
      poolId: ids.retakePool,
      poolName: "Bio U2.LT4 Retake Pool",
      drawCount: 10,
      size: 24,
      auto: true,
    });
    expect(lt1Section.retake).toBeNull(); // no retake pool for LT1: its retake repeats the section
  });

  it("attempt 1 is the test itself: 100% on LT1, 14/20 on LT4 → LT4 required, LT1 optional", async () => {
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    ids.attempt1 = attemptId;
    const served = await answer(attemptId, 6);
    expect(served.map((q) => q.questionId).sort()).toEqual([...ids.test].sort());
    expect(await ok(submitAttempt(attemptId))).toMatchObject({
      totalEarned: 18,
      totalPossible: 24,
    });
    const status = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(status.plan).toMatchObject({ required: [ids.lt4], optional: [ids.lt1] });
  });

  it("after corrections, the retake is 10 fresh LT4 questions from the pool; 9/10 counts as 18/20", async () => {
    asUser(ids.student, "student");
    const missed = (
      await db.select().from(schema.responses).where(eq(schema.responses.attemptId, ids.attempt1))
    )
      .filter((r) => r.isCorrect === false)
      .map((r) => r.questionId);
    for (const q of missed)
      await ok(
        saveCorrection(ids.attempt1, q, {
          correctAnswer: "Right",
          explanation: "I mixed up the two molecules. The right one matches the structure shown.",
        })
      );
    await ok(submitCorrections(ids.attempt1));
    expect((await getRetakeStatus(ids.assignment, ids.student))!.plan.canStart).toBe(true);

    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    const served = await answer(attemptId, 1);
    expect(served).toHaveLength(10);
    expect(served.every((q) => ids.pool.includes(q.questionId))).toBe(true);
    expect(served.every((q) => q.learningTargetId === ids.lt4)).toBe(true);
    expect(await ok(submitAttempt(attemptId))).toMatchObject({ totalEarned: 9, totalPossible: 10 });

    const [final] = await listFinalScores(ids.assignment);
    expect(final).toMatchObject({
      totalEarned: 22,
      totalPossible: 24,
      targetsBelowThreshold: 0,
      tier: 1,
    });
  });

  it("every gradebook shows the first try beside the retake: overall 75% → 92%, LT4 70% → 90%", async () => {
    asUser(ids.teacher, "teacher");
    const [row] = await getGradebook(ids.assignment);
    expect(row.growth).toEqual({
      first: 75,
      now: 91.67,
      targets: [{ code: "U2.LT4", first: 70, now: 90 }],
    });
    const grid = await getMasteryGrid(ids.assignment);
    expect(grid.rows[0].firstPercents).toEqual({ [ids.lt4]: 70 });
    expect(grid.rows[0].percents).toEqual({ [ids.lt1]: 100, [ids.lt4]: 90 });
    const gb = (await getClassGradebook(ids.cls))!;
    const cell = gb.rows[0].cells.find((c) => c.assignmentId === ids.assignment)!;
    expect(cell.growth).toEqual(row.growth);
  });
});
