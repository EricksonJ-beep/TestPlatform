/**
 * Master code (Jon, Nov 20 2026): one easy code per teacher, good until 3:30 PM school time,
 * that stands in for any of that teacher's access codes and for the resume code, and for
 * nothing else.
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
import { masterCodeEnd } from "@/lib/master-code";
import { getDashboardVersion } from "@/lib/queries/dashboard-version";
import { getMasterCode, stopMasterCode } from "../app/results/actions";
import { finishLater, resumeWithCode, startAttempt } from "./actions";

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  asg: "",
  closed: "",
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
  // Two tests, each with its own access code; the second is past its close.
  const [asg, closed] = await db
    .insert(schema.assignments)
    .values([
      { ownerId: t.id, assessmentId: assessment.id, classId: cls.id, accessCode: "ABC234" },
      {
        ownerId: t.id,
        assessmentId: assessment.id,
        classId: cls.id,
        accessCode: "XYZ789",
        closesAt: new Date(Date.now() - 60_000),
      },
    ])
    .returning();
  ids.asg = asg.id;
  ids.closed = closed.id;
});

describe("Master code", () => {
  let code = "";
  let attemptId = "";

  it("only a teacher gets one: a word and a number, good until 3:30 PM school time", async () => {
    as(ids.s1, "student");
    expect(await getMasterCode(false)).toMatchObject({ ok: false, status: 403 });
    expect(await stopMasterCode()).toMatchObject({ ok: false, status: 403 });
    as(ids.teacher, "teacher");
    const before = await getDashboardVersion(ids.teacher, null);
    const got = await ok(getMasterCode(false));
    code = got.code;
    expect(code).toMatch(/^[a-z]+\d{2,3}$/);
    expect(new Date(got.expiresAt).getTime()).toBe(masterCodeEnd(new Date()).getTime());
    expect((await ok(getMasterCode(false))).code).toBe(code); // the same code until it ends
    expect(await getDashboardVersion(ids.teacher, null)).not.toBe(before); // other tabs follow
  });

  it("starts a test in place of its own access code; the test's code still works", async () => {
    as(ids.other, "teacher");
    const theirs = (await ok(getMasterCode(false))).code;
    as(ids.s1, "student");
    expect(await startAttempt(ids.asg, "nope99")).toMatchObject({ ok: false, status: 400 });
    // Another teacher's master code opens nothing of this teacher's.
    if (theirs !== code)
      expect(await startAttempt(ids.asg, theirs)).toMatchObject({ ok: false, status: 400 });
    ({ attemptId } = await ok(startAttempt(ids.asg, ` ${code.toUpperCase()} `)));
    as(ids.s2, "student");
    await ok(startAttempt(ids.asg, "abc234"));
  });

  it("is only the code: a closed test stays closed", async () => {
    as(ids.s1, "student");
    expect(await startAttempt(ids.closed, code)).toMatchObject({ ok: false, status: 403 });
  });

  it("reopens a paused test", async () => {
    as(ids.s1, "student");
    await ok(finishLater(attemptId));
    expect(await resumeWithCode(attemptId, "nope99")).toMatchObject({ ok: false, status: 400 });
    await ok(resumeWithCode(attemptId, code));
    const a = await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) });
    expect(a!.pausedAt).toBeNull();
  });

  it("a new code ends the old one; Turn off ends it; a code past its time is dead", async () => {
    const refused = { ok: false, status: 400 };
    as(ids.s1, "student");
    await ok(finishLater(attemptId));
    as(ids.teacher, "teacher");
    const fresh = (await ok(getMasterCode(true))).code;
    as(ids.s1, "student");
    if (fresh !== code) expect(await resumeWithCode(attemptId, code)).toMatchObject(refused);
    as(ids.teacher, "teacher");
    await ok(stopMasterCode());
    as(ids.s1, "student");
    expect(await resumeWithCode(attemptId, fresh)).toMatchObject(refused);
    // Past 3:30 PM: the row is still there, and no longer opens anything.
    as(ids.teacher, "teacher");
    const last = (await ok(getMasterCode(false))).code;
    await db
      .update(schema.masterCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.masterCodes.teacherId, ids.teacher));
    as(ids.s1, "student");
    expect(await resumeWithCode(attemptId, last)).toMatchObject(refused);
  });
});
