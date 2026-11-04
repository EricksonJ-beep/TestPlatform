/**
 * The practice check end to end (docs/relearning-revamp-plan.md, P1–P5, ticket R3), in-memory
 * Postgres with the real migrations and the real actions: it opens only after the relearning, deals
 * 5 from the Practice bank (never the quiz's bank) at 3 easy · 1 medium · 1 hard with at most one
 * true/false, keeps each first answer, shows Look back below 4 of 5, deals a fresh 5, and a pass
 * raises the quiz to 80 and unlocks the retake. After a low retake, the fresh check before attempt
 * 3. Relearning rows are written directly; their actions come with R4.
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
import { finalizeAttempt, recomputeFinalScore } from "@/lib/attempts";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getCorrectionScope } from "@/lib/queries/corrections";
import { getCheckPayload } from "@/lib/queries/practice-checks";
import { startAttempt } from "../actions";
import { saveCorrection, submitCorrections } from "../corrections/actions";
import { answerPracticeCheck, nextPracticeCheckRound, startPracticeCheck } from "./actions";

type Q = { id: string; right: string; wrong: string; bank: "quiz" | "practice"; type: string };
const ids = {
  teacher: "",
  ava: "",
  zed: "",
  lt1: "",
  quiz: "",
  q: new Map<string, Q>(),
  quizQ: [] as Q[],
};
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed up which particle moves in an ionic bond. The metal gives up its outer particles to the other atom.",
};

const as = (userId: string) => {
  state.session = { userId, role: "student", email: `${userId}@x`, firstName: "S", lastName: "T" };
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
  text: RegExp
) => {
  const r = await p;
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(text);
};
const final = async () =>
  (await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, ids.quiz),
      eq(schema.assignmentFinalScores.studentId, ids.ava)
    ),
  }))!;
const card = async () => (await listStudentAssignments(ids.ava)).find((a) => a.id === ids.quiz)!;

async function takeQuiz(right: number) {
  as(ids.ava);
  const { attemptId } = await ok(startAttempt(ids.quiz, null));
  await db.insert(schema.responses).values(
    ids.quizQ.map((q, i) => ({
      attemptId,
      questionId: q.id,
      answer: { kind: "choice" as const, optionId: i < right ? q.right : q.wrong },
    }))
  );
  await finalizeAttempt(attemptId);
  return attemptId;
}

/** Answer a round: the first `right` questions with the right option, the rest wrong. */
async function answerRound(roundId: string, right: number) {
  const round = (await db.query.practiceCheckRounds.findFirst({
    where: eq(schema.practiceCheckRounds.id, roundId),
  }))!;
  let last;
  for (const [i, s] of round.questionSet.entries()) {
    const q = ids.q.get(s.questionId)!;
    last = await ok(
      answerPracticeCheck(roundId, s.questionId, {
        kind: "choice",
        optionId: i < right ? q.right : q.wrong,
      })
    );
  }
  return { round, last: last! };
}
async function latestRoundId(checkId: string) {
  const rounds = await db
    .select({ id: schema.practiceCheckRounds.id, number: schema.practiceCheckRounds.number })
    .from(schema.practiceCheckRounds)
    .where(eq(schema.practiceCheckRounds.checkId, checkId));
  return rounds.sort((a, b) => b.number - a.number)[0].id;
}

beforeAll(async () => {
  const [t, ava, zed] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "2001@s", passwordHash: "x", role: "student", firstName: "Ava", lastName: "A" },
      { email: "2002@s", passwordHash: "x", role: "student", firstName: "Zed", lastName: "Z" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, ava: ava.id, zed: zed.id });
  const [ps] = await db
    .insert(schema.courses)
    .values({
      ownerId: t.id,
      name: "Physical Science",
      relearningPathFrom: new Date(Date.now() - 86_400_000),
    })
    .returning();
  const [lt1] = await db
    .insert(schema.learningTargets)
    .values({ courseId: ps.id, code: "U3.LT1", title: "Ionic bonds", sortOrder: 1 })
    .returning();
  ids.lt1 = lt1.id;
  const [quizBank, practiceBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t.id, courseId: ps.id, name: "U3 LT1 Quiz" },
      { ownerId: t.id, courseId: ps.id, name: "U3 LT1 Practice" },
    ])
    .returning();
  async function add(
    bank: "quiz" | "practice",
    difficulty: number,
    k: number,
    type: "multiple_choice" | "true_false" = "multiple_choice"
  ) {
    for (let i = 0; i < k; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: bank === "quiz" ? quizBank.id : practiceBank.id,
          ownerId: t.id,
          type,
          stem: `${bank} ${type} d${difficulty} #${i}`,
          points: 1,
          difficulty,
          explanation: "Electrons move from the metal to the nonmetal.",
        })
        .returning();
      await db
        .insert(schema.questionTargets)
        .values({ questionId: q.id, learningTargetId: lt1.id });
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          {
            questionId: q.id,
            content: type === "true_false" ? "True" : "Right",
            isCorrect: true,
            sortOrder: 0,
          },
          {
            questionId: q.id,
            content: type === "true_false" ? "False" : "Wrong",
            isCorrect: false,
            sortOrder: 1,
          },
        ])
        .returning();
      const item = { id: q.id, right: right.id, wrong: wrong.id, bank, type };
      ids.q.set(q.id, item);
      if (bank === "quiz") ids.quizQ.push(item);
    }
  }
  await add("quiz", 3, 5);
  await add("practice", 1, 8);
  await add("practice", 2, 4, "true_false");
  await add("practice", 3, 4);
  await add("practice", 5, 4);
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: ps.id, name: "PS 2nd", period: "2" })
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: ava.id },
    { classId: cls.id, studentId: zed.id },
  ]);
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: ps.id,
      type: "formative",
      title: "8.1 Ionic quiz",
      isPublished: true,
    })
    .returning();
  const [section] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "LT1", sortOrder: 0, learningTargetId: lt1.id })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values(ids.quizQ.map((q, j) => ({ sectionId: section.id, questionId: q.id, sortOrder: j })));
  const [asg] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      classId: cls.id,
      assessmentId: assessment.id,
      attemptsAllowed: 3,
      opensAt: new Date(Date.now() - 3 * 86_400_000),
    })
    .returning();
  ids.quiz = asg.id;
});

