/**
 * "Needs you" (Jon, Oct 13 2026, docs/dashboard-plan.md): everything waiting on the teacher
 * across all their courses, each row naming its course · period, "N things need you" equal to
 * the rows, and each one-click action clearing its row (Approve and Check off with an Undo;
 * leftover retake requests with Clear, owner only).
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
import { needsYouCounts, placeLabel } from "@/lib/needs-you";
import { getDashboardCounts, getNeedsYou, listPausedAttempts } from "@/lib/queries/dashboard";
import { verifyCompletion } from "./practice/actions";
import {
  clearRetakeRequest,
  letContinue,
  revokeAttemptUnlock,
  undoRetakeApproval,
  unlockNextAttempt,
} from "./results/actions";

const ids = {
  teacher: "",
  other: "",
  ava: "",
  ben: "",
  cal: "",
  noah: "",
  ella: "",
  owen: "",
  bioQuiz: "",
  apQuiz: "",
  apTest: "",
  mc: "",
  essay: "",
  activity: "",
  avaAttempt: "",
  benAttempt: "",
  calRequest: "",
  noahRequest: "",
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
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const courseOf = async (assignmentId: string) =>
  (
    await db
      .select({ courseId: schema.assessments.courseId })
      .from(schema.assignments)
      .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
      .where(eq(schema.assignments.id, assignmentId))
  )[0]?.courseId;
const served = () => [
  { questionId: ids.mc, sectionId: ids.mc, learningTargetId: null, points: 1, order: 0 },
];

/** A finished attempt (graded at `percent`) or an open one. */
async function attempt(
  assignmentId: string,
  studentId: string,
  number: number,
  extra: Partial<typeof schema.attempts.$inferInsert> = {}
) {
  const [a] = await db
    .insert(schema.attempts)
    .values({
      assignmentId,
      studentId,
      number,
      questionSet: served(),
      status: "graded",
      percent: 60,
      submittedAt: minutesAgo(30),
      ...extra,
    })
    .returning();
  return a.id;
}

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values(
      [
        ["t@t", "teacher", "Jon", "Erickson"],
        ["o@t", "teacher", "Other", "Teacher"],
        ["ava@s", "student", "Ava", "Moss"],
        ["ben@s", "student", "Ben", "Hart"],
        ["cal@s", "student", "Cal", "Reed"],
        ["noah@s", "student", "Noah", "Eck"],
        ["ella@s", "student", "Ella", "Fox"],
        ["owen@s", "student", "Owen", "Gale"],
      ].map(([email, role, firstName, lastName]) => ({
        email,
        role: role as "teacher" | "student",
        firstName,
        lastName,
        passwordHash: "x",
      }))
    )
    .returning();
  const [t, o, ava, ben, cal, noah, ella, owen] = users;
  Object.assign(ids, {
    teacher: t.id,
    other: o.id,
    ava: ava.id,
    ben: ben.id,
    cal: cal.id,
    noah: noah.id,
    ella: ella.id,
    owen: owen.id,
  });
  const [bio, ap] = await db
    .insert(schema.courses)
    .values([
      { ownerId: t.id, name: "Biology" },
      { ownerId: t.id, name: "A&P" },
    ])
    .returning();
  const [bio2, ap5] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t.id, courseId: bio.id, name: "Bio 2nd", period: "2" },
      { ownerId: t.id, courseId: ap.id, name: "A&P 5th", period: "5" },
    ])
    .returning();
  await db
    .insert(schema.enrollments)
    .values([
      ...[cal, noah, ella].map((s) => ({ classId: bio2.id, studentId: s.id })),
      ...[ava, ben, owen].map((s) => ({ classId: ap5.id, studentId: s.id })),
    ]);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: bio.id, name: "Bank" })
    .returning();
  const [mc, essay] = await db
    .insert(schema.questions)
    .values([
      { bankId: bank.id, ownerId: t.id, type: "multiple_choice", stem: "Q1", points: 1 },
      { bankId: bank.id, ownerId: t.id, type: "short_answer", stem: "Explain", points: 2 },
    ])
    .returning();
  Object.assign(ids, { mc: mc.id, essay: essay.id });
  const [bioQuizA, apQuizA, apTestA] = await db
    .insert(schema.assessments)
    .values([
      { ownerId: t.id, courseId: bio.id, type: "formative", title: "Cell Quiz", isPublished: true },
      { ownerId: t.id, courseId: ap.id, type: "formative", title: "Skin Quiz", isPublished: true },
      {
        ownerId: t.id,
        courseId: ap.id,
        type: "summative",
        title: "Unit 2 Test",
        isPublished: true,
      },
    ])
    .returning();
  const [bioQuiz, apQuiz, apTest] = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        assessmentId: bioQuizA.id,
        classId: bio2.id,
        attemptsAllowed: 3,
        retakesNeedUnlock: true,
        retakeWaitHours: 24,
      },
      { ownerId: t.id, assessmentId: apQuizA.id, classId: ap5.id, attemptsAllowed: 3 },
      { ownerId: t.id, assessmentId: apTestA.id, classId: ap5.id, attemptsAllowed: 2 },
    ])
    .returning();
  Object.assign(ids, { bioQuiz: bioQuiz.id, apQuiz: apQuiz.id, apTest: apTest.id });

  // Asked to finish: Ava paused and pressed "Ask my teacher". Ben went idle and hasn't asked.
  ids.avaAttempt = await attempt(apQuiz.id, ava.id, 1, {
    status: "in_progress",
    percent: null,
    submittedAt: null,
    pausedAt: minutesAgo(5),
    pauseReason: "student",
    resumeRequestedAt: minutesAgo(2),
  });
  ids.benAttempt = await attempt(apQuiz.id, ben.id, 1, {
    status: "in_progress",
    percent: null,
    submittedAt: null,
    startedAt: minutesAgo(30),
    lastActiveAt: minutesAgo(11),
  });

  // Retake requests: Cal's is current (try 2, just finished try 1, a day's wait applies);
  // Noah already took try 2, so his leftover request for it can only be cleared.
  await attempt(bioQuiz.id, cal.id, 1);
  await attempt(bioQuiz.id, noah.id, 1);
  await attempt(bioQuiz.id, noah.id, 2);
  const [calReq, noahReq] = await db
    .insert(schema.attemptUnlocks)
    .values([
      { assignmentId: bioQuiz.id, studentId: cal.id, attemptNumber: 2, requestedAt: minutesAgo(9) },
      {
        assignmentId: bioQuiz.id,
        studentId: noah.id,
        attemptNumber: 2,
        requestedAt: minutesAgo(90),
      },
    ])
    .returning();
  Object.assign(ids, { calRequest: calReq.id, noahRequest: noahReq.id });

  // Corrections to check: Ella sent two, one flagged.
  const ellaAttempt = await attempt(bioQuiz.id, ella.id, 1);
  await db.insert(schema.corrections).values([
    {
      attemptId: ellaAttempt,
      questionId: mc.id,
      studentId: ella.id,
      correctAnswer: "A",
      explanation: "Because. And so.",
      status: "submitted",
      aiFlag: true,
      submittedAt: minutesAgo(20),
    },
    {
      attemptId: ellaAttempt,
      questionId: essay.id,
      studentId: ella.id,
      correctAnswer: "B",
      explanation: "Because. And so.",
      status: "submitted",
      submittedAt: minutesAgo(20),
    },
  ]);

  // Answers to grade: Owen's written answer on the A&P test.
  const owenAttempt = await attempt(apTest.id, owen.id, 1, { status: "submitted" });
  await db
    .insert(schema.responses)
    .values({ attemptId: owenAttempt, questionId: essay.id, answer: { kind: "text", text: "x" } });

  // Activity to check off: Owen finished a link activity that needs the teacher's OK.
  const [act] = await db
    .insert(schema.relearningActivities)
    .values({
      ownerId: t.id,
      courseId: ap.id,
      kind: "link",
      title: "Osmosis notes",
      url: "https://example.com",
      requiresTeacherVerification: true,
      isPublished: true,
    })
    .returning();
  ids.activity = act.id;
  await db.insert(schema.activityCompletions).values({ studentId: owen.id, activityId: act.id });

  // Worksheet emails: two unknown emails on Jon's worksheet; one on a worksheet nobody owns yet.
  const [mine, unowned] = await db
    .insert(schema.worksheets)
    .values([
      { ownerId: t.id, scriptId: "s-mine", title: "Osmosis", registered: true },
      { ownerId: null, scriptId: "s-new", title: "New" },
    ])
    .returning();
  await db.insert(schema.worksheetEvents).values([
    { worksheetId: mine.id, email: "x@cadott", event: "submit", occurredAt: minutesAgo(3) },
    { worksheetId: mine.id, email: "x@cadott", event: "submit", occurredAt: minutesAgo(2) },
    { worksheetId: mine.id, email: "y@cadott", event: "progress", occurredAt: minutesAgo(1) },
    { worksheetId: unowned.id, email: "z@cadott", event: "submit", occurredAt: minutesAgo(1) },
  ]);
});

