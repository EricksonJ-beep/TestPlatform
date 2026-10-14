/**
 * Ask to retake on a closed test (Jon, Oct 14 2026, decisions 1–2: "Students ask, I approve";
 * "Through tomorrow"; docs/student-home-plan.md R4–R6). Once a quiz closes, a student whose
 * retake is otherwise ready (corrections clear, a quiz's practice done) sees "Ask to retake"; the
 * request lands in the teacher's Needs you with the setting or without; Approve reopens the test
 * for that student alone until the end of the next school day, ignoring the cap's retake window.
 * The reopen is the student's close everywhere: starting, the attempt's deadline, the window-close
 * pause, the card and the gradebook. In-memory Postgres with the real migrations; the work is
 * done through the real actions.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
// requestRetake reads the student's reopen, then writes: `staleRead` replays a read made just
// before the teacher's approval landed.
const race = vi.hoisted(() => ({ staleRead: false }));
vi.mock("@/lib/queries/reopen", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/queries/reopen")>();
  return {
    ...real,
    openUntilFor: (...args: Parameters<typeof real.openUntilFor>) =>
      race.staleRead ? Promise.resolve(null) : real.openUntilFor(...args),
  };
});
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeAttempt } from "@/lib/attempts";
import { tagLabel } from "@/lib/class-gradebook";
import { cellSentence } from "@/lib/gradebook-view";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { listPausedAttempts, listRetakeRequests } from "@/lib/queries/dashboard";
import { endOfNextSchoolDay } from "@/lib/reopen";
import { buildStudentToDo } from "@/lib/student-home";
import {
  clearRetakeRequest,
  letContinue,
  revokeAttemptUnlock,
  undoRetakeApproval,
  unlockNextAttempt,
} from "../app/results/actions";
import { requestRetake, saveAnswer, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

type Q = { id: string; right: string; wrong: string };
type Key = "quiz" | "okQuiz" | "tagged";
const ids = {
  teacher: "",
  other: "",
  viola: "",
  wes: "",
  xan: "",
  yara: "",
  cls: "",
  asg: {} as Record<Key, string>,
  quizQ: [] as Q[],
  taggedQ: [] as Q[],
  attempts: {} as Record<string, string>,
};
const FMT = { time: () => "2:15", date: () => "Oct 15" };
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed the two terms up on the quiz. The right one is the one that matches the definition in our notes.",
};
const MINUTE = 60_000;
const minutesAgo = (m: number) => new Date(Date.now() - m * MINUTE);

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
  if (!r.ok && text) expect(r.error).toMatch(text);
};
const card = async (studentId: string, key: Key) =>
  (await listStudentAssignments(studentId)).find((a) => a.id === ids.asg[key])!;
const gradebook = async () => (await getClassGradebook(ids.cls))!;
const cell = async (studentId: string, key: Key) => {
  const gb = await gradebook();
  const i = gb.columns.findIndex((c) => c.assignmentId === ids.asg[key]);
  return { cell: gb.rows.find((r) => r.student.id === studentId)!.cells[i], column: gb.columns[i] };
};
const label = async (studentId: string, key: Key) =>
  tagLabel((await cell(studentId, key)).cell.tag, FMT);
const unlockRow = (studentId: string, key: Key, attemptNumber: number) =>
  db.query.attemptUnlocks.findFirst({
    where: and(
      eq(schema.attemptUnlocks.assignmentId, ids.asg[key]),
      eq(schema.attemptUnlocks.studentId, studentId),
      eq(schema.attemptUnlocks.attemptNumber, attemptNumber)
    ),
  });
const request = async (studentId: string, key: Key) =>
  (await listRetakeRequests(ids.teacher)).find(
    (r) => r.studentId === studentId && r.assignmentId === ids.asg[key]
  );
const setClosed = (key: Key, closesAt: Date | null) =>
  db.update(schema.assignments).set({ closesAt }).where(eq(schema.assignments.id, ids.asg[key]));
const requestsLogged = async (studentId: string) =>
  db.$count(
    schema.activityLog,
    and(eq(schema.activityLog.userId, studentId), eq(schema.activityLog.kind, "retake_requested"))
  );

/** Take a quiz while it is open: the first `right` questions answered right, the rest wrong. */
async function take(studentId: string, key: Key, right: number) {
  as(studentId, "student");
  const { attemptId } = await ok(startAttempt(ids.asg[key], null));
  const qs = key === "tagged" ? ids.taggedQ : ids.quizQ;
  await db.insert(schema.responses).values(
    qs.map((q, i) => ({
      attemptId,
      questionId: q.id,
      answer: { kind: "choice" as const, optionId: i < right ? q.right : q.wrong },
    }))
  );
  await finalizeAttempt(attemptId);
  return attemptId;
}
/** Correct every missed question and submit (approved at once: auto review). */
async function correct(studentId: string, attemptId: string) {
  as(studentId, "student");
  const missed = await db
    .select({ questionId: schema.responses.questionId })
    .from(schema.responses)
    .where(and(eq(schema.responses.attemptId, attemptId), eq(schema.responses.autoScore, 0)));
  for (const r of missed) await ok(saveCorrection(attemptId, r.questionId, WHY));
  expect((await ok(submitCorrections(attemptId))).state).toBe("approved");
}

