/**
 * Hardening plan H1.4 (Nov 9 2026): a submit is claimed once, a grading that failed midway is
 * finished later, no answer lands after the claim, and two starts at once open one attempt.
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
import { settleAttempt } from "@/lib/attempt-pause";
import { closeExpiredAttempts } from "@/lib/attempt-sweep";
import { claimAttempt, finishIfClaimed } from "@/lib/attempts";
import { saveAnswer, startAttempt, submitAttempt } from "./actions";

const ids = {
  students: [] as string[],
  assignment: "",
  mc: [] as { id: string; right: string; wrong: string }[],
};
const asStudent = (i: number) => {
  state.session = {
    userId: ids.students[i],
    role: "student",
    email: `s${i}@s`,
    firstName: "S",
    lastName: String(i),
  };
};
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const attemptRow = async (id: string) =>
  (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, id) }))!;
const answerAll = async (attemptId: string) => {
  for (const q of ids.mc)
    await ok(saveAnswer(attemptId, q.id, { kind: "choice", optionId: q.right }));
};

beforeAll(async () => {
  const [t] = await db
    .insert(schema.users)
    .values({ email: "t@t", passwordHash: "x", role: "teacher", firstName: "T", lastName: "T" })
    .returning();
  const students = await db
    .insert(schema.users)
    .values(
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
        email: `s${i}@s`,
        passwordHash: "x",
        role: "student" as const,
        firstName: "S",
        lastName: String(i),
      }))
    )
    .returning();
  ids.students = students.map((s) => s.id);
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
  const [lt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: course.id, code: "LT1", title: "One", sortOrder: 1 })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P1" })
    .returning();
  await db
    .insert(schema.enrollments)
    .values(ids.students.map((studentId) => ({ classId: cls.id, studentId })));
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  for (let i = 1; i <= 3; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({ bankId: bank.id, ownerId: t.id, type: "multiple_choice", stem: `MC ${i}` })
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
    .values({ assessmentId: assessment.id, title: "LT1", learningTargetId: lt.id, sortOrder: 0 })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values(ids.mc.map((q, i) => ({ sectionId: sec.id, questionId: q.id, sortOrder: i })));
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id, attemptsAllowed: 3 })
    .returning();
  ids.assignment = asg.id;
});

describe("submit is claimed once", () => {
  it("two submits at the same moment: one grades, the other is told it's already in", async () => {
    asStudent(0);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    await answerAll(attemptId);
    const results = await Promise.all([submitAttempt(attemptId), submitAttempt(attemptId)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, status: 409 });
    const a = await attemptRow(attemptId);
    expect(a.status).toBe("graded");
    expect(a.percent).toBe(100);
    const submitted = await db
      .select()
      .from(schema.activityLog)
      .where(eq(schema.activityLog.userId, ids.students[0]));
    expect(submitted.filter((l) => l.kind === "attempt_submitted")).toHaveLength(1);
  });

  it("grades every question, blank ones included, and writes the target scores", async () => {
    asStudent(1);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    await ok(saveAnswer(attemptId, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].right }));
    await ok(submitAttempt(attemptId));
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.attemptId, attemptId));
    expect(responses).toHaveLength(3);
    expect(responses.filter((r) => r.isCorrect)).toHaveLength(1);
    // The answered row kept its answer; blank rows were added with no answer.
    expect(responses.find((r) => r.questionId === ids.mc[0].id)?.answer).toMatchObject({
      kind: "choice",
    });
    const targets = await db
      .select()
      .from(schema.attemptTargetScores)
      .where(eq(schema.attemptTargetScores.attemptId, attemptId));
    expect(targets).toHaveLength(1);
    expect(targets[0].pointsEarned).toBe(1);
  });
});

describe("a claim whose grading never finished", () => {
  /** What a database failure between the claim and the grading leaves behind. */
  const strand = async (attemptId: string, agoMs: number) => {
    const at = new Date(Date.now() - agoMs);
    await db
      .update(schema.attempts)
      .set({ submittedAt: at, lastActiveAt: at })
      .where(eq(schema.attempts.id, attemptId));
  };

  it("takes no more answers, and never pauses", async () => {
    asStudent(2);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    await answerAll(attemptId);
    await strand(attemptId, 60 * 60_000); // an hour ago: long past the idle pause
    await expect(
      saveAnswer(attemptId, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].wrong })
    ).resolves.toMatchObject({ ok: false, status: 409 });
    expect(await settleAttempt(attemptId)).toBe(false);
    expect((await attemptRow(attemptId)).pausedAt).toBeNull();
  });

  it("is finished by the student's next submit, at the time they first submitted", async () => {
    asStudent(2);
    const open = (
      await db.select().from(schema.attempts).where(eq(schema.attempts.status, "in_progress"))
    ).find((a) => a.studentId === ids.students[2])!;
    const firstSubmit = open.submittedAt!;
    await ok(submitAttempt(open.id));
    const a = await attemptRow(open.id);
    expect(a.status).toBe("graded");
    expect(a.percent).toBe(100);
    expect(a.submittedAt?.getTime()).toBe(firstSubmit.getTime());
  });

  it("is left alone while the first grading may still be running (under 20 seconds)", async () => {
    asStudent(3);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    expect(await claimAttempt(attemptId, new Date())).toBe("claimed");
    expect(await claimAttempt(attemptId, new Date())).toBe("busy");
    await expect(submitAttempt(attemptId)).resolves.toMatchObject({ ok: false, status: 409 });
    expect(await finishIfClaimed(attemptId)).toBe("grading");
    expect((await attemptRow(attemptId)).status).toBe("in_progress");
  });

  it("is finished when the student comes back (Start, or opening the test)", async () => {
    asStudent(3);
    const open = (
      await db.select().from(schema.attempts).where(eq(schema.attempts.status, "in_progress"))
    ).find((a) => a.studentId === ids.students[3])!;
    await strand(open.id, 30_000);
    // Start hands back the same attempt (no second try on the same click)…
    const r = await ok(startAttempt(ids.assignment, null));
    expect(r).toMatchObject({ attemptId: open.id, resumed: true });
    // …and it is graded now.
    expect((await attemptRow(open.id)).status).toBe("graded");
    expect(await finishIfClaimed(open.id)).toBe("finished");
  });

  it("an attempt nobody claimed is simply open", async () => {
    asStudent(4);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    expect(await finishIfClaimed(attemptId)).toBe("open");
    expect((await attemptRow(attemptId)).submittedAt).toBeNull();
  });
});