describe("Needs you", () => {
  it("lists every kind of thing from all courses, each with its course · period", async () => {
    const inbox = await getNeedsYou(ids.teacher);
    expect(inbox.asked.map((r) => r.attemptId)).toEqual([ids.avaAttempt]);
    expect(placeLabel(inbox.asked[0].place)).toBe("A&P · P5");

    expect(inbox.requests.map((r) => [r.id, r.stale])).toEqual([
      [ids.noahRequest, "taken"],
      [ids.calRequest, null],
    ]);
    const cal = inbox.requests.find((r) => r.id === ids.calRequest)!;
    expect(placeLabel(cal.place)).toBe("Biology · P2");
    expect(cal).toMatchObject({ bestPercent: 60, blocker: { reason: "wait" } });

    expect(inbox.corrections).toHaveLength(1);
    expect(inbox.corrections[0]).toMatchObject({ firstName: "Ella", answers: 2, flagged: 1 });
    expect(inbox.grading).toEqual([
      expect.objectContaining({ assignmentId: ids.apTest, title: "Unit 2 Test", answers: 1 }),
    ]);
    expect(inbox.activities).toEqual([
      expect.objectContaining({ activityTitle: "Osmosis notes", firstName: "Owen" }),
    ]);
    expect(placeLabel(inbox.activities[0].place)).toBe("A&P · P5");
    expect(inbox.worksheetEmails).toBe(2);
  });

  it("counts a paused test only once the student asks", async () => {
    const paused = await listPausedAttempts(ids.teacher);
    expect(paused.map((p) => [p.attemptId, p.reason, !!p.askedAt])).toEqual([
      [ids.avaAttempt, "student", true],
      [ids.benAttempt, "idle", false],
    ]);
    expect((await getNeedsYou(ids.teacher)).asked).toHaveLength(1);
  });

  it("'N things need you' is the rows; another teacher sees none of it", async () => {
    const counts = await getDashboardCounts(ids.teacher);
    expect(counts).toMatchObject({
      asked: 1,
      requests: 2,
      retakeRequests: 1,
      corrections: 1,
      correctionsAwaiting: 1,
      grading: 1,
      activities: 1,
      worksheets: 1,
      total: 7,
    });
    expect(counts.total).toBe(needsYouCounts(await getNeedsYou(ids.teacher)).total);
    expect((await getDashboardCounts(ids.other)).total).toBe(0);
  });

  it("at or above the line under the cap there is no retake to approve (decision 2)", async () => {
    const [calTry] = await db
      .update(schema.attempts)
      .set({ percent: 85 })
      .where(
        and(eq(schema.attempts.assignmentId, ids.bioQuiz), eq(schema.attempts.studentId, ids.cal))
      )
      .returning();
    await db
      .update(schema.assignments)
      .set({ retakeWaitHours: 0 })
      .where(eq(schema.assignments.id, ids.bioQuiz));
    const cal = (await getNeedsYou(ids.teacher)).requests.find((r) => r.id === ids.calRequest)!;
    expect(cal).toMatchObject({ stale: null, blocker: { reason: "no_retake" } });
    await db.update(schema.attempts).set({ percent: 60 }).where(eq(schema.attempts.id, calTry.id));
    await db
      .update(schema.assignments)
      .set({ retakeWaitHours: 24 })
      .where(eq(schema.assignments.id, ids.bioQuiz));
  });

  it("a closed test shows as the blocker on a current request", async () => {
    await db
      .update(schema.assignments)
      .set({ closesAt: minutesAgo(1) })
      .where(eq(schema.assignments.id, ids.bioQuiz));
    const cal = (await getNeedsYou(ids.teacher)).requests.find((r) => r.id === ids.calRequest)!;
    expect(cal.blocker).toEqual({ reason: "closed" });
    await db
      .update(schema.assignments)
      .set({ closesAt: null })
      .where(eq(schema.assignments.id, ids.bioQuiz));
  });
});