/**
 * Every gradebook cell's card is exactly what the student's own home says (one shared rule), and
 * the student panel lists the same to-do as their home does for this class (one builder).
 */
async function expectGradebookAgrees() {
  const gb = await gradebook();
  const inClass = new Set(gb.columns.map((c) => c.assignmentId));
  for (const row of gb.rows) {
    const cards = new Map((await listStudentAssignments(row.student.id)).map((c) => [c.id, c]));
    expect(row.studentToDo, row.student.firstName).toEqual(
      buildStudentToDo({ assignments: [...cards.values()].filter((c) => inClass.has(c.id)) })
    );
    for (const c of row.cells) {
      const own = cards.get(c.assignmentId);
      const where = `${row.student.firstName} · ${c.assignmentId}`;
      if (!own) {
        expect([c.card, c.attemptsUsed], where).toEqual(["closed", 0]);
        continue;
      }
      expect(c.card, where).toBe(own.state);
      expect(c.cycle, where).toBe(own.cycle);
      expect(c.reopenedUntil, where).toEqual(own.reopenedUntil);
    }
  }
}

beforeAll(async () => {
  const [t, o, viola, wes, xan, yara] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "Other", lastName: "T" },
      { email: "v@s", passwordHash: "x", role: "student", firstName: "Viola", lastName: "V" },
      { email: "w@s", passwordHash: "x", role: "student", firstName: "Wes", lastName: "W" },
      { email: "x@s", passwordHash: "x", role: "student", firstName: "Xan", lastName: "X" },
      { email: "y@s", passwordHash: "x", role: "student", firstName: "Yara", lastName: "Y" },
    ])
    .returning();
  Object.assign(ids, {
    teacher: t.id,
    other: o.id,
    viola: viola.id,
    wes: wes.id,
    xan: xan.id,
    yara: yara.id,
  });
  const [bio] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
  const [lt1] = await db
    .insert(schema.learningTargets)
    .values({ courseId: bio.id, code: "U2.LT1", title: "Carbon", sortOrder: 1 })
    .returning();
  const [quizBank, practiceBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t.id, courseId: bio.id, name: "U2 Quiz" },
      { ownerId: t.id, courseId: bio.id, name: "U2 Practice", openPractice: true },
    ])
    .returning();
  async function mc(bankId: string, n: number, targetId: string | null) {
    const out: Q[] = [];
    for (let i = 0; i < n; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({ bankId, ownerId: t.id, type: "multiple_choice", stem: `Q ${i}`, points: 1 })
        .returning();
      if (targetId)
        await db
          .insert(schema.questionTargets)
          .values({ questionId: q.id, learningTargetId: targetId });
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      out.push({ id: q.id, right: right.id, wrong: wrong.id });
    }
    return out;
  }
  // Untagged questions: no learning targets, so no quiz practice step (R3) on these quizzes.
  ids.quizQ = await mc(quizBank.id, 5, null);
  ids.taggedQ = await mc(quizBank.id, 5, lt1.id);
  await mc(practiceBank.id, 6, lt1.id);

  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: bio.id, name: "Bio 4th", period: "4" })
    .returning();
  ids.cls = cls.id;
  await db
    .insert(schema.enrollments)
    .values([viola, wes, xan, yara].map((s) => ({ classId: cls.id, studentId: s.id })));

  async function quiz(title: string, qs: Q[], targetId: string | null) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId: bio.id, type: "formative", title, isPublished: true })
      .returning();
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId: a.id, title: "All", sortOrder: 0, learningTargetId: targetId })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values(qs.map((q, j) => ({ sectionId: sec.id, questionId: q.id, sortOrder: j })));
    return a.id;
  }
  const opensAt = new Date(Date.now() - 20 * 86_400_000);
  const [q1, q2, q3] = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz("Unit 2 LT1 Quiz", ids.quizQ, null),
        attemptsAllowed: 3,
        timeLimitMinutes: 20,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz("Unit 2 Sugar check-in", ids.quizQ, null),
        attemptsAllowed: 3,
        retakesNeedUnlock: true,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz("Unit 2 Carbon quiz", ids.taggedQ, lt1.id),
        attemptsAllowed: 3,
        opensAt,
      },
    ])
    .returning();
  ids.asg = { quiz: q1.id, okQuiz: q2.id, tagged: q3.id };

  // Viola and Wes take the quiz at 40% while it is open, ten days ago (the cap's 7-day retake
  // window has passed); Yara takes the tagged quiz at 40%. Then the quizzes close.
  ids.attempts.viola = await take(viola.id, "quiz", 2);
  ids.attempts.wes = await take(wes.id, "quiz", 2);
  ids.attempts.yara = await take(yara.id, "tagged", 2);
  await db
    .update(schema.attempts)
    .set({ submittedAt: new Date(Date.now() - 10 * 86_400_000) })
    .where(eq(schema.attempts.assignmentId, q1.id));
  await setClosed("quiz", minutesAgo(60));
  await setClosed("tagged", minutesAgo(60));
});