describe("two starts at once", () => {
  it("open one attempt, and both callers get it", async () => {
    asStudent(5);
    const [a, b] = await Promise.all([
      startAttempt(ids.assignment, null),
      startAttempt(ids.assignment, null),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.data.attemptId).toBe(b.data.attemptId);
    const rows = (await db.select().from(schema.attempts)).filter(
      (r) => r.studentId === ids.students[5]
    );
    expect(rows).toHaveLength(1);
  });
});

describe("abandoned attempts close (H3.2)", () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const open = async (i: number, set: { dueAt: Date; lastActiveAt: Date }) => {
    asStudent(i);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    await ok(saveAnswer(attemptId, ids.mc[0].id, { kind: "choice", optionId: ids.mc[0].right }));
    await db.update(schema.attempts).set(set).where(eq(schema.attempts.id, attemptId));
    return attemptId;
  };

  it("a test whose time ran out while the student was working is submitted at its deadline", async () => {
    // Working until a minute before time ran out, then walked away.
    const due = minutesAgo(5);
    const attemptId = await open(6, { dueAt: due, lastActiveAt: minutesAgo(6) });
    expect(await closeExpiredAttempts({ assignmentId: ids.assignment })).toBe(1);
    const a = await attemptRow(attemptId);
    expect(a.status).toBe("graded");
    expect(a.submittedAt?.getTime()).toBe(due.getTime());
    expect(a.score).toBe(1); // the one saved answer counts; blanks are wrong
    // Running it again finds nothing.
    expect(await closeExpiredAttempts({ studentId: ids.students[6] })).toBe(0);
  });

  it("a test that went idle before its time ran out pauses instead (Finish later)", async () => {
    const attemptId = await open(7, { dueAt: minutesAgo(5), lastActiveAt: minutesAgo(60) });
    expect(await closeExpiredAttempts({ studentId: ids.students[7] })).toBe(0);
    const a = await attemptRow(attemptId);
    expect(a.status).toBe("in_progress");
    expect(a.pausedAt).not.toBeNull();
  });

  it("a test still inside its time is left alone, and so is another teacher's", async () => {
    const attemptId = await open(8, {
      dueAt: new Date(Date.now() + 10 * 60_000),
      lastActiveAt: new Date(),
    });
    expect(await closeExpiredAttempts({ assignmentId: ids.assignment })).toBe(0);
    expect((await attemptRow(attemptId)).status).toBe("in_progress");
    await db
      .update(schema.attempts)
      .set({ dueAt: minutesAgo(5) })
      .where(eq(schema.attempts.id, attemptId));
    expect(await closeExpiredAttempts({ ownerId: ids.students[0] })).toBe(0); // not the owner
    expect((await attemptRow(attemptId)).status).toBe("in_progress");
  });

  it("a submit that was claimed and never graded is finished by the sweep", async () => {
    const open8 = (
      await db.select().from(schema.attempts).where(eq(schema.attempts.status, "in_progress"))
    ).find((a) => a.studentId === ids.students[8])!;
    const at = minutesAgo(2);
    await db
      .update(schema.attempts)
      .set({ dueAt: null, submittedAt: at, lastActiveAt: at })
      .where(eq(schema.attempts.id, open8.id));
    expect(await closeExpiredAttempts({ studentId: ids.students[8] })).toBe(1);
    expect((await attemptRow(open8.id)).status).toBe("graded");
  });
});