describe("one-click actions", () => {
  const pending = async () =>
    (await getNeedsYou(ids.teacher)).requests.filter((r) => !r.stale).map((r) => r.studentId);

  it("Approve, then Undo, puts the request back as it was; Decline removes it", async () => {
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.bioQuiz, ids.cal));
    expect(await pending()).toEqual([]);
    as(ids.other, "teacher");
    await fails(undoRetakeApproval(ids.bioQuiz, ids.cal), 403);
    as(ids.teacher, "teacher");
    await ok(undoRetakeApproval(ids.bioQuiz, ids.cal));
    expect(await pending()).toEqual([ids.cal]);
    const row = await db.query.attemptUnlocks.findFirst({
      where: eq(schema.attemptUnlocks.id, ids.calRequest),
    });
    expect(row).toMatchObject({ grantedAt: null, grantedBy: null });
    expect(row?.requestedAt).toBeInstanceOf(Date);
    // Nothing granted any more: nothing to undo.
    await fails(undoRetakeApproval(ids.bioQuiz, ids.cal), 409);
    await ok(revokeAttemptUnlock(ids.bioQuiz, ids.cal));
    expect(await pending()).toEqual([]);
  });

  it("Undo removes an unlock nobody asked for, like Take back", async () => {
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.bioQuiz, ids.cal));
    await ok(undoRetakeApproval(ids.bioQuiz, ids.cal));
    const rows = await db.query.attemptUnlocks.findMany({
      where: and(
        eq(schema.attemptUnlocks.assignmentId, ids.bioQuiz),
        eq(schema.attemptUnlocks.studentId, ids.cal)
      ),
    });
    expect(rows).toEqual([]);
  });

  it("Clear deletes a leftover request only, owner only; a current one must be declined", async () => {
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: ids.bioQuiz,
      studentId: ids.cal,
      attemptNumber: 2,
      requestedAt: new Date(),
    });
    const current = (await getNeedsYou(ids.teacher)).requests.find((r) => !r.stale)!;
    as(ids.other, "teacher");
    await fails(clearRetakeRequest(ids.bioQuiz, ids.noahRequest), 403);
    as(ids.noah, "student");
    await fails(clearRetakeRequest(ids.bioQuiz, ids.noahRequest), 403);
    as(ids.teacher, "teacher");
    await fails(clearRetakeRequest(ids.bioQuiz, current.id), 409);
    await fails(clearRetakeRequest(ids.apQuiz, ids.noahRequest), 404); // wrong assignment
    await ok(clearRetakeRequest(ids.bioQuiz, ids.noahRequest));
    await fails(clearRetakeRequest(ids.bioQuiz, ids.noahRequest), 404);
    expect((await getNeedsYou(ids.teacher)).requests.map((r) => r.id)).toEqual([current.id]);
    // The request turns into a leftover once the test stops needing the teacher's OK.
    await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: false })
      .where(eq(schema.assignments.id, ids.bioQuiz));
    expect((await getNeedsYou(ids.teacher)).requests[0].stale).toBe("setting_off");
    await ok(clearRetakeRequest(ids.bioQuiz, current.id));
    expect((await getNeedsYou(ids.teacher)).requests).toEqual([]);
  });

  it("a request from a student moved out of the class is a leftover that Clear removes", async () => {
    // Cal took try 1 of the A&P quiz while in A&P 5th, asked for try 2, then moved periods
    // (removing a student deletes only the enrollment).
    const [ap5] = await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: true })
      .where(eq(schema.assignments.id, ids.apQuiz))
      .returning({ classId: schema.assignments.classId });
    await db.insert(schema.enrollments).values({ classId: ap5.classId, studentId: ids.cal });
    await attempt(ids.apQuiz, ids.cal, 1);
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: ids.apQuiz,
      studentId: ids.cal,
      attemptNumber: 2,
      requestedAt: new Date(),
    });
    expect(
      (await getNeedsYou(ids.teacher)).requests.find((r) => r.assignmentId === ids.apQuiz)?.stale
    ).toBeNull();
    await db
      .delete(schema.enrollments)
      .where(
        and(eq(schema.enrollments.classId, ap5.classId), eq(schema.enrollments.studentId, ids.cal))
      );
    const left = (await getNeedsYou(ids.teacher)).requests.find(
      (r) => r.studentId === ids.cal && r.assignmentId === ids.apQuiz
    )!;
    expect(left.stale).toBe("left_class");
    as(ids.teacher, "teacher");
    await fails(unlockNextAttempt(ids.apQuiz, ids.cal), 404);
    await ok(clearRetakeRequest(ids.apQuiz, left.id));
    expect(
      (await getNeedsYou(ids.teacher)).requests.some((r) => r.assignmentId === ids.apQuiz)
    ).toBe(false);
    await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: false })
      .where(eq(schema.assignments.id, ids.apQuiz));
  });

  it("a summative request's relearning blocker is read from the stored gates; nothing is written", async () => {
    // Ava finished the A&P test (one target below the line) and asked for try 2; no gate rows yet.
    const [lt] = await db
      .insert(schema.learningTargets)
      .values({ courseId: (await courseOf(ids.apTest))!, code: "LT1", title: "Skin" })
      .returning();
    const [test] = await db
      .update(schema.assignments)
      .set({ retakesNeedUnlock: true })
      .where(eq(schema.assignments.id, ids.apTest))
      .returning();
    const first = await attempt(test.id, ids.ava, 1, { percent: 50 });
    await db.insert(schema.assignmentFinalScores).values({
      assignmentId: test.id,
      studentId: ids.ava,
      perTarget: {
        [lt.id]: { pointsEarned: 1, pointsPossible: 2, percent: 50, fromAttemptId: first },
      },
      totalEarned: 1,
      totalPossible: 2,
      percent: 50,
      tier: 2,
    });
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: test.id,
      studentId: ids.ava,
      attemptNumber: 2,
      requestedAt: new Date(),
    });
    const gatesNow = () =>
      db.$count(schema.retakeGates, eq(schema.retakeGates.assignmentId, test.id));
    const ava = (await getNeedsYou(ids.teacher)).requests.find((r) => r.studentId === ids.ava)!;
    expect(ava).toMatchObject({ stale: null, blocker: { reason: "gates" } });
    expect(await gatesNow()).toBe(0);
    await db.delete(schema.attemptUnlocks).where(eq(schema.attemptUnlocks.assignmentId, test.id));
  });

  it("Let them continue and Check off clear their rows; Check off can be undone", async () => {
    as(ids.teacher, "teacher");
    await ok(letContinue(ids.avaAttempt));
    await fails(letContinue(ids.avaAttempt), 409); // already back in: the row explains, then refreshes
    expect((await getNeedsYou(ids.teacher)).asked).toEqual([]);
    await ok(verifyCompletion(ids.activity, ids.owen, true));
    expect((await getNeedsYou(ids.teacher)).activities).toEqual([]);
    await ok(verifyCompletion(ids.activity, ids.owen, false));
    expect((await getNeedsYou(ids.teacher)).activities).toHaveLength(1);
  });
});