describe("Ask to retake (R4, R6)", () => {
  it("waits for the student's part first: corrections, then a quiz's practice", async () => {
    // Corrections stay owed on a closed test (R1), and asking waits for them (R2).
    expect(await card(ids.viola, "quiz")).toMatchObject({
      status: "closed",
      state: "corrections_needed",
    });
    as(ids.viola, "student");
    await refused(requestRetake(ids.asg.quiz), 403, /^Finish your corrections on attempt 1/);
    // A tagged quiz's missed target needs 80% on practice first (R3), closed or not.
    await correct(ids.yara, ids.attempts.yara);
    expect(await card(ids.yara, "tagged")).toMatchObject({ state: "closed", cycle: "relearning" });
    as(ids.yara, "student");
    await refused(requestRetake(ids.asg.tagged), 403, /^Practice U2\.LT1 first/);
    expect(await unlockRow(ids.yara, "tagged", 2)).toBeUndefined();
  });

  it("a request already made with practice owed: the inbox and the cell name the practice (R3)", async () => {
    // A request from before the practice rule (asking now is refused, above).
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: ids.asg.tagged,
      studentId: ids.yara,
      attemptNumber: 2,
      requestedAt: new Date(),
    });
    const row = (await request(ids.yara, "tagged"))!;
    expect(row).toMatchObject({
      stale: null,
      blocker: { reason: "practice", codes: ["U2.LT1"] },
    });
    // Closed: Approve would reopen it, so the row says until when.
    expect(row.reopensUntil).toEqual(endOfNextSchoolDay(new Date()));
    const { cell: c, column } = await cell(ids.yara, "tagged");
    expect(tagLabel(c.tag, FMT)).toBe("Retake request");
    expect(cellSentence(c, column, { hideScores: true, fmt: FMT })).toBe(
      "Took try 1 Oct 15; corrections approved; needs 80% on practice for U2.LT1."
    );
    // Her own list (and the teacher's panel): the practice before asking, optional on a closed quiz.
    const list = (await gradebook()).rows.find((r) => r.student.id === ids.yara)!.studentToDo;
    expect(list.higher.map((r) => r.why)).toEqual([
      "Practice U2.LT1: score 80% on at least 5 questions on it before you can ask to retake (you scored 40%).",
    ]);
    await expectGradebookAgrees();
    // Decline: the leftover request is gone.
    as(ids.teacher, "teacher");
    await ok(revokeAttemptUnlock(ids.asg.tagged, ids.yara));
    expect(await request(ids.yara, "tagged")).toBeUndefined();
  });

  it("corrections done: the closed quiz reads Ask to retake, the cap's window doesn't matter", async () => {
    await correct(ids.viola, ids.attempts.viola);
    expect(await card(ids.viola, "quiz")).toMatchObject({
      status: "closed",
      state: "ask_to_retake",
      cycle: "retake_available",
      // Corrections lifted it to 80%: the retake is optional, not a counted to-do.
      askCounts: false,
      retakeRequested: false,
      retakeBy: null,
      retakeWindowClosed: false,
      final: { percent: 80 },
    });
    as(ids.viola, "student");
    await refused(startAttempt(ids.asg.quiz, null), 403, /closed/);
    await expectGradebookAgrees();
  });

  it('asking puts the request in the teacher\'s Needs you, without "Retakes need my OK"', async () => {
    as(ids.viola, "student");
    expect(await ok(requestRetake(ids.asg.quiz))).toEqual({ attemptNumber: 2 });
    // Idempotent: asking again changes nothing and logs nothing.
    const first = (await unlockRow(ids.viola, "quiz", 2))!;
    expect(await ok(requestRetake(ids.asg.quiz))).toEqual({ attemptNumber: 2 });
    expect(await unlockRow(ids.viola, "quiz", 2)).toEqual(first);
    expect(await requestsLogged(ids.viola)).toBe(1);
    expect(first).toMatchObject({ grantedAt: null, openUntil: null });
    expect(await card(ids.viola, "quiz")).toMatchObject({
      state: "awaiting_unlock",
      retakeRequested: true,
    });
    // The teacher's side: a current request (your move), with until when Approve reopens it.
    expect(await label(ids.viola, "quiz")).toBe("Retake request");
    const { cell: c } = await cell(ids.viola, "quiz");
    expect(c.tag.needsYou).toBe(true);
    expect(c.unlock).toMatchObject({ attemptNumber: 2, state: "requested" });
    expect(c.unlock?.reopensUntil).toBeInstanceOf(Date);
    const row = (await request(ids.viola, "quiz"))!;
    expect(row).toMatchObject({ stale: null, blocker: null, attemptNumber: 2 });
    expect(row.reopensUntil).toEqual(endOfNextSchoolDay(new Date()));
    // Current, so Clear refuses it: Approve or Decline.
    as(ids.teacher, "teacher");
    await refused(clearRetakeRequest(ids.asg.quiz, row.id), 409);
    await expectGradebookAgrees();
  });

  it("only the owning teacher can approve", async () => {
    as(ids.other, "teacher");
    await refused(unlockNextAttempt(ids.asg.quiz, ids.viola), 403);
    as(ids.viola, "student");
    await refused(unlockNextAttempt(ids.asg.quiz, ids.viola), 403);
    expect(await unlockRow(ids.viola, "quiz", 2)).toMatchObject({ grantedAt: null });
  });
});

