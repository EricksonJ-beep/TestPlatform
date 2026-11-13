/**
 * Finish later (Jon, Oct 13 2026): a student pauses (or goes idle, or the
 * window closes), the questions lock and the clock stops, and the test opens
 * again only with the teacher's resume code or the teacher's OK.
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
import { getPausedView } from "@/lib/queries/attempts";
import { getGradebook } from "@/lib/queries/results";
import { getResumeCode, letContinue, setResumeCodeStarts } from "../app/results/actions";
import {
  askToFinish,
  attemptHeartbeat,
  finishLater,
  resumeWithCode,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from "./actions";

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  asg: "",
  coded: "",
  q: [] as { id: string; opt: string }[],
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
const attemptRow = (id: string) =>
  db.query.attempts.findFirst({ where: eq(schema.attempts.id, id) }).then((a) => a!);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeAll(async () => {
  const [t, o, s1, s2] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      { email: "s1@s", passwordHash: "x", role: "student", firstName: "Ana", lastName: "A" },
      { email: "s2@s", passwordHash: "x", role: "student", firstName: "Ben", lastName: "B" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: o.id, s1: s1.id, s2: s2.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Anatomy" })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "5th" })
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: s1.id },
    { classId: cls.id, studentId: s2.id },
  ]);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "formative",
      title: "Quiz",
      isPublished: true,
    })
    .returning();
  const [sec] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "All", sortOrder: 0 })
    .returning();
  for (let i = 0; i < 3; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({ bankId: bank.id, ownerId: t.id, type: "multiple_choice", stem: `Q${i}`, points: 1 })
      .returning();
    const [right] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values({ sectionId: sec.id, questionId: q.id, sortOrder: i });
    ids.q.push({ id: q.id, opt: right.id });
  }
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id, timeLimitMinutes: 30 })
    .returning();
  ids.asg = asg.id;
  const [coded] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id, accessCode: "QUIZ42" })
    .returning();
  ids.coded = coded.id;
});

describe("Finish later", () => {
  let attemptId = "";

  it("pauses: answers lock, the clock stops, saving and submitting are refused", async () => {
    as(ids.s1, "student");
    ({ attemptId } = await ok(startAttempt(ids.asg, null)));
    await ok(saveAnswer(attemptId, ids.q[0].id, { kind: "choice", optionId: ids.q[0].opt }));
    await ok(finishLater(attemptId));
    const a = await attemptRow(attemptId);
    expect(a).toMatchObject({
      pauseReason: "student",
      dueAt: null,
      lockedQuestionIds: [ids.q[0].id],
    });
    expect(a.remainingMs).toBeGreaterThan(29 * 60_000);
    expect(await saveAnswer(attemptId, ids.q[1].id, null)).toMatchObject({
      ok: false,
      status: 423,
    });
    expect(await submitAttempt(attemptId)).toMatchObject({ ok: false, status: 423 });
    expect(await getPausedView(attemptId)).toMatchObject({ answered: 1, total: 3 });
  });

  it("reopens only with the owning teacher's current code; locked answers stay locked", async () => {
    as(ids.other, "teacher");
    const otherCode = (await ok(getResumeCode(false))).code;
    as(ids.teacher, "teacher");
    const { code } = await ok(getResumeCode(false));
    expect((await ok(getResumeCode(false))).code).toBe(code); // same code until it runs out
    as(ids.s1, "student");
    expect(await resumeWithCode(attemptId, otherCode)).toMatchObject({ ok: false, status: 400 });
    expect(await resumeWithCode(attemptId, "ZZZZZZ")).toMatchObject({ ok: false, status: 400 });
    await ok(resumeWithCode(attemptId, code.toLowerCase()));
    const a = await attemptRow(attemptId);
    expect(a.pausedAt).toBeNull();
    expect(a.dueAt!.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(await saveAnswer(attemptId, ids.q[0].id, null)).toMatchObject({
      ok: false,
      status: 409,
    });
    await ok(saveAnswer(attemptId, ids.q[1].id, { kind: "choice", optionId: ids.q[1].opt }));
  });

  it("a new code ends the old one", async () => {
    as(ids.teacher, "teacher");
    const first = (await ok(getResumeCode(false))).code;
    const second = (await ok(getResumeCode(true))).code;
    as(ids.s1, "student");
    await ok(finishLater(attemptId));
    if (first !== second)
      expect(await resumeWithCode(attemptId, first)).toMatchObject({ ok: false, status: 400 });
    await ok(resumeWithCode(attemptId, second));
  });

  it("goes idle after 10 minutes; the teacher sees it, the student asks, the teacher lets them in", async () => {
    await db
      .update(schema.attempts)
      .set({ lastActiveAt: minutesAgo(11) })
      .where(eq(schema.attempts.id, attemptId));
    as(ids.teacher, "teacher");
    const row = (await getGradebook(ids.asg)).find((r) => r.studentId === ids.s1)!;
    expect(row.attempts[0]).toMatchObject({ status: "in_progress", paused: true });
    as(ids.s1, "student");
    expect(await ok(attemptHeartbeat(attemptId))).toEqual({ paused: true });
    expect(await attemptRow(attemptId)).toMatchObject({ pauseReason: "idle" });
    await ok(askToFinish(attemptId));
    expect((await attemptRow(attemptId)).resumeRequestedAt).not.toBeNull();
    as(ids.other, "teacher");
    expect(await letContinue(attemptId)).toMatchObject({ ok: false, status: 403 });
    as(ids.teacher, "teacher");
    await ok(letContinue(attemptId));
    const a = await attemptRow(attemptId);
    expect(a).toMatchObject({ pausedAt: null, resumeRequestedAt: null });
    as(ids.s1, "student");
    await ok(submitAttempt(attemptId));
  });

  it("the window closing pauses instead of submitting, and keeps the time-limit minutes owed", async () => {
    as(ids.s2, "student");
    const { attemptId: id } = await ok(startAttempt(ids.asg, null));
    // Started 10 minutes ago, window closed a minute ago (deadline capped at the close).
    await db
      .update(schema.assignments)
      .set({ closesAt: minutesAgo(1) })
      .where(eq(schema.assignments.id, ids.asg));
    await db
      .update(schema.attempts)
      .set({ startedAt: minutesAgo(10), dueAt: minutesAgo(1), lastActiveAt: minutesAgo(2) })
      .where(eq(schema.attempts.id, id));
    expect(await submitAttempt(id, true)).toMatchObject({ ok: false, status: 423 });
    const a = await attemptRow(id);
    expect(a.pauseReason).toBe("closed");
    expect(Math.round(a.remainingMs! / 60_000)).toBe(21);
    // Still reachable after the close, and the code lets them finish.
    expect((await ok(startAttempt(ids.asg, null))).attemptId).toBe(id);
    as(ids.teacher, "teacher");
    const { code } = await ok(getResumeCode(false));
    as(ids.s2, "student");
    await ok(resumeWithCode(id, code));
    await ok(saveAnswer(id, ids.q[2].id, { kind: "choice", optionId: ids.q[2].opt }));
    await ok(submitAttempt(id));
  });
});

/**
 * "Also starts tests" (Jon, Nov 13 2026: "have the resume code on the board and have it be a
 * master password if I wanted"): the switch is the teacher's, off until they turn it on.
 */
