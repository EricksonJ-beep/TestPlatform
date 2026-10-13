/**
 * The live Dashboard and its activity feed (Jon, Oct 13 2026, docs/dashboard-plan.md build step
 * 5): the version route is the class owner's only; heartbeats and answer saves never move the
 * stamp while starting, pausing, asking, reopening, submitting and the other coarse signals do;
 * an idle pause shows in the stamp before anything writes it; every pause, ask and reopening is
 * logged once; and "this class" means its own tests plus its students' class-less events.
 * In-memory Postgres with the real migrations.
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
import { activityGroup, FEED_GROUPS } from "@/lib/activity-filter";
import {
  describeActivity,
  listClassActivity,
  listRecentActivity,
  logActivity,
} from "@/lib/activity-log";
import { settleAttempt } from "@/lib/attempt-pause";
import { placeLabel } from "@/lib/needs-you";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";
import { GET } from "@/app/api/dashboard/version/route";
import { getResumeCode, letContinue } from "./results/actions";
import {
  askToFinish,
  attemptHeartbeat,
  finishLater,
  resumeWithCode,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from "../student/actions";

const ids = {
  jon: "",
  other: "",
  ana: "",
  ben: "",
  cal: "",
  bio3: "",
  bio6: "",
  chem: "",
  asg3: "",
  asg6: "",
  asgChem: "",
  q: [] as { id: string; opt: string }[],
  chemQ: "",
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
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const version = (classId: string | null = ids.bio3, now = new Date()) =>
  getDashboardVersion(ids.jon, classId, now);
const logRows = (attemptOwner: string, kind: string) =>
  db
    .select()
    .from(schema.activityLog)
    .where(and(eq(schema.activityLog.userId, attemptOwner), eq(schema.activityLog.kind, kind)));
const route = (query: string) =>
  GET(new Request(`http://bloom.test/api/dashboard/version${query}`), undefined);

beforeAll(async () => {
  const [jon, other, ana, ben, cal] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "Other", lastName: "T" },
      { email: "ana@s", passwordHash: "x", role: "student", firstName: "Ana", lastName: "Alba" },
      { email: "ben@s", passwordHash: "x", role: "student", firstName: "Ben", lastName: "Brook" },
      { email: "cal@s", passwordHash: "x", role: "student", firstName: "Cal", lastName: "Reed" },
    ])
    .returning();
  Object.assign(ids, { jon: jon.id, other: other.id, ana: ana.id, ben: ben.id, cal: cal.id });
  const [bio, chemCourse] = await db
    .insert(schema.courses)
    .values([
      { ownerId: jon.id, name: "Biology" },
      { ownerId: other.id, name: "Chemistry" },
    ])
    .returning();
  const [bio3, bio6, chem] = await db
    .insert(schema.classes)
    .values([
      { ownerId: jon.id, courseId: bio.id, name: "Biology 3rd", period: "3" },
      { ownerId: jon.id, courseId: bio.id, name: "Biology 6th", period: "6" },
      { ownerId: other.id, courseId: chemCourse.id, name: "Chem", period: "2" },
    ])
    .returning();
  Object.assign(ids, { bio3: bio3.id, bio6: bio6.id, chem: chem.id });
  await db.insert(schema.enrollments).values([
    { classId: bio3.id, studentId: ana.id },
    { classId: bio3.id, studentId: ben.id },
    { classId: bio6.id, studentId: ana.id },
    { classId: bio6.id, studentId: cal.id },
    { classId: chem.id, studentId: cal.id },
  ]);
  const [bank, chemBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: jon.id, courseId: bio.id, name: "Bank" },
      { ownerId: other.id, courseId: chemCourse.id, name: "Chem bank" },
    ])
    .returning();
  const [quiz, chemQuiz] = await db
    .insert(schema.assessments)
    .values([
      {
        ownerId: jon.id,
        courseId: bio.id,
        type: "formative",
        title: "Cell Quiz",
        isPublished: true,
      },
      {
        ownerId: other.id,
        courseId: chemCourse.id,
        type: "formative",
        title: "Atoms Quiz",
        isPublished: true,
      },
    ])
    .returning();
  const [sec, chemSec] = await db
    .insert(schema.assessmentSections)
    .values([
      { assessmentId: quiz.id, title: "All", sortOrder: 0 },
      { assessmentId: chemQuiz.id, title: "All", sortOrder: 0 },
    ])
    .returning();
  for (let i = 0; i < 3; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({
        bankId: bank.id,
        ownerId: jon.id,
        type: "multiple_choice",
        stem: `Q${i}`,
        points: 1,
      })
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
  const [cq] = await db
    .insert(schema.questions)
    .values({
      bankId: chemBank.id,
      ownerId: other.id,
      type: "multiple_choice",
      stem: "C",
      points: 1,
    })
    .returning();
  await db.insert(schema.questionOptions).values([
    { questionId: cq.id, content: "Right", isCorrect: true, sortOrder: 0 },
    { questionId: cq.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
  ]);
  await db
    .insert(schema.assessmentQuestions)
    .values({ sectionId: chemSec.id, questionId: cq.id, sortOrder: 0 });
  ids.chemQ = cq.id;
  const [asg3, asg6, asgChem] = await db
    .insert(schema.assignments)
    .values([
      { ownerId: jon.id, assessmentId: quiz.id, classId: bio3.id, timeLimitMinutes: 30 },
      { ownerId: jon.id, assessmentId: quiz.id, classId: bio6.id, timeLimitMinutes: 30 },
      { ownerId: other.id, assessmentId: chemQuiz.id, classId: chem.id },
    ])
    .returning();
  Object.assign(ids, { asg3: asg3.id, asg6: asg6.id, asgChem: asgChem.id });
});

describe("the version route", () => {
  it("is the class owner's only, and returns the same stamp the page reads", async () => {
    as(ids.other, "teacher");
    expect((await route(`?class=${ids.bio3}`)).status).toBe(403);
    as(ids.ana, "student");
    expect((await route(`?class=${ids.bio3}`)).status).toBe(403);
    expect((await route("")).status).toBe(403);
    state.session = null;
    expect((await route(`?class=${ids.bio3}`)).status).toBe(401);
    as(ids.jon, "teacher");
    expect((await route("?class=not-a-class")).status).toBe(404);
    expect((await route(`?class=${crypto.randomUUID()}`)).status).toBe(404);
    const res = await route(`?class=${ids.bio3}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ version: await version() });
    const mine = await route("");
    expect(await mine.json()).toEqual({ version: await version(null) });
  });
});

describe("the stamp", () => {
  let attemptId = "";

  it("never moves on heartbeats or answer saves; moves on start, pause, ask, reopen and submit", async () => {
    const v0 = await version();
    expect(await version()).toBe(v0);
    as(ids.ana, "student");
    ({ attemptId } = await ok(startAttempt(ids.asg3, null)));
    const t = new Date(Date.now() + 1000); // one moment for every read, so the minute tick holds
    const started = await version(ids.bio3, t);
    expect(started).not.toBe(v0);
    await ok(attemptHeartbeat(attemptId));
    await ok(saveAnswer(attemptId, ids.q[0].id, { kind: "choice", optionId: ids.q[0].opt }));
    await ok(saveAnswer(attemptId, ids.q[0].id, { kind: "choice", optionId: ids.q[0].opt }));
    expect(await version(ids.bio3, t)).toBe(started);

    await ok(finishLater(attemptId));
    const paused = await version(ids.bio3, t);
    expect(paused).not.toBe(started);
    await ok(askToFinish(attemptId));
    const asked = await version(ids.bio3, t);
    expect(asked).not.toBe(paused);
    await ok(askToFinish(attemptId)); // asking again only moves the time
    as(ids.jon, "teacher");
    await ok(letContinue(attemptId));
    const resumed = await version(ids.bio3, t);
    expect(resumed).not.toBe(asked);
    as(ids.ana, "student");
    await ok(submitAttempt(attemptId));
    expect(await version()).not.toBe(resumed);

    // Each milestone logged once, in order, worded for the feed.
    const pauses = await listClassActivity(ids.bio3, { groups: ["pauses"] });
    expect(pauses.map(describeActivity)).toEqual([
      "Resumed Cell Quiz (you let them continue)",
      "Asked to finish Cell Quiz",
      "Chose Finish later on Cell Quiz",
    ]);
    expect(pauses[2].detail).toEqual({ attemptNumber: 1, reason: "student" });
    expect(pauses[0].detail).toEqual({ attemptNumber: 1, by: "teacher" });
  });

  it("shows an idle pause before anything writes it; the log lands when it happened, once", async () => {
    as(ids.ben, "student");
    const { attemptId: id } = await ok(startAttempt(ids.asg3, null));
    const idleSince = minutesAgo(11);
    await db
      .update(schema.attempts)
      .set({ lastActiveAt: idleSince })
      .where(eq(schema.attempts.id, id));
    const t = new Date();
    const idle = await version(ids.bio3, t);
    const row = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, id) });
    expect(row?.pausedAt).toBeNull(); // nothing was written
    // Nine minutes in, the same attempt read as testing: a different stamp.
    expect(await version(ids.bio3, new Date(idleSince.getTime() + 9 * 60_000))).not.toBe(idle);

    // Two requests settling at once write the pause once and log it once, stamped at the pause.
    expect(await Promise.all([settleAttempt(id), settleAttempt(id)])).toEqual([true, true]);
    const logged = (await logRows(ids.ben, "test_paused")).filter(
      (r) => r.assignmentId === ids.asg3
    );
    expect(logged).toHaveLength(1);
    expect(logged[0].detail).toEqual({ attemptNumber: 1, reason: "idle" });
    expect(logged[0].createdAt.getTime()).toBe(idleSince.getTime() + 10 * 60_000);
    expect(await version(ids.bio3, t)).not.toBe(idle); // now stored: the paused count moved

    as(ids.jon, "teacher");
    const { code } = await ok(getResumeCode(false));
    as(ids.ben, "student");
    await ok(resumeWithCode(id, code));
    const reopened = await logRows(ids.ben, "resumed");
    expect(reopened.map((r) => r.detail)).toEqual([{ attemptNumber: 1, by: "code" }]);
    await ok(submitAttempt(id));
  });

  it("logs a window-close pause as closed", async () => {
    as(ids.cal, "student");
    const { attemptId: id } = await ok(startAttempt(ids.asg6, null));
    const closesAt = minutesAgo(1);
    await db
      .update(schema.assignments)
      .set({ closesAt })
      .where(eq(schema.assignments.id, ids.asg6));
    await db
      .update(schema.attempts)
      .set({ startedAt: minutesAgo(10), dueAt: closesAt, lastActiveAt: minutesAgo(2) })
      .where(eq(schema.attempts.id, id));
    expect(await submitAttempt(id, true)).toMatchObject({ ok: false, status: 423 });
    const [logged] = await logRows(ids.cal, "test_paused");
    expect(logged.detail).toEqual({ attemptNumber: 1, reason: "closed" });
    expect(Math.abs(logged.createdAt.getTime() - closesAt.getTime())).toBeLessThan(1000);
    await db
      .update(schema.assignments)
      .set({ closesAt: null })
      .where(eq(schema.assignments.id, ids.asg6));
  });

  it("moves on unlocks, corrections, finals, check-offs, windows, rosters and new log rows only", async () => {
    const [anaAttempt] = await db
      .select()
      .from(schema.attempts)
      .where(
        and(eq(schema.attempts.studentId, ids.ana), eq(schema.attempts.assignmentId, ids.asg3))
      );
    const steps: [string, () => Promise<unknown>][] = [
      [
        "a retake request",
        () =>
          db.insert(schema.attemptUnlocks).values({
            assignmentId: ids.asg3,
            studentId: ids.ana,
            attemptNumber: 2,
            requestedAt: new Date(),
          }),
      ],
      [
        "its approval",
        () =>
          db
            .update(schema.attemptUnlocks)
            .set({ grantedAt: new Date(), grantedBy: ids.jon })
            .where(eq(schema.attemptUnlocks.studentId, ids.ana)),
      ],
      [
        "corrections sent in",
        () =>
          db.insert(schema.corrections).values({
            attemptId: anaAttempt.id,
            questionId: ids.q[1].id,
            studentId: ids.ana,
            correctAnswer: "Right",
            explanation: "Because",
            status: "submitted",
            submittedAt: new Date(),
          }),
      ],
      [
        "corrections approved",
        () =>
          db
            .update(schema.corrections)
            .set({ status: "approved", reviewedAt: new Date(), reviewerId: ids.jon })
            .where(eq(schema.corrections.attemptId, anaAttempt.id)),
      ],
      [
        "a final score recomputed",
        () =>
          db
            .update(schema.assignmentFinalScores)
            .set({ computedAt: new Date(Date.now() + 5000) })
            .where(eq(schema.assignmentFinalScores.studentId, ids.ana)),
      ],
      [
        "an activity done, then checked off",
        async () => {
          const [act] = await db
            .insert(schema.relearningActivities)
            .values({ ownerId: ids.jon, kind: "reading", title: "Notes" })
            .returning();
          await db
            .insert(schema.activityCompletions)
            .values({ studentId: ids.ana, activityId: act.id });
        },
      ],
      ["the check-off", () => db.update(schema.activityCompletions).set({ teacherVerified: true })],
      ["a student's login", () => logActivity({ userId: ids.ana, kind: "login" })],
      [
        "a new student",
        async () => {
          const [dee] = await db
            .insert(schema.users)
            .values({
              email: "dee@s",
              passwordHash: "x",
              role: "student",
              firstName: "Dee",
              lastName: "D",
            })
            .returning();
          await db.insert(schema.enrollments).values({ classId: ids.bio3, studentId: dee.id });
        },
      ],
      [
        "an unmatched worksheet email",
        async () => {
          const [ws] = await db
            .insert(schema.worksheets)
            .values({ ownerId: ids.jon, scriptId: "script-1", title: "WS" })
            .returning();
          await db.insert(schema.worksheetEvents).values({
            worksheetId: ws.id,
            email: "stranger@x",
            event: "submit",
            occurredAt: new Date(),
          });
        },
      ],
    ];
    for (const [what, step] of steps) {
      const before = await version();
      await step();
      expect(await version(), what).not.toBe(before);
    }

    // Nothing of another teacher's moves it: their student's login, their test.
    const before = await version();
    const [eve] = await db
      .insert(schema.users)
      .values({
        email: "eve@s",
        passwordHash: "x",
        role: "student",
        firstName: "Eve",
        lastName: "E",
      })
      .returning();
    await db.insert(schema.enrollments).values({ classId: ids.chem, studentId: eve.id });
    await logActivity({ userId: eve.id, kind: "login" });
    as(eve.id, "student");
    const { attemptId } = await ok(startAttempt(ids.asgChem, null));
    await ok(submitAttempt(attemptId));
    expect(await version()).toBe(before);

    // A window opening with nothing written moves it.
    const t = new Date();
    await db
      .update(schema.assignments)
      .set({ opensAt: new Date(t.getTime() + 60_000) })
      .where(eq(schema.assignments.id, ids.asg6));
    const shut = await version(ids.bio3, t);
    expect(await version(ids.bio3, new Date(t.getTime() + 120_000))).not.toBe(shut);
  });
});

describe("Recent activity", () => {
  it("this class is its own tests plus its students' class-less events; since and kinds filter", async () => {
    // Ana is in P3 and P6; Cal is in P6 and the other teacher's Chem.
    await logActivity({
      userId: ids.ana,
      kind: "attempt_started",
      assignmentId: ids.asg6,
      detail: { attemptNumber: 2 },
    });
    await logActivity({
      userId: ids.ana,
      kind: "practice_completed",
      detail: { title: "LT2 practice" },
    });
    await logActivity({
      userId: ids.cal,
      kind: "attempt_started",
      assignmentId: ids.asgChem,
      detail: { attemptNumber: 1 },
    });
    await logActivity({
      userId: ids.ana,
      kind: "class_joined",
      detail: { className: "Biology 3rd" },
      at: new Date(Date.now() - 2 * 86_400_000),
    });

    const p3 = await listClassActivity(ids.bio3);
    expect(p3.every((r) => !r.assignmentId || r.assignmentId === ids.asg3)).toBe(true);
    expect(p3.some((r) => r.kind === "practice_completed" && r.userId === ids.ana)).toBe(true);
    const p6 = await listClassActivity(ids.bio6);
    expect(p6.some((r) => r.assignmentId === ids.asg6 && r.userId === ids.ana)).toBe(true);
    expect(p6.some((r) => r.assignmentId === ids.asgChem)).toBe(false); // Cal's Chem test
    expect(p6.some((r) => r.assignmentId === ids.asg3)).toBe(false); // Ana's P3 test

    // All classes: every class of the teacher, each assignment event naming its place.
    const mine = await listRecentActivity(ids.jon, { hours: 1 });
    expect(mine.some((r) => r.assignmentId === ids.asgChem)).toBe(false);
    const retake = mine.find((r) => r.assignmentId === ids.asg6 && r.kind === "attempt_started")!;
    expect(placeLabel(retake.place!)).toBe("Biology · P6");
    expect(describeActivity(retake)).toBe("Started retake (try 2) on Cell Quiz");
    expect(mine.find((r) => r.kind === "practice_completed")!.place).toBeNull();
    const theirs = await listRecentActivity(ids.other, { hours: 1 });
    expect(theirs.some((r) => r.assignmentId === ids.asgChem && r.userId === ids.cal)).toBe(true);
    expect(theirs.some((r) => r.assignmentId === ids.asg6)).toBe(false);

    // Since: the join two days ago shows only with 3 days.
    const day = new Date(Date.now() - 86_400_000);
    const threeDays = new Date(Date.now() - 3 * 86_400_000);
    expect(
      (await listClassActivity(ids.bio3, { since: day })).some((r) => r.kind === "class_joined")
    ).toBe(false);
    expect(
      (await listClassActivity(ids.bio3, { since: threeDays })).some(
        (r) => r.kind === "class_joined"
      )
    ).toBe(true);

    // Kinds: the SQL filter puts every row where `activityGroup` does; logins only when asked.
    const all = { since: threeDays, limit: 500 };
    const everything = await listRecentActivity(ids.jon, all);
    for (const g of [...FEED_GROUPS, "logins"] as const) {
      const rows = await listRecentActivity(ids.jon, { ...all, groups: [g] });
      expect(
        rows.every((r) => activityGroup(r) === g),
        g
      ).toBe(true);
      expect(rows.length, g).toBe(everything.filter((r) => activityGroup(r) === g).length);
    }
    const noLogins = await listRecentActivity(ids.jon, { ...all, groups: [...FEED_GROUPS] });
    expect(noLogins.some((r) => r.kind === "login" || r.kind === "class_joined")).toBe(false);
    expect(noLogins.length).toBeGreaterThan(0);
    expect(await listRecentActivity(ids.jon, { ...all, groups: [] })).toEqual([]);
  });
});