describe("Approve reopens it for that student through the next school day (R4, R5)", () => {
  it("Approve sets the reopen; Undo puts the request back as it was", async () => {
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.asg.quiz, ids.viola));
    const granted = (await unlockRow(ids.viola, "quiz", 2))!;
    expect(granted.grantedAt).toBeInstanceOf(Date);
    expect(granted.openUntil).toEqual(endOfNextSchoolDay(granted.grantedAt!));
    expect(await request(ids.viola, "quiz")).toBeUndefined();
    expect(await card(ids.viola, "quiz")).toMatchObject({
      status: "open",
      state: "retake_available",
      reopenedUntil: granted.openUntil,
      retakeBy: null,
    });
    const { cell: c, column } = await cell(ids.viola, "quiz");
    expect(column.status).toBe("closed");
    expect(c).toMatchObject({ card: "retake_available", reopenedUntil: granted.openUntil });
    expect(tagLabel(c.tag, FMT)).toBe("Can retake");
    expect(cellSentence(c, column, { hideScores: true, fmt: FMT })).toMatch(
      /; reopened through Oct 15\.$/
    );
    await expectGradebookAgrees();

    await ok(undoRetakeApproval(ids.asg.quiz, ids.viola));
    expect(await unlockRow(ids.viola, "quiz", 2)).toMatchObject({
      grantedAt: null,
      grantedBy: null,
      openUntil: null,
      requestedAt: granted.requestedAt,
    });
    expect((await card(ids.viola, "quiz")).state).toBe("awaiting_unlock");
    expect(await request(ids.viola, "quiz")).toMatchObject({ stale: null });
    await ok(unlockNextAttempt(ids.asg.quiz, ids.viola));
  });

  it("the student can start; the deadline isn't in the past and the time limit still applies", async () => {
    as(ids.viola, "student");
    const before = Date.now();
    const { attemptId, resumed } = await ok(startAttempt(ids.asg.quiz, null));
    expect(resumed).toBe(false);
    ids.attempts.violaRetake = attemptId;
    const a = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(a.number).toBe(2);
    expect(a.dueAt!.getTime()).toBeGreaterThan(before);
    // 20 minutes from the start, well inside the reopen (the close would have made it past due).
    expect(a.dueAt!.getTime() - a.startedAt.getTime()).toBe(20 * MINUTE);
    // Saving works: the attempt isn't paused by the assignment's own (past) close.
    await ok(
      saveAnswer(attemptId, ids.quizQ[0].id, { kind: "choice", optionId: ids.quizQ[0].right })
    );
    expect(await card(ids.viola, "quiz")).toMatchObject({ status: "open", state: "in_progress" });
  });

  it("Finish later: the attempt pauses when the reopen ends, keeping the time owed", async () => {
    const id = ids.attempts.violaRetake;
    // Ten minutes in, last work two minutes ago, and the reopen ended a minute ago.
    const openUntil = minutesAgo(1);
    await db
      .update(schema.attempts)
      .set({ startedAt: minutesAgo(10), dueAt: minutesAgo(-10), lastActiveAt: minutesAgo(2) })
      .where(eq(schema.attempts.id, id));
    await db
      .update(schema.attemptUnlocks)
      .set({ openUntil })
      .where(eq(schema.attemptUnlocks.id, (await unlockRow(ids.viola, "quiz", 2))!.id));
    // Worked out before anything writes it: the teacher's lists already show the pause.
    const paused = (await listPausedAttempts(ids.teacher)).find((p) => p.attemptId === id)!;
    expect(paused).toMatchObject({ reason: "closed" });
    expect(paused.pausedAt.getTime()).toBe(openUntil.getTime());
    expect(await label(ids.viola, "quiz")).toBe("Paused");
    // The next save settles it: paused at the reopen's end, the 11 minutes left kept.
    as(ids.viola, "student");
    await refused(
      saveAnswer(id, ids.quizQ[1].id, { kind: "choice", optionId: ids.quizQ[1].right }),
      423
    );
    const a = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, id) }))!;
    expect(a).toMatchObject({ pauseReason: "closed", dueAt: null });
    expect(Math.abs(a.pausedAt!.getTime() - openUntil.getTime())).toBeLessThan(1000);
    expect(Math.round(a.remainingMs! / MINUTE)).toBe(11);
    expect(await card(ids.viola, "quiz")).toMatchObject({ state: "in_progress", paused: true });
    // Finished in class: the teacher lets her continue, and she submits.
    as(ids.teacher, "teacher");
    await ok(letContinue(id));
    as(ids.viola, "student");
    for (const q of ids.quizQ.slice(1))
      await ok(saveAnswer(id, q.id, { kind: "choice", optionId: q.right }));
    await ok(submitAttempt(id));
    // Try 2 used, 100%: closed again for her, nothing left to do.
    expect(await card(ids.viola, "quiz")).toMatchObject({
      status: "closed",
      state: "closed",
      reopenedUntil: null,
      bestPercent: 100,
    });
    await expectGradebookAgrees();
  });

  it("after the reopen ends unused, the test reads closed again; asking again makes a new request", async () => {
    await correct(ids.wes, ids.attempts.wes);
    as(ids.wes, "student");
    await ok(requestRetake(ids.asg.quiz));
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.asg.quiz, ids.wes));
    const row = (await unlockRow(ids.wes, "quiz", 2))!;
    await db
      .update(schema.attemptUnlocks)
      .set({ openUntil: minutesAgo(1) })
      .where(eq(schema.attemptUnlocks.id, row.id));
    expect(await card(ids.wes, "quiz")).toMatchObject({
      status: "closed",
      state: "ask_to_retake",
      reopenedUntil: null,
    });
    as(ids.wes, "student");
    await refused(startAttempt(ids.asg.quiz, null), 403, /closed/);
    // The ended reopen can't open it again: asking turns it back into a request.
    await ok(requestRetake(ids.asg.quiz));
    expect(await unlockRow(ids.wes, "quiz", 2)).toMatchObject({
      grantedAt: null,
      grantedBy: null,
      openUntil: null,
    });
    expect(await requestsLogged(ids.wes)).toBe(2);
    expect(await request(ids.wes, "quiz")).toMatchObject({ stale: null, blocker: null });
    await expectGradebookAgrees();
  });

  it("with no time limit, a reopened retake's deadline is the reopen's end", async () => {
    await db
      .update(schema.assignments)
      .set({ timeLimitMinutes: null })
      .where(eq(schema.assignments.id, ids.asg.quiz));
    try {
      as(ids.teacher, "teacher");
      await ok(unlockNextAttempt(ids.asg.quiz, ids.wes));
      const { openUntil } = (await unlockRow(ids.wes, "quiz", 2))!;
      as(ids.wes, "student");
      const { attemptId } = await ok(startAttempt(ids.asg.quiz, null));
      const a = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
      expect(a.dueAt).toEqual(openUntil);
      // A leftover request that isn't for the next try is stale on a closed test too, and
      // Clear removes it.
      await db.insert(schema.attemptUnlocks).values({
        assignmentId: ids.asg.quiz,
        studentId: ids.wes,
        attemptNumber: 4,
        requestedAt: new Date(),
      });
      expect(await request(ids.wes, "quiz")).toMatchObject({ stale: "not_next" });
      as(ids.teacher, "teacher");
      await ok(clearRetakeRequest(ids.asg.quiz, (await request(ids.wes, "quiz"))!.id));
      expect(await request(ids.wes, "quiz")).toBeUndefined();
    } finally {
      await db
        .update(schema.assignments)
        .set({ timeLimitMinutes: 20 })
        .where(eq(schema.assignments.id, ids.asg.quiz));
    }
  });
});