describe("Resume code as a master access code", () => {
  const started = async (studentId: string) =>
    (
      await db.query.activityLog.findMany({
        where: (l, { and, eq }) =>
          and(
            eq(l.userId, studentId),
            eq(l.kind, "attempt_started"),
            eq(l.assignmentId, ids.coded)
          ),
      })
    ).map((r) => r.detail);

  it("is off by default: the resume code does not start a code-protected test", async () => {
    as(ids.teacher, "teacher");
    const shown = await ok(getResumeCode(true));
    expect(shown.startsTests).toBe(false);
    as(ids.s1, "student");
    expect(await startAttempt(ids.coded, shown.code)).toMatchObject({ ok: false, status: 400 });
  });

  it("only a teacher flips the switch", async () => {
    as(ids.s1, "student");
    expect(await setResumeCodeStarts(true)).toMatchObject({ ok: false, status: 403 });
  });

  it("when on, the owning teacher's live code starts the test; another teacher's does not", async () => {
    as(ids.other, "teacher");
    await ok(setResumeCodeStarts(true));
    const otherCode = (await ok(getResumeCode(true))).code;
    as(ids.teacher, "teacher");
    expect(await ok(setResumeCodeStarts(true))).toEqual({ startsTests: true });
    const shown = await ok(getResumeCode(false));
    expect(shown.startsTests).toBe(true);

    as(ids.s1, "student");
    if (otherCode !== shown.code)
      expect(await startAttempt(ids.coded, otherCode)).toMatchObject({ ok: false, status: 400 });
    expect(await startAttempt(ids.coded, null)).toMatchObject({ ok: false, status: 400 });
    const { attemptId } = await ok(startAttempt(ids.coded, shown.code.toLowerCase()));
    expect(await started(ids.s1)).toEqual([{ attemptNumber: 1, by: "resume_code" }]);
    await ok(submitAttempt(attemptId));

    // The test's own code still works, and is logged as an ordinary start.
    as(ids.s2, "student");
    await ok(submitAttempt((await ok(startAttempt(ids.coded, "quiz42"))).attemptId));
    expect(await started(ids.s2)).toEqual([{ attemptNumber: 1 }]);
  });

  it("stops with a new code, when the code runs out, and when the switch goes off", async () => {
    as(ids.teacher, "teacher");
    const old = (await ok(getResumeCode(false))).code;
    const fresh = (await ok(getResumeCode(true))).code;
    as(ids.s1, "student");
    if (old !== fresh)
      expect(await startAttempt(ids.coded, old)).toMatchObject({ ok: false, status: 400 });

    await db
      .update(schema.resumeCodes)
      .set({ expiresAt: minutesAgo(1) })
      .where(eq(schema.resumeCodes.teacherId, ids.teacher));
    expect(await startAttempt(ids.coded, fresh)).toMatchObject({ ok: false, status: 400 });

    as(ids.teacher, "teacher");
    const live = (await ok(getResumeCode(false))).code;
    await ok(setResumeCodeStarts(false));
    as(ids.s1, "student");
    expect(await startAttempt(ids.coded, live)).toMatchObject({ ok: false, status: 400 });
  });

  it("opens the access code only: a closed test stays closed", async () => {
    as(ids.teacher, "teacher");
    await ok(setResumeCodeStarts(true));
    const { code } = await ok(getResumeCode(false));
    await db
      .update(schema.assignments)
      .set({ closesAt: minutesAgo(5) })
      .where(eq(schema.assignments.id, ids.coded));
    as(ids.s1, "student");
    expect(await startAttempt(ids.coded, code)).toMatchObject({ ok: false, status: 403 });
  });
});
