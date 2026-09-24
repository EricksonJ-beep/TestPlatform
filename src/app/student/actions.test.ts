/**
 * Ticket 1.9: a student starts, autosaves, and submits an attempt; the server
 * builds the set, enforces window/code/attempts/deadline/ownership, grades with
 * the pure library, and writes every score.
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
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getRunnerPayload, listAssignmentAttempts, listFinalScores } from "@/lib/queries/attempts";
import { recordTabSwitch, saveAnswer, setFlag, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  outsider: "",
  cls: "",
  assignment: "",
  lt1: "",
  lt2: "",
  mc: [] as { id: string; right: string; wrong: string }[], // 4 MC on LT1 (2 pts each)
  numeric: "", // LT2, 3 pts
  fill: "", // LT2, 1 pt
  extended: "", // LT2, 4 pts, manual
  attempt: "",
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
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

beforeAll(async () => {
  const [t, o, s1, s2, out] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
      { email: "s1@s", passwordHash: "x", role: "student", firstName: "Maya", lastName: "Rivera" },
      { email: "s2@s", passwordHash: "x", role: "student", firstName: "Dylan", lastName: "K" },
      { email: "out@s", passwordHash: "x", role: "student", firstName: "Out", lastName: "Sider" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: o.id, s1: s1.id, s2: s2.id, outsider: out.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "LT1", title: "One", sortOrder: 1 },
      { courseId: course.id, code: "LT2", title: "Two", sortOrder: 2 },
    ])
    .returning();
  ids.lt1 = lt1.id;
  ids.lt2 = lt2.id;
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P3" })
    .returning();
  ids.cls = cls.id;
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: s1.id, extraTimePercent: 50 },
    { classId: cls.id, studentId: s2.id },
  ]);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  for (let i = 1; i <= 4; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({
        bankId: bank.id,
        ownerId: t.id,
        type: "multiple_choice",
        stem: `MC ${i}`,
        points: 2,
      })
      .returning();
    const [right, wrong] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    ids.mc.push({ id: q.id, right: right.id, wrong: wrong.id });
  }
  const [num] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "numeric",
      stem: "Speed?",
      points: 3,
      gradingConfig: { mode: "tolerance", answer: 15, tolerance: 0.5, unit: "m/s" },
    })
    .returning();
  ids.numeric = num.id;
  const [fill] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "fill_blank",
      stem: "Powerhouse?",
      points: 1,
      gradingConfig: { acceptedAnswers: ["mitochondria", "mitochondrion"] },
    })
    .returning();
  ids.fill = fill.id;
  const [ext] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "extended_response",
      stem: "Explain.",
      points: 4,
      grading: "manual",
    })
    .returning();
  ids.extended = ext.id;

  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "summative",
      title: "Unit test",
      isPublished: true,
      randomizeOptions: true,
    })
    .returning();
  const [sec1, sec2] = await db
    .insert(schema.assessmentSections)
    .values([
      { assessmentId: assessment.id, title: "LT1", learningTargetId: lt1.id, sortOrder: 0 },
      { assessmentId: assessment.id, title: "LT2", learningTargetId: lt2.id, sortOrder: 1 },
    ])
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values([
      ...ids.mc.map((q, i) => ({ sectionId: sec1.id, questionId: q.id, sortOrder: i })),
      { sectionId: sec2.id, questionId: num.id, sortOrder: 0 },
      { sectionId: sec2.id, questionId: fill.id, sortOrder: 1 },
      { sectionId: sec2.id, questionId: ext.id, sortOrder: 2, points: 5 },
    ]);
  const [asg] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      assessmentId: assessment.id,
      classId: cls.id,
      accessCode: "AB3K9Q",
      timeLimitMinutes: 20,
      attemptsAllowed: 2,
      retakeThreshold: 80,
    })
    .returning();
  ids.assignment = asg.id;
});

describe("startAttempt", () => {
  it("enforces enrollment, role, and the access code", async () => {
    asUser(ids.outsider, "student");
    await fails(startAttempt(ids.assignment, "AB3K9Q"), 403);
    asUser(ids.teacher, "teacher");
    await fails(startAttempt(ids.assignment, "AB3K9Q"), 403);
    asUser(ids.s1, "student");
    await fails(startAttempt(ids.assignment, null), 400);
    await fails(startAttempt(ids.assignment, "WRONG"), 400);
  });

  it("builds the exact set with per-question targets and points, shuffles options, sets due_at with extra time", async () => {
    asUser(ids.s1, "student");
    const { attemptId, resumed } = await ok(startAttempt(ids.assignment, " ab3-k9q "));
    expect(resumed).toBe(false);
    ids.attempt = attemptId;
    const attempt = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, attemptId),
    }))!;
    expect(attempt.number).toBe(1);
    expect(attempt.questionSet).toHaveLength(7);
    expect(attempt.questionSet.filter((q) => q.learningTargetId === ids.lt1)).toHaveLength(4);
    expect(attempt.questionSet.find((q) => q.questionId === ids.extended)?.points).toBe(5);
    expect(
      attempt.questionSet.find((q) => q.questionId === ids.mc[0].id)?.optionOrder
    ).toHaveLength(2);
    // 20 min × 1.5 (50% extra time) = 30 min
    expect(attempt.dueAt!.getTime() - attempt.startedAt.getTime()).toBe(30 * 60_000);

    // The student payload carries no correct flags or explanations.
    const payload = (await getRunnerPayload(attemptId))!;
    expect(payload.questions).toHaveLength(7);
    expect(JSON.stringify(payload)).not.toMatch(
      /isCorrect|correctPosition|matchText|acceptedAnswers|explanation/
    );
    expect(payload.questions[0].target).toEqual({ code: "LT1", title: "One" });
    expect(payload.questions.find((q) => q.id === ids.numeric)?.unit).toBe("m/s");
    expect(payload.assignment.teacherName).toBe("Jon Erickson");
  });

  it("resumes the open attempt instead of starting another", async () => {
    asUser(ids.s1, "student");
    const r = await ok(startAttempt(ids.assignment, "AB3K9Q"));
    expect(r).toEqual({ attemptId: ids.attempt, resumed: true });
  });
});

describe("saveAnswer / setFlag / tab switches", () => {
  it("saves and overwrites answers for the owner only; validates shape and membership", async () => {
    asUser(ids.s1, "student");
    await ok(saveAnswer(ids.attempt, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].right }));
    await ok(saveAnswer(ids.attempt, ids.mc[1].id, { kind: "choice", optionId: ids.mc[1].wrong }));
    await ok(saveAnswer(ids.attempt, ids.mc[1].id, { kind: "choice", optionId: ids.mc[1].right })); // changed mind
    await ok(saveAnswer(ids.attempt, ids.mc[2].id, { kind: "choice", optionId: ids.mc[2].wrong }));
    await ok(saveAnswer(ids.attempt, ids.numeric, { kind: "text", text: "15.3 m/s" }));
    await ok(saveAnswer(ids.attempt, ids.fill, { kind: "text", text: "  Mitochondria " }));
    await ok(saveAnswer(ids.attempt, ids.extended, { kind: "text", text: "Because of osmosis." }));
    await ok(setFlag(ids.attempt, ids.mc[3].id, true));
    await fails(saveAnswer(ids.attempt, ids.mc[0].id, { kind: "bogus" }), 400);
    await fails(
      saveAnswer(ids.attempt, "00000000-0000-0000-0000-000000000000", { kind: "text", text: "x" }),
      400
    );
    expect(await ok(recordTabSwitch(ids.attempt))).toEqual({ tabSwitches: 1 });

    asUser(ids.s2, "student");
    await fails(
      saveAnswer(ids.attempt, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].wrong }),
      403
    );
    asUser(ids.teacher, "teacher");
    await fails(
      saveAnswer(ids.attempt, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].wrong }),
      403
    );
    await fails(submitAttempt(ids.attempt), 403);

    const payload = (await getRunnerPayload(ids.attempt))!;
    expect(payload.responses.find((r) => r.questionId === ids.mc[1].id)?.answer).toEqual({
      kind: "choice",
      optionId: ids.mc[1].right,
    });
    expect(payload.responses.find((r) => r.questionId === ids.mc[3].id)?.flagged).toBe(true);
    expect(payload.attempt.tabSwitches).toBe(1);
  });

  it("rejects saves after the deadline (plus grace)", async () => {
    asUser(ids.s1, "student");
    const past = new Date(Date.now() - 60_000);
    await db
      .update(schema.attempts)
      .set({ dueAt: past })
      .where(eq(schema.attempts.id, ids.attempt));
    await fails(
      saveAnswer(ids.attempt, ids.mc[3].id, { kind: "choice", optionId: ids.mc[3].right }),
      409
    );
    await db
      .update(schema.attempts)
      .set({ dueAt: new Date(Date.now() + 10 * 60_000) })
      .where(eq(schema.attempts.id, ids.attempt));
  });
});

describe("submitAttempt", () => {
  it("grades every served question (blank = wrong), writes attempt, target, and final scores", async () => {
    asUser(ids.s1, "student");
    const r = await ok(submitAttempt(ids.attempt));
    // MC: 2 right of 4 → 4/8. numeric 15.3 within ±0.5 → 3/3. fill → 1/1. extended pending (0 for now) of 5. MC4 blank → 0.
    expect(r).toMatchObject({ totalEarned: 8, totalPossible: 17, pendingManual: 1 });
    expect(r.percent).toBeCloseTo(47.06, 1);
    await fails(submitAttempt(ids.attempt), 409);
    await fails(
      saveAnswer(ids.attempt, ids.mc[3].id, { kind: "choice", optionId: ids.mc[3].right }),
      409
    );

    const attempt = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, ids.attempt),
    }))!;
    expect(attempt.status).toBe("submitted"); // one manual question pending
    expect(attempt.score).toBe(8);
    const blank = await db.query.responses.findFirst({
      where: and(
        eq(schema.responses.attemptId, ids.attempt),
        eq(schema.responses.questionId, ids.mc[3].id)
      ),
    });
    expect(blank).toMatchObject({ answer: null, autoScore: 0, isCorrect: false, flagged: true });
    const targets = await db
      .select()
      .from(schema.attemptTargetScores)
      .where(eq(schema.attemptTargetScores.attemptId, ids.attempt));
    expect(targets.find((t) => t.learningTargetId === ids.lt1)).toMatchObject({
      pointsEarned: 4,
      pointsPossible: 8,
      percent: 50,
    });
    expect(targets.find((t) => t.learningTargetId === ids.lt2)).toMatchObject({
      pointsEarned: 4,
      pointsPossible: 9,
    });
    const [final] = await listFinalScores(ids.assignment);
    expect(final).toMatchObject({
      studentId: ids.s1,
      totalEarned: 8,
      totalPossible: 17,
      targetsBelowThreshold: 2,
      tier: 2,
    });

    const rows = await listAssignmentAttempts(ids.assignment);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lastName: "Rivera",
      number: 1,
      percent: attempt.percent,
      tabSwitches: 1,
    });
  });

  it("a second attempt avoids nothing here (fixed items) but counts; a third is refused", async () => {
    asUser(ids.s1, "student");
    // A 24-hour wait blocks the retake until a day after the last submission.
    await db
      .update(schema.assignments)
      .set({ retakeWaitHours: 24 })
      .where(eq(schema.assignments.id, ids.assignment));
    const blocked = await startAttempt(ids.assignment, "AB3K9Q");
    expect(blocked).toMatchObject({ ok: false, status: 403 });
    expect(blocked.ok ? "" : blocked.error).toMatch(/next attempt opens/);
    const [home] = await listStudentAssignments(ids.s1);
    expect(home.nextAttemptAt).toBeInstanceOf(Date);
    await db
      .update(schema.assignments)
      .set({ retakeWaitHours: 0 })
      .where(eq(schema.assignments.id, ids.assignment));
    // Ticket 1.11: no retake until the missed LT1 items (MC3 wrong, MC4 blank) are corrected. Auto review approves at submit.
    const locked = await startAttempt(ids.assignment, "AB3K9Q");
    expect(locked).toMatchObject({ ok: false, status: 403 });
    expect(locked.ok ? "" : locked.error).toMatch(/Finish your corrections/);
    const why = {
      correctAnswer: "Right",
      explanation:
        "I rushed and picked the first option. The right one is the one that matches our notes.",
    };
    await ok(saveCorrection(ids.attempt, ids.mc[2].id, why));
    await ok(saveCorrection(ids.attempt, ids.mc[3].id, why));
    expect((await ok(submitCorrections(ids.attempt))).state).toBe("approved");
    const { attemptId } = await ok(startAttempt(ids.assignment, "AB3K9Q"));
    const a2 = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(a2.number).toBe(2);
    await ok(submitAttempt(attemptId));
    await fails(startAttempt(ids.assignment, "AB3K9Q"), 403);
    // Highest counts per target: attempt 1's LT1 (4/8) beats attempt 2's blank LT1 (0/8).
    const [final] = await listFinalScores(ids.assignment);
    expect(final).toMatchObject({ totalEarned: 8 });
  });

  it("an attempt past its deadline is auto-submitted when the student comes back", async () => {
    asUser(ids.s2, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, "AB3K9Q"));
    await db
      .update(schema.attempts)
      .set({ dueAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.attempts.id, attemptId));
    // Coming back finalizes the expired attempt; a blank attempt then needs corrections before attempt 2 (1.11).
    const next = await startAttempt(ids.assignment, "AB3K9Q");
    expect(next).toMatchObject({ ok: false, status: 403 });
    expect(next.ok ? "" : next.error).toMatch(/Finish your corrections on attempt 1/);
    const old = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(old.status).toBe("graded"); // a blank extended response is wrong, not pending;
    expect(old.submittedAt).toEqual(old.dueAt);
  });
});
