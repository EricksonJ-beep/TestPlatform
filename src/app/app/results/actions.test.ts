/**
 * Ticket 1.10: manual grading, overrides with a note, recomputed finals, the
 * grading queue, and the export rows. In-memory Postgres with real migrations.
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
import { createAttempt, finalizeAttempt } from "@/lib/attempts";
import { answerToText, correctAnswerText } from "@/lib/grading";
import {
  countPendingByAssignment,
  getAttemptReview,
  getClassReview,
  getGradebook,
  getItemAnalysis,
  getMasteryGrid,
  highestScoresRows,
  listGradingQueue,
} from "@/lib/queries/results";
import { getDashboardCounts, listRetakeRequests } from "@/lib/queries/dashboard";
import { requestRetake } from "@/app/student/actions";
import {
  clearManualScore,
  deleteAttempt,
  regradeAssignment,
  revokeAttemptUnlock,
  setManualScore,
  unlockNextAttempt,
} from "./actions";

const gradable = <T extends { questionId: string }>(i: T) => ({ ...i, id: i.questionId });

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  assignment: "",
  attempt: "",
  mc: "",
  mcRight: "",
  mcWrong: "",
  essay1: "",
  essay2: "",
  fill: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

beforeAll(async () => {
  const [t, o, s1, s2] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
      {
        email: "maya@s",
        passwordHash: "x",
        role: "student",
        firstName: "Maya",
        lastName: "Rivera",
      },
      {
        email: "ava@s",
        passwordHash: "x",
        role: "student",
        firstName: "Ava",
        lastName: "Peterson",
      },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: o.id, s1: s1.id, s2: s2.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "A&P" })
    .returning();
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: course.id, code: "U1", title: "Unit 1" })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P1" })
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: s1.id },
    { classId: cls.id, studentId: s2.id },
  ]);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  const [mc] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "multiple_choice",
      stem: "Powerhouse?",
      points: 2,
      explanation: "ATP is made in mitochondria.",
    })
    .returning();
  const [right, wrong] = await db
    .insert(schema.questionOptions)
    .values([
      { questionId: mc.id, content: "mitochondria", isCorrect: true, sortOrder: 0 },
      { questionId: mc.id, content: "ribosome", isCorrect: false, sortOrder: 1 },
    ])
    .returning();
  const [e1, e2] = await db
    .insert(schema.questions)
    .values([
      {
        bankId: bank.id,
        ownerId: t.id,
        type: "extended_response",
        stem: "Describe homeostasis.",
        points: 5,
        grading: "manual",
      },
      {
        bankId: bank.id,
        ownerId: t.id,
        type: "extended_response",
        stem: "Describe the membrane.",
        points: 5,
        grading: "manual",
      },
    ])
    .returning();
  const [fill] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "fill_blank",
      stem: "Sugar in RNA?",
      points: 1,
      gradingConfig: { acceptedAnswers: ["ribose"] },
    })
    .returning();
  Object.assign(ids, {
    mc: mc.id,
    mcRight: right.id,
    mcWrong: wrong.id,
    essay1: e1.id,
    essay2: e2.id,
    fill: fill.id,
  });
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "formative",
      title: "Unit 1 test",
      isPublished: true,
    })
    .returning();
  const [sec] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "U1", learningTargetId: lt.id })
    .returning();
  await db.insert(schema.assessmentQuestions).values([
    { sectionId: sec.id, questionId: mc.id, sortOrder: 0 },
    { sectionId: sec.id, questionId: e1.id, sortOrder: 1 },
    { sectionId: sec.id, questionId: e2.id, sortOrder: 2 },
    { sectionId: sec.id, questionId: fill.id, sortOrder: 3 },
  ]);
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id, attemptsAllowed: 3 })
    .returning();
  ids.assignment = asg.id;

  // Maya takes it: MC wrong, both essays answered, fill blank right.
  const { attemptId } = await createAttempt({ assignmentId: asg.id, studentId: s1.id });
  ids.attempt = attemptId;
  await db.insert(schema.responses).values([
    { attemptId, questionId: mc.id, answer: { kind: "choice", optionId: wrong.id } },
    {
      attemptId,
      questionId: e1.id,
      answer: { kind: "text", text: "Keeping the body's internal conditions steady." },
    },
    {
      attemptId,
      questionId: e2.id,
      answer: { kind: "text", text: "A phospholipid bilayer with proteins." },
    },
    { attemptId, questionId: fill.id, answer: { kind: "text", text: "Ribose" } },
  ]);
  await finalizeAttempt(attemptId);
});

describe("after submit", () => {
  it("the attempt is 'submitted' with two essays pending; the queue and counts show them", async () => {
    const a = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, ids.attempt) }))!;
    expect(a).toMatchObject({ status: "submitted", score: 1, maxScore: 13 });
    const queue = await listGradingQueue(ids.teacher);
    expect(queue.map((q) => q.stem)).toEqual(["Describe homeostasis.", "Describe the membrane."]);
    expect(queue[0]).toMatchObject({ studentName: "Maya Rivera", points: 5, attemptNumber: 1 });
    expect(await listGradingQueue(ids.other)).toHaveLength(0);
    expect((await countPendingByAssignment(ids.teacher)).get(ids.assignment)).toBe(2);
    const book = await getGradebook(ids.assignment);
    expect(book.map((r) => r.lastName)).toEqual(["Peterson", "Rivera"]);
    expect(book[1].attempts[0]).toMatchObject({ number: 1, pendingManual: 2, score: 1 });
    expect(book[0].attempts).toHaveLength(0);
  });

  it("the review shows each answer against the key", async () => {
    const review = (await getAttemptReview(ids.attempt))!;
    expect(review.student.lastName).toBe("Rivera");
    const mc = review.items.find((i) => i.questionId === ids.mc)!;
    expect(answerToText(gradable(mc), mc.response!.answer)).toBe("ribosome");
    expect(correctAnswerText(gradable(mc))).toBe("mitochondria");
    expect(mc.response).toMatchObject({ autoScore: 0, isCorrect: false });
    const fill = review.items.find((i) => i.questionId === ids.fill)!;
    expect(correctAnswerText(gradable(fill))).toBe("ribose");
    expect(fill.response).toMatchObject({ autoScore: 1, isCorrect: true });
    expect(review.perTarget[0]).toMatchObject({ code: "U1", pointsEarned: 1, pointsPossible: 13 });
  });
});

describe("manual grading and overrides", () => {
  it("only the owning teacher may grade; students and other teachers get 403", async () => {
    asUser(ids.other, "teacher");
    await fails(setManualScore(ids.attempt, ids.essay1, fd({ points: "5" })), 403);
    asUser(ids.s1, "student");
    await fails(setManualScore(ids.attempt, ids.essay1, fd({ points: "5" })), 403);
  });

  it("grading two essays moves the attempt to graded and updates totals and the final score", async () => {
    asUser(ids.teacher, "teacher");
    await fails(setManualScore(ids.attempt, ids.essay1, fd({ points: "7" })), 400); // over max
    await fails(
      setManualScore(ids.attempt, "00000000-0000-0000-0000-000000000000", fd({ points: "1" })),
      404
    );
    const r1 = await ok(
      setManualScore(
        ids.attempt,
        ids.essay1,
        fd({ points: "4", note: "Missed the set point idea." })
      )
    );
    expect(r1).toMatchObject({ totalEarned: 5, totalPossible: 13, pendingManual: 1 });
    const r2 = await ok(setManualScore(ids.attempt, ids.essay2, fd({ points: "5" })));
    expect(r2).toMatchObject({ totalEarned: 10, pendingManual: 0 });
    const a = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, ids.attempt) }))!;
    expect(a.status).toBe("graded");
    expect(a.score).toBe(10);
    const resp = await db.query.responses.findFirst({
      where: and(
        eq(schema.responses.attemptId, ids.attempt),
        eq(schema.responses.questionId, ids.essay1)
      ),
    });
    expect(resp).toMatchObject({
      manualScore: 4,
      graderNote: "Missed the set point idea.",
      gradedBy: ids.teacher,
    });
    expect(await listGradingQueue(ids.teacher)).toHaveLength(0);
    const [final] = await db
      .select()
      .from(schema.assignmentFinalScores)
      .where(eq(schema.assignmentFinalScores.studentId, ids.s1));
    expect(final).toMatchObject({ totalEarned: 10, totalPossible: 13 });
  });

  it("an override with a note replaces an auto score; clearing it restores the auto score", async () => {
    asUser(ids.teacher, "teacher");
    const r = await ok(
      setManualScore(
        ids.attempt,
        ids.mc,
        fd({ points: "2", note: "Accepted: the stem was ambiguous." })
      )
    );
    expect(r.totalEarned).toBe(12);
    let review = (await getAttemptReview(ids.attempt))!;
    let mc = review.items.find((i) => i.questionId === ids.mc)!;
    expect(mc.response).toMatchObject({
      autoScore: 0,
      manualScore: 2,
      graderNote: "Accepted: the stem was ambiguous.",
    });
    const [final] = await db
      .select()
      .from(schema.assignmentFinalScores)
      .where(eq(schema.assignmentFinalScores.studentId, ids.s1));
    expect(final.totalEarned).toBe(12);

    const back = await ok(clearManualScore(ids.attempt, ids.mc));
    expect(back.totalEarned).toBe(10);
    review = (await getAttemptReview(ids.attempt))!;
    mc = review.items.find((i) => i.questionId === ids.mc)!;
    expect(mc.response).toMatchObject({ autoScore: 0, manualScore: null, graderNote: null });
  });

  it("an in-progress attempt can't be graded", async () => {
    const { attemptId } = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s2 });
    asUser(ids.teacher, "teacher");
    await fails(setManualScore(attemptId, ids.essay1, fd({ points: "1" })), 409);
  });

  it("export rows: one per enrolled student, highest score, blank for no finished attempt", async () => {
    const rows = await highestScoresRows(ids.assignment);
    expect(rows).toEqual([
      expect.objectContaining({ lastName: "Peterson", score: null, maxScore: null, attempts: 0 }),
      expect.objectContaining({
        lastName: "Rivera",
        firstName: "Maya",
        email: "maya@s",
        score: 10,
        maxScore: 13,
        attempts: 1,
      }),
    ]);
  });

  it("mastery grid: one column per target, best percent per student, blank when not started", async () => {
    const grid = await getMasteryGrid(ids.assignment);
    expect(grid.targets.map((t) => t.code)).toEqual(["U1"]);
    const [ava, maya] = grid.rows;
    expect(ava).toMatchObject({ lastName: "Peterson", percents: {}, overall: null });
    expect(maya.lastName).toBe("Rivera");
    expect(maya.percents[grid.targets[0].id]).toBeCloseTo((10 / 13) * 100, 1);
    expect(maya.overall).toBeCloseTo((10 / 13) * 100, 1);
  });

  it("item analysis: the missed MC is 0 of 1, full-credit essays and the fill blank count as correct", async () => {
    const items = await getItemAnalysis(ids.assignment);
    const by = new Map(items.map((i) => [i.questionId, i]));
    expect(by.get(ids.mc)).toMatchObject({ answered: 1, correct: 0, rate: 0, targetCode: "U1" });
    expect(by.get(ids.fill)).toMatchObject({ answered: 1, correct: 1, rate: 1 });
    // essay1 was graded 4/5 (partial), essay2 5/5.
    expect(by.get(ids.essay1)).toMatchObject({ answered: 1, correct: 0 });
    expect(by.get(ids.essay2)).toMatchObject({ answered: 1, correct: 1 });
  });
});

describe("regrade", () => {
  it("re-runs auto grading with the current key, keeps manual scores, and is owner-only", async () => {
    asUser(ids.other, "teacher");
    await fails(regradeAssignment(ids.assignment), 403);
    asUser(ids.s1, "student");
    await fails(regradeAssignment(ids.assignment), 403);

    // The key changes: Maya's "wrong" MC option becomes the right one.
    await db
      .update(schema.questionOptions)
      .set({ isCorrect: true })
      .where(eq(schema.questionOptions.id, ids.mcWrong));
    await db
      .update(schema.questionOptions)
      .set({ isCorrect: false })
      .where(eq(schema.questionOptions.id, ids.mcRight));
    const before = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, ids.attempt),
    }))!;
    asUser(ids.teacher, "teacher");
    const r = await regradeAssignment(ids.assignment);
    expect(r).toMatchObject({ ok: true, data: { regraded: 1 } });
    const after = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, ids.attempt),
    }))!;
    const mc = (await db.query.responses.findFirst({
      where: and(
        eq(schema.responses.attemptId, ids.attempt),
        eq(schema.responses.questionId, ids.mc)
      ),
    }))!;
    expect(mc.isCorrect).toBe(true);
    expect(mc.autoScore).toBeGreaterThan(0);
    expect(after.score).toBe((before.score ?? 0) + (mc.autoScore ?? 0));
    const essay1 = (await db.query.responses.findFirst({
      where: and(
        eq(schema.responses.attemptId, ids.attempt),
        eq(schema.responses.questionId, ids.essay1)
      ),
    }))!;
    expect(essay1.manualScore).toBe(4); // manual grading survives a regrade
  });
});

describe("teacher unlocks (retakes need my OK)", () => {
  it("unlocks the next attempt for one student, shows in the gradebook, and can be taken back", async () => {
    await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: true })
      .where(eq(schema.assignments.id, ids.assignment));
    asUser(ids.other, "teacher");
    await fails(unlockNextAttempt(ids.assignment, ids.s1), 403);
    asUser(ids.s1, "student");
    await fails(unlockNextAttempt(ids.assignment, ids.s1), 403);
    asUser(ids.teacher, "teacher");
    // Ava has no attempt yet: the first never needs an unlock.
    await fails(unlockNextAttempt(ids.assignment, ids.s2), 409);
    // Maya finished attempt 1: unlock opens attempt 2, twice is harmless.
    expect(await ok(unlockNextAttempt(ids.assignment, ids.s1))).toEqual({ attemptNumber: 2 });
    expect(await ok(unlockNextAttempt(ids.assignment, ids.s1))).toEqual({ attemptNumber: 2 });
    let rows = await getGradebook(ids.assignment);
    expect(rows.find((r) => r.studentId === ids.s1)?.unlockedThrough).toBe(2);
    expect(rows.find((r) => r.studentId === ids.s2)?.unlockedThrough).toBe(0);
    await ok(revokeAttemptUnlock(ids.assignment, ids.s1));
    rows = await getGradebook(ids.assignment);
    expect(rows.find((r) => r.studentId === ids.s1)?.unlockedThrough).toBe(0);
  });

  it("a student's request queues on the dashboard until the teacher approves or declines it", async () => {
    asUser(ids.s2, "student");
    await fails(requestRetake(ids.assignment), 409); // Ava hasn't taken it yet
    asUser(ids.s1, "student");
    expect(await ok(requestRetake(ids.assignment))).toEqual({ attemptNumber: 2 });
    expect(await ok(requestRetake(ids.assignment))).toEqual({ attemptNumber: 2 }); // idempotent
    // A request unlocks nothing on its own.
    let row = (await getGradebook(ids.assignment)).find((r) => r.studentId === ids.s1)!;
    expect(row.unlockedThrough).toBe(0);
    expect(row.requestedAt).toBeInstanceOf(Date);
    expect((await getDashboardCounts(ids.teacher)).retakeRequests).toBe(1);
    expect((await getDashboardCounts(ids.other)).retakeRequests).toBe(0);
    const [req] = await listRetakeRequests(ids.teacher);
    expect(req).toMatchObject({
      assignmentId: ids.assignment,
      studentId: ids.s1,
      lastName: "Rivera",
      title: "Unit 1 test",
      className: "P1",
      attemptNumber: 2,
    });
    expect(await listRetakeRequests(ids.other)).toHaveLength(0);
    // Decline clears it; a fresh request then approved becomes the unlock.
    asUser(ids.teacher, "teacher");
    await ok(revokeAttemptUnlock(ids.assignment, ids.s1));
    expect(await listRetakeRequests(ids.teacher)).toHaveLength(0);
    asUser(ids.s1, "student");
    await ok(requestRetake(ids.assignment));
    asUser(ids.teacher, "teacher");
    expect(await ok(unlockNextAttempt(ids.assignment, ids.s1))).toEqual({ attemptNumber: 2 });
    row = (await getGradebook(ids.assignment)).find((r) => r.studentId === ids.s1)!;
    expect(row.unlockedThrough).toBe(2);
    expect(row.requestedAt).toBeNull();
    expect((await getDashboardCounts(ids.teacher)).retakeRequests).toBe(0);
    // With the setting off, there is nothing to request.
    await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: false })
      .where(eq(schema.assignments.id, ids.assignment));
    asUser(ids.s1, "student");
    await fails(requestRetake(ids.assignment), 409);
  });
});

describe("delete attempt", () => {
  it("only the owning teacher may delete; students and other teachers get 403, unknown ids 404", async () => {
    const { attemptId } = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s1 });
    asUser(ids.other, "teacher");
    await fails(deleteAttempt(attemptId), 403);
    asUser(ids.s1, "student");
    await fails(deleteAttempt(attemptId), 403);
    asUser(ids.teacher, "teacher");
    await fails(deleteAttempt("00000000-0000-0000-0000-000000000000"), 404);
    expect(
      await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) })
    ).toBeTruthy();
    await ok(deleteAttempt(attemptId));
  });

  it("deleting an accidental in-progress attempt removes it and its answers; the finished attempt still counts", async () => {
    // Maya starts attempt 2 by accident and types one answer.
    const { attemptId, number } = await createAttempt({
      assignmentId: ids.assignment,
      studentId: ids.s1,
    });
    expect(number).toBe(2);
    await db.insert(schema.responses).values({
      attemptId,
      questionId: ids.fill,
      answer: { kind: "text", text: "oops" },
    });
    asUser(ids.teacher, "teacher");
    const r = await ok(deleteAttempt(attemptId));
    expect(r).toEqual({ assignmentId: ids.assignment, number: 2 });
    expect(
      await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) })
    ).toBeUndefined();
    expect(
      await db.select().from(schema.responses).where(eq(schema.responses.attemptId, attemptId))
    ).toHaveLength(0);
    const book = await getGradebook(ids.assignment);
    const maya = book.find((s) => s.studentId === ids.s1)!;
    expect(maya.attempts.map((a) => a.number)).toEqual([1]);
    expect(maya.final).toBeTruthy();
    // The next start is attempt 2 again, not 3.
    const again = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s1 });
    expect(again.number).toBe(2);
    await ok(deleteAttempt(again.attemptId));
  });

  it("deleting a middle attempt closes the numbering gap", async () => {
    const a2 = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s1 });
    const a3 = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s1 });
    expect([a2.number, a3.number]).toEqual([2, 3]);
    asUser(ids.teacher, "teacher");
    await ok(deleteAttempt(a2.attemptId));
    const moved = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, a3.attemptId),
    }))!;
    expect(moved.number).toBe(2);
    await ok(deleteAttempt(a3.attemptId));
  });

  it("deleting the only finished attempt clears the final score and the gradebook shows not started", async () => {
    asUser(ids.teacher, "teacher");
    await ok(deleteAttempt(ids.attempt));
    const finals = await db
      .select()
      .from(schema.assignmentFinalScores)
      .where(eq(schema.assignmentFinalScores.studentId, ids.s1));
    expect(finals).toHaveLength(0);
    const book = await getGradebook(ids.assignment);
    const maya = book.find((s) => s.studentId === ids.s1)!;
    expect(maya.attempts).toHaveLength(0);
    expect(maya.final).toBeNull();
    expect(await listGradingQueue(ids.teacher)).toHaveLength(0);
    const rows = await highestScoresRows(ids.assignment);
    expect(rows.find((r) => r.lastName === "Rivera")).toMatchObject({ score: null, attempts: 0 });
  });
});

describe("review with the class", () => {
  it("counts what the class picked per option and groups typed answers", async () => {
    // Fresh attempts for both students: Maya picks the wrong option, Ava the right one; both type the fill-in.
    const maya = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s1 });
    const ava = await createAttempt({ assignmentId: ids.assignment, studentId: ids.s2 });
    await db.insert(schema.responses).values([
      {
        attemptId: maya.attemptId,
        questionId: ids.mc,
        answer: { kind: "choice", optionId: ids.mcWrong },
      },
      { attemptId: maya.attemptId, questionId: ids.fill, answer: { kind: "text", text: "Ribose" } },
      {
        attemptId: ava.attemptId,
        questionId: ids.mc,
        answer: { kind: "choice", optionId: ids.mcRight },
      },
      {
        attemptId: ava.attemptId,
        questionId: ids.fill,
        answer: { kind: "text", text: "deoxyribose" },
      },
    ]);
    await finalizeAttempt(maya.attemptId);
    await finalizeAttempt(ava.attemptId);
    const review = await getClassReview(ids.assignment);
    const mc = review.find((r) => r.questionId === ids.mc)!;
    // (An earlier regrade test swapped which option is keyed correct, so check by id.)
    expect(mc.options.find((o) => o.id === ids.mcRight)?.picked).toBe(1);
    expect(mc.options.find((o) => o.id === ids.mcWrong)?.picked).toBe(1);
    expect(mc.options).toHaveLength(2);
    expect(mc.blank).toBe(0);
    const fill = review.find((r) => r.questionId === ids.fill)!;
    expect(fill.options).toEqual([]);
    expect(fill.answers).toEqual([
      { text: "Ribose", count: 1, correct: true },
      { text: "deoxyribose", count: 1, correct: false },
    ]);
    expect(fill.keyText).toMatch(/ribose/i);
    const essay = review.find((r) => r.questionId === ids.essay1)!;
    expect(essay.blank).toBe(2); // nobody wrote anything
    expect(review.map((r) => r.questionId)).toEqual([ids.mc, ids.essay1, ids.essay2, ids.fill]);
  });
});