describe('"Retakes need my OK" on a closed test', () => {
  it("an unlock given before the close can't open it; asking again reaches the teacher, Decline removes it", async () => {
    // Xan takes the check-in at 40% while it is open, corrects, asks, and is approved.
    const attemptId = await take(ids.xan, "okQuiz", 2);
    await correct(ids.xan, attemptId);
    as(ids.xan, "student");
    await ok(requestRetake(ids.asg.okQuiz));
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.asg.okQuiz, ids.xan));
    expect(await unlockRow(ids.xan, "okQuiz", 2)).toMatchObject({ openUntil: null });
    expect((await card(ids.xan, "okQuiz")).state).toBe("retake_available");
    // The check-in closes before he starts: the unlock can't open it.
    await setClosed("okQuiz", minutesAgo(5));
    expect(await card(ids.xan, "okQuiz")).toMatchObject({
      status: "closed",
      state: "ask_to_retake",
    });
    as(ids.xan, "student");
    await refused(startAttempt(ids.asg.okQuiz, null), 403, /closed/);
    await ok(requestRetake(ids.asg.okQuiz));
    expect(await unlockRow(ids.xan, "okQuiz", 2)).toMatchObject({ grantedAt: null });
    expect(await card(ids.xan, "okQuiz")).toMatchObject({
      state: "awaiting_unlock",
      retakeRequested: true,
    });
    expect(await label(ids.xan, "okQuiz")).toBe("Retake request");
    expect(await request(ids.xan, "okQuiz")).toMatchObject({ stale: null, blocker: null });
    await expectGradebookAgrees();
    // Decline: the request is gone, and Xan may ask again.
    as(ids.teacher, "teacher");
    await ok(revokeAttemptUnlock(ids.asg.okQuiz, ids.xan));
    expect(await unlockRow(ids.xan, "okQuiz", 2)).toBeUndefined();
    expect(await request(ids.xan, "okQuiz")).toBeUndefined();
    expect((await card(ids.xan, "okQuiz")).state).toBe("ask_to_retake");
    // Approved now, it reopens through the next school day.
    as(ids.xan, "student");
    await ok(requestRetake(ids.asg.okQuiz));
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.asg.okQuiz, ids.xan));
    const row = (await unlockRow(ids.xan, "okQuiz", 2))!;
    expect(row.openUntil).toEqual(endOfNextSchoolDay(row.grantedAt!));
    expect(await card(ids.xan, "okQuiz")).toMatchObject({
      status: "open",
      state: "retake_available",
      reopenedUntil: row.openUntil,
    });
    as(ids.xan, "student");
    expect((await ok(startAttempt(ids.asg.okQuiz, null))).resumed).toBe(false);
    await expectGradebookAgrees();
  });
});