describe("the practice check on a 40% quiz", () => {
  let checkId = "";
  let round1: Awaited<ReturnType<typeof answerRound>>["round"];

  it("opens only after the relearning", async () => {
    const first = await takeQuiz(2);
    as(ids.ava);
    for (const questionId of (await getCorrectionScope(first))!.needed)
      await ok(saveCorrection(first, questionId, WHY));
    await ok(submitCorrections(first));
    await refused(startPracticeCheck(ids.quiz, "path", null), /Finish your relearning first/);

    await db.insert(schema.relearningPaths).values({
      assignmentId: ids.quiz,
      studentId: ids.ava,
      learningTargetId: ids.lt1,
      bundleId: crypto.randomUUID(),
      mode: "read",
      finishedAt: new Date(),
    });
    await recomputeFinalScore(ids.quiz, ids.ava);
    checkId = (await ok(startPracticeCheck(ids.quiz, "path", null))).checkId;
  });

  it("deals 5 Practice-bank questions: 3 easy, 1 medium, 1 hard, at most one true/false", async () => {
    const payload = (await getCheckPayload(checkId))!;
    expect(payload.questions).toHaveLength(5);
    expect(payload.check.passMark).toBe(4);
    const round = (await db.query.practiceCheckRounds.findFirst({
      where: eq(schema.practiceCheckRounds.checkId, checkId),
    }))!;
    expect(round.questionSet.map((q) => q.band)).toEqual([
      "easy",
      "easy",
      "easy",
      "medium",
      "hard",
    ]);
    const served = round.questionSet.map((s) => ids.q.get(s.questionId)!);
    expect(served.every((q) => q.bank === "practice")).toBe(true);
    expect(served.filter((q) => q.type === "true_false").length).toBeLessThanOrEqual(1);
    // The payload carries no answer key before a question is answered.
    expect(JSON.stringify(payload.questions)).not.toMatch(/isCorrect|explanation/);
  });

  it("keeps the first answer, and shows Look back below 4 of 5", async () => {
    const roundId = await latestRoundId(checkId);
    const { round, last } = await answerRound(roundId, 3);
    round1 = round;
    expect(last.round).toMatchObject({ finished: true, score: 3, passed: false });

    // A second answer to the same question changes nothing.
    const q0 = ids.q.get(round.questionSet[0].questionId)!;
    const again = await ok(
      answerPracticeCheck(roundId, q0.id, { kind: "choice", optionId: q0.wrong })
    );
    expect(again.alreadyAnswered).toBe(true);
    expect(again.feedback.isCorrect).toBe(true);

    const payload = (await getCheckPayload(checkId))!;
    expect(payload.round).toMatchObject({ finished: true, score: 3, passed: false });
    expect(payload.check.passed).toBe(false);
    expect((await final()).percent).toBe(40);
    expect((await card()).cycle).toBe("relearning");
  });

  it("deals a fresh 5 (no repeats), and passing raises the quiz to 80 and unlocks the retake", async () => {
    const { roundId } = await ok(nextPracticeCheckRound(checkId));
    const round2 = (await db.query.practiceCheckRounds.findFirst({
      where: eq(schema.practiceCheckRounds.id, roundId),
    }))!;
    expect(round2.number).toBe(2);
    const before = new Set(round1.questionSet.map((q) => q.questionId));
    expect(round2.questionSet.filter((q) => before.has(q.questionId))).toEqual([]);

    const { last } = await answerRound(roundId, 4);
    expect(last.round).toMatchObject({ finished: true, score: 4, passed: true });
    expect(await final()).toMatchObject({ percent: 80, basis: "relearning_path" });
    expect((await card()).cycle).toBe("retake_available");
    await refused(startPracticeCheck(ids.quiz, "path", null), /already passed/);
    await refused(nextPracticeCheckRound(checkId), /already passed/);
  });

  it("refuses another student", async () => {
    as(ids.zed);
    const roundId = await latestRoundId(checkId);
    const r = await answerPracticeCheck(roundId, round1.questionSet[0].questionId, null);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("asks for a fresh check before attempt 3 after a low retake (Q6)", async () => {
    await takeQuiz(3);
    as(ids.ava);
    await refused(
      startAttempt(ids.quiz, null),
      /Pass a new practice check on U3\.LT1 before attempt 3/
    );
    const { checkId: fresh } = await ok(startPracticeCheck(ids.quiz, "attempt", null));
    const check = (await db.query.practiceChecks.findFirst({
      where: eq(schema.practiceChecks.id, fresh),
    }))!;
    expect(check).toMatchObject({ purpose: "attempt", unlocksAttemptNumber: 3 });
    await answerRound(await latestRoundId(fresh), 5);
    expect((await ok(startAttempt(ids.quiz, null))).resumed).toBe(false);
  });
});
