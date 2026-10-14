/**
 * The Dashboard's class gradebook (Jon, Oct 13 2026, docs/dashboard-plan.md build step 4): it
 * follows the sidebar course and opens on the period the teacher picked last (decisions 1 and 8),
 * remembered in a cookie that is checked against the teacher's own classes on that course every
 * time, and the cell panel's retake controls (Unlock try N, Approve / Decline, Take back) read and
 * move the loader's unlock state. In-memory Postgres with the real migrations.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({
  session: null as Session | null,
  jar: new Map<string, string>(),
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (state.jar.has(k) ? { name: k, value: state.jar.get(k)! } : undefined),
    set: (k: string, v: string) => state.jar.set(k, v),
    delete: (k: string) => state.jar.delete(k),
  }),
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { db, schema } from "@/db";
import { CLASS_COOKIE } from "@/lib/class-focus";
import { tagLabel } from "@/lib/class-gradebook";
import { getCurrentClass } from "@/lib/current-course";
import { rightNow, timeLeft } from "@/lib/gradebook-view";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { requestRetake } from "../student/actions";
import { pickDashboardClass } from "./actions";
import { revokeAttemptUnlock, undoRetakeApproval, unlockNextAttempt } from "./results/actions";

const ids = {
  jon: "",
  other: "",
  cal: "",
  bio: "",
  ap: "",
  bio2: "",
  bio3: "",
  bio6: "",
  ap5: "",
  othersClass: "",
  quiz: "",
  q: "",
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
const current = async (courseId: string) =>
  (await getCurrentClass(ids.jon, courseId)).current?.id ?? null;

beforeAll(async () => {
  const [jon, other, cal] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "Other", lastName: "T" },
      { email: "cal@s", passwordHash: "x", role: "student", firstName: "Cal", lastName: "Reed" },
    ])
    .returning();
  Object.assign(ids, { jon: jon.id, other: other.id, cal: cal.id });
  const [bio, ap, othersCourse] = await db
    .insert(schema.courses)
    .values([
      { ownerId: jon.id, name: "Biology" },
      { ownerId: jon.id, name: "Anatomy and Physiology" },
      { ownerId: other.id, name: "Biology" },
    ])
    .returning();
  Object.assign(ids, { bio: bio.id, ap: ap.id });
  // Inserted out of period order: the Classes page order (sort order, then period) decides.
  const [bio6, bio2, bio3, ap5, othersClass] = await db
    .insert(schema.classes)
    .values([
      { ownerId: jon.id, courseId: bio.id, name: "Bio 6th", period: "6" },
      { ownerId: jon.id, courseId: bio.id, name: "Bio 2nd", period: "2" },
      { ownerId: jon.id, courseId: bio.id, name: "Bio 3rd", period: "3rd" },
      { ownerId: jon.id, courseId: ap.id, name: "A&P 5th", period: "5" },
      { ownerId: other.id, courseId: othersCourse.id, name: "Their Bio", period: "1" },
    ])
    .returning();
  Object.assign(ids, {
    bio2: bio2.id,
    bio3: bio3.id,
    bio6: bio6.id,
    ap5: ap5.id,
    othersClass: othersClass.id,
  });
  await db.insert(schema.enrollments).values({ classId: bio2.id, studentId: cal.id });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: jon.id, courseId: bio.id, name: "Bank" })
    .returning();
  const [q] = await db
    .insert(schema.questions)
    .values({ bankId: bank.id, ownerId: jon.id, type: "multiple_choice", stem: "Q", points: 1 })
    .returning();
  ids.q = q.id;
  const [quizA] = await db
    .insert(schema.assessments)
    .values({
      ownerId: jon.id,
      courseId: bio.id,
      type: "formative",
      title: "Cell Quiz",
      isPublished: true,
    })
    .returning();
  const [quiz] = await db
    .insert(schema.assignments)
    .values({
      ownerId: jon.id,
      assessmentId: quizA.id,
      classId: bio2.id,
      attemptsAllowed: 3,
      retakesNeedUnlock: true,
      retakeWaitHours: 24,
    })
    .returning();
  ids.quiz = quiz.id;
  const [calTry] = await db
    .insert(schema.attempts)
    .values({
      assignmentId: quiz.id,
      studentId: cal.id,
      number: 1,
      questionSet: [
        { questionId: q.id, sectionId: q.id, learningTargetId: null, points: 1, order: 0 },
      ],
      status: "graded",
      percent: 60,
      submittedAt: new Date(Date.now() - 30 * 60_000),
    })
    .returning();
  // Corrections come before asking, with "Retakes need my OK" too (Jon, Oct 14 2026, decision 4).
  await db.insert(schema.corrections).values({
    attemptId: calTry.id,
    questionId: q.id,
    studentId: cal.id,
    correctAnswer: "Right",
    explanation: "I picked the wrong one.",
    status: "approved",
    submittedAt: new Date(),
  });
});

beforeEach(() => state.jar.clear());

describe("which period the gradebook opens on", () => {
  it("lists the course's own classes in Classes-page order and opens on the first until one is picked", async () => {
    const { classes } = await getCurrentClass(ids.jon, ids.bio);
    expect(classes.map((c) => c.name)).toEqual(["Bio 2nd", "Bio 3rd", "Bio 6th"]);
    expect(await current(ids.bio)).toBe(ids.bio2);
    expect(await getCurrentClass(ids.jon, null)).toEqual({ current: null, classes: [] });
  });

  it("remembers the last pick in each course", async () => {
    as(ids.jon, "teacher");
    expect(await ok(pickDashboardClass(ids.bio6))).toEqual({ classId: ids.bio6 });
    expect(await current(ids.bio)).toBe(ids.bio6);
    await ok(pickDashboardClass(ids.ap5));
    // Switching the sidebar to A&P and back keeps each course's period.
    expect(await current(ids.ap)).toBe(ids.ap5);
    expect(await current(ids.bio)).toBe(ids.bio6);
    await ok(pickDashboardClass(ids.bio3));
    expect(await current(ids.bio)).toBe(ids.bio3);
    expect(state.jar.get(CLASS_COOKIE)?.split(",")).toEqual([ids.bio3, ids.ap5, ids.bio6]);
  });

  it("is owner only: another teacher's class, a bad id, or a student is refused and nothing is remembered", async () => {
    as(ids.jon, "teacher");
    await expect(pickDashboardClass(ids.othersClass)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(pickDashboardClass("not-a-class")).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    as(ids.cal, "student");
    await expect(pickDashboardClass(ids.bio2)).resolves.toMatchObject({ ok: false, status: 403 });
    expect(state.jar.has(CLASS_COOKIE)).toBe(false);
  });

  it("never lets a forged or stale cookie pick someone else's class or another course's", async () => {
    state.jar.set(CLASS_COOKIE, `${ids.othersClass},garbage,${ids.ap5}`);
    expect(await current(ids.bio)).toBe(ids.bio2);
    expect(await current(ids.ap)).toBe(ids.ap5);
    // The other teacher's own course has their class, but Jon's cookie can't reach it.
    const theirs = await db.query.classes.findFirst({
      where: (c, { eq }) => eq(c.id, ids.othersClass),
    });
    expect((await getCurrentClass(ids.jon, theirs!.courseId)).current).toBeNull();
  });
});

describe("the cell panel's retake controls", () => {
  const cal = async () => {
    const gb = (await getClassGradebook(ids.bio2))!;
    return gb.rows.find((r) => r.student.id === ids.cal)!.cells[0];
  };

  it("Unlock try N, a request, Approve, Take back keeping the request, and Decline", async () => {
    let cell = await cal();
    expect(cell.unlock).toEqual({
      attemptNumber: 2,
      state: "locked",
      requestedAt: null,
      reopensUntil: null,
    });
    expect(tagLabel(cell.tag)).toBe("Ready, needs your OK");

    as(ids.cal, "student");
    await ok(requestRetake(ids.quiz));
    cell = await cal();
    expect(cell.unlock).toMatchObject({ attemptNumber: 2, state: "requested" });
    expect(cell.unlock?.requestedAt).toBeInstanceOf(Date);
    expect(cell.tag.kind).toBe("request");

    as(ids.jon, "teacher");
    await ok(unlockNextAttempt(ids.quiz, ids.cal));
    cell = await cal();
    expect(cell.unlock?.state).toBe("unlocked");
    // The 24-hour wait still stops the start, and the tag says so.
    expect(cell.tag.kind).toBe("unlocked");
    expect(tagLabel(cell.tag)).toMatch(/^Unlocked · after /);

    // Take back is the inbox's Undo: the request survives.
    await ok(undoRetakeApproval(ids.quiz, ids.cal));
    cell = await cal();
    expect(cell.unlock?.state).toBe("requested");

    // Decline removes it; only the student can ask again.
    await ok(revokeAttemptUnlock(ids.quiz, ids.cal));
    cell = await cal();
    expect(cell.unlock?.state).toBe("locked");

    // An unasked unlock (Ready, needs your OK) is taken back outright.
    await ok(unlockNextAttempt(ids.quiz, ids.cal));
    expect((await cal()).unlock?.state).toBe("unlocked");
    await ok(undoRetakeApproval(ids.quiz, ids.cal));
    expect((await cal()).unlock?.state).toBe("locked");
  });

  it("offers nothing while a try is open, and the Right now strip shows it with time left", async () => {
    const [open] = await db
      .insert(schema.attempts)
      .values({
        assignmentId: ids.quiz,
        studentId: ids.cal,
        number: 2,
        questionSet: [
          { questionId: ids.q, sectionId: ids.q, learningTargetId: null, points: 1, order: 0 },
        ],
        status: "in_progress",
        lastActiveAt: new Date(),
        dueAt: new Date(Date.now() + 18 * 60_000 - 1000),
      })
      .returning();
    const gb = (await getClassGradebook(ids.bio2))!;
    const cell = gb.rows[0].cells[0];
    expect(cell.unlock).toBeNull();
    expect(cell.tag.kind).toBe("taking");
    const live = rightNow(gb);
    expect(live.paused).toEqual([]);
    expect(live.testing).toMatchObject([
      { attemptId: open.id, attemptNumber: 2, answered: 0, total: 1, paused: false },
    ]);
    expect(timeLeft(live.testing[0].dueAt, gb.generatedAt)).toBe("18 min left");
  });
});