describe("Asking only for a retake that is on offer (review, Oct 14 2026)", () => {
  it("refuses a quiz already at 100%, and practice, as the card offers neither", async () => {
    // Viola's reopened retake scored 100%: her card reads Closed, with no Ask button.
    expect((await card(ids.viola, "quiz")).state).toBe("closed");
    as(ids.viola, "student");
    await refused(requestRetake(ids.asg.quiz), 409, /100%/);
    expect(await unlockRow(ids.viola, "quiz", 3)).toBeUndefined();
    // A practice assignment, taken once and closed.
    const [drill] = await db
      .insert(schema.assessments)
      .values({ ownerId: ids.teacher, type: "practice", title: "Carbon drill", isPublished: true })
      .returning();
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId: drill.id, title: "All", sortOrder: 0 })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values(ids.quizQ.map((q, j) => ({ sectionId: sec.id, questionId: q.id, sortOrder: j })));
    const [asg] = await db
      .insert(schema.assignments)
      .values({
        ownerId: ids.teacher,
        classId: ids.cls,
        assessmentId: drill.id,
        attemptsAllowed: 3,
      })
      .returning();
    as(ids.yara, "student");
    const { attemptId } = await ok(startAttempt(asg.id, null));
    await finalizeAttempt(attemptId);
    await db
      .update(schema.assignments)
      .set({ closesAt: minutesAgo(5) })
      .where(eq(schema.assignments.id, asg.id));
    expect((await listStudentAssignments(ids.yara)).find((a) => a.id === asg.id)).toMatchObject({
      state: "closed",
      cycle: "done",
    });
    await refused(requestRetake(asg.id), 409, /^Practice has no retakes/);
    expect(await listRetakeRequests(ids.teacher)).not.toContainEqual(
      expect.objectContaining({ assignmentId: asg.id })
    );
  });

  it("a reopen the teacher approves while the student is asking stands", async () => {
    // Zed: 40% on the quiz while it was open, corrections done; then it closed. Ask to retake.
    const [zed] = await db
      .insert(schema.users)
      .values({ email: "z@s", passwordHash: "x", role: "student", firstName: "Zed", lastName: "Z" })
      .returning();
    await db.insert(schema.enrollments).values({ classId: ids.cls, studentId: zed.id });
    const [{ closesAt }] = await db
      .select({ closesAt: schema.assignments.closesAt })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, ids.asg.quiz));
    await setClosed("quiz", null);
    const attemptId = await take(zed.id, "quiz", 2);
    await setClosed("quiz", closesAt);
    await correct(zed.id, attemptId);
    expect((await card(zed.id, "quiz")).state).toBe("ask_to_retake");
    // Both click at once: the teacher's Approve lands after the student's read of the reopen.
    const openUntil = endOfNextSchoolDay(new Date());
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: ids.asg.quiz,
      studentId: zed.id,
      attemptNumber: 2,
      requestedAt: new Date(),
      grantedAt: new Date(),
      grantedBy: ids.teacher,
      openUntil,
    });
    as(zed.id, "student");
    race.staleRead = true;
    try {
      await ok(requestRetake(ids.asg.quiz));
    } finally {
      race.staleRead = false;
    }
    expect(await unlockRow(zed.id, "quiz", 2)).toMatchObject({ grantedBy: ids.teacher, openUntil });
    expect(await card(zed.id, "quiz")).toMatchObject({
      status: "open",
      state: "retake_available",
      reopenedUntil: openUntil,
    });
    await expectGradebookAgrees();
  });
});
