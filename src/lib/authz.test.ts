/**
 * Authorization rules (Ticket 0.5). Runs against an in-memory PGlite Postgres
 * with the real migrations, so every guard is exercised through real SQL.
 *
 * Fixture: two teachers (A, B), two students (S1 in A's class, S2 in B's class),
 * a bank owned by A shared view-only with B, an assignment in A's class, and
 * an attempt by S1 on it.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("@/lib/session", () => ({
  getCurrentSession: async () => state.session,
}));

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pglite", PGLITE_DIR: ":memory:" };
});

import { db, schema } from "@/db";
import * as authz from "@/lib/authz";

type Ids = {
  teacherA: string;
  teacherB: string;
  student1: string;
  student2: string;
  bankA: string;
  bankB: string;
  classA: string;
  classB: string;
  assessmentA: string;
  assignmentA: string;
  attemptS1: string;
};
const ids = {} as Ids;

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const asNobody = () => {
  state.session = null;
};

const MISSING = "00000000-0000-0000-0000-000000000000";

beforeAll(async () => {
  const [org] = await db.insert(schema.organizations).values({ name: "Test HS" }).returning();
  const mk = (email: string, role: "teacher" | "student") => ({
    email,
    passwordHash: "x",
    role,
    firstName: email,
    lastName: "Test",
    organizationId: org.id,
  });
  const [tA, tB, s1, s2] = await db
    .insert(schema.users)
    .values([
      mk("teacher-a@test", "teacher"),
      mk("teacher-b@test", "teacher"),
      mk("student-1@test", "student"),
      mk("student-2@test", "student"),
    ])
    .returning();
  Object.assign(ids, { teacherA: tA.id, teacherB: tB.id, student1: s1.id, student2: s2.id });

  const [courseA] = await db
    .insert(schema.courses)
    .values({ ownerId: tA.id, name: "Biology" })
    .returning();
  const [bankA, bankB] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: tA.id, courseId: courseA.id, name: "A private" },
      { ownerId: tB.id, name: "B private" },
    ])
    .returning();
  ids.bankA = bankA.id;
  ids.bankB = bankB.id;

  await db.insert(schema.shares).values({
    resourceType: "question_bank",
    resourceId: bankA.id,
    ownerId: tA.id,
    sharedWithUserId: tB.id,
    permission: "view",
  });

  const [classA, classB] = await db
    .insert(schema.classes)
    .values([
      { ownerId: tA.id, courseId: courseA.id, name: "Bio P3" },
      { ownerId: tB.id, name: "PhysSci P1" },
    ])
    .returning();
  ids.classA = classA.id;
  ids.classB = classB.id;
  await db.insert(schema.enrollments).values([
    { classId: classA.id, studentId: s1.id },
    { classId: classB.id, studentId: s2.id },
  ]);

  const [assessmentA] = await db
    .insert(schema.assessments)
    .values({ ownerId: tA.id, courseId: courseA.id, type: "formative", title: "Quiz 1" })
    .returning();
  ids.assessmentA = assessmentA.id;
  const [assignmentA] = await db
    .insert(schema.assignments)
    .values({ assessmentId: assessmentA.id, classId: classA.id, ownerId: tA.id })
    .returning();
  ids.assignmentA = assignmentA.id;
  const [attempt] = await db
    .insert(schema.attempts)
    .values({ assignmentId: assignmentA.id, studentId: s1.id, number: 1, questionSet: [] })
    .returning();
  ids.attemptS1 = attempt.id;
});

const rejects = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ name: "AuthzError", status });

describe("session and role guards", () => {
  it("rejects anonymous requests with 401 everywhere", async () => {
    asNobody();
    await rejects(authz.requireSession(), 401);
    await rejects(authz.requireTeacher(), 401);
    await rejects(authz.requireStudent(), 401);
    await rejects(authz.requireOwner({ type: "question_bank", id: ids.bankA }), 401);
    await rejects(authz.requireShared({ type: "question_bank", id: ids.bankA }, "view"), 401);
    await rejects(authz.requireEnrolled(ids.classA), 401);
    await rejects(authz.requireAssignmentAccess(ids.assignmentA), 401);
    await rejects(authz.requireAttemptAccess(ids.attemptS1), 401);
  });

  it("a student is not a teacher, and a teacher is not a student", async () => {
    asUser(ids.student1, "student");
    await rejects(authz.requireTeacher(), 403);
    await expect(authz.requireStudent()).resolves.toMatchObject({ userId: ids.student1 });

    asUser(ids.teacherA, "teacher");
    await rejects(authz.requireStudent(), 403);
    await expect(authz.requireTeacher()).resolves.toMatchObject({ userId: ids.teacherA });
  });
});

describe("ownership", () => {
  it("owner passes, other teacher is rejected, student is rejected", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(
      authz.requireOwner({ type: "question_bank", id: ids.bankA })
    ).resolves.toBeTruthy();
    await expect(authz.requireOwner({ type: "class", id: ids.classA })).resolves.toBeTruthy();
    await expect(
      authz.requireOwner({ type: "assignment", id: ids.assignmentA })
    ).resolves.toBeTruthy();

    asUser(ids.teacherB, "teacher");
    await rejects(authz.requireOwner({ type: "question_bank", id: ids.bankA }), 403);
    await rejects(authz.requireOwner({ type: "class", id: ids.classA }), 403);
    await rejects(authz.requireOwner({ type: "assessment", id: ids.assessmentA }), 403);
    await rejects(authz.requireOwner({ type: "assignment", id: ids.assignmentA }), 403);

    asUser(ids.student1, "student");
    await rejects(authz.requireOwner({ type: "question_bank", id: ids.bankA }), 403);
  });

  it("a missing resource is 404, not a silent pass", async () => {
    asUser(ids.teacherA, "teacher");
    await rejects(authz.requireOwner({ type: "question_bank", id: MISSING }), 404);
  });
});

describe("sharing", () => {
  it("shared-with teacher gets exactly the granted level", async () => {
    asUser(ids.teacherB, "teacher");
    await expect(
      authz.requireShared({ type: "question_bank", id: ids.bankA }, "view")
    ).resolves.toMatchObject({ access: "view" });
    await rejects(authz.requireShared({ type: "question_bank", id: ids.bankA }, "copy"), 403);
    await rejects(authz.requireShared({ type: "question_bank", id: ids.bankA }, "co_edit"), 403);
  });

  it("owner always passes; an unshared bank is invisible to others", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(
      authz.requireShared({ type: "question_bank", id: ids.bankA }, "co_edit")
    ).resolves.toMatchObject({ access: "owner" });
    await rejects(authz.requireShared({ type: "question_bank", id: ids.bankB }, "view"), 403);

    asUser(ids.student1, "student");
    await rejects(authz.requireShared({ type: "question_bank", id: ids.bankA }, "view"), 403);
  });
});

describe("enrollment and assignments", () => {
  it("only an enrolled student passes requireEnrolled", async () => {
    asUser(ids.student1, "student");
    await expect(authz.requireEnrolled(ids.classA)).resolves.toBeTruthy();
    await rejects(authz.requireEnrolled(ids.classB), 403);

    asUser(ids.student2, "student");
    await rejects(authz.requireEnrolled(ids.classA), 403);

    asUser(ids.teacherA, "teacher");
    await rejects(authz.requireEnrolled(ids.classA), 403);
  });

  it("assignment access: owner teacher and enrolled students only", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(authz.requireAssignmentAccess(ids.assignmentA)).resolves.toMatchObject({
      as: "teacher",
    });
    asUser(ids.teacherB, "teacher");
    await rejects(authz.requireAssignmentAccess(ids.assignmentA), 403);
    asUser(ids.student1, "student");
    await expect(authz.requireAssignmentAccess(ids.assignmentA)).resolves.toMatchObject({
      as: "student",
    });
    asUser(ids.student2, "student");
    await rejects(authz.requireAssignmentAccess(ids.assignmentA), 403);
    await rejects(authz.requireAssignmentAccess(MISSING), 404);
  });
});

describe("attempts (the student-data boundary)", () => {
  it("a student can reach only their own attempt", async () => {
    asUser(ids.student1, "student");
    await expect(authz.requireAttemptAccess(ids.attemptS1)).resolves.toMatchObject({
      as: "student",
    });
    asUser(ids.student2, "student");
    await rejects(authz.requireAttemptAccess(ids.attemptS1), 403);
  });

  it("only the teacher who owns the assignment can reach the attempt", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(authz.requireAttemptAccess(ids.attemptS1)).resolves.toMatchObject({
      as: "teacher",
    });
    asUser(ids.teacherB, "teacher");
    await rejects(authz.requireAttemptAccess(ids.attemptS1), 403);
  });

  it("assertOwnStudentRow rejects rows belonging to someone else", () => {
    asUser(ids.student2, "student");
    expect(() => authz.assertOwnStudentRow(state.session!, { studentId: ids.student1 })).toThrow(
      authz.AuthzError
    );
    expect(() =>
      authz.assertOwnStudentRow(state.session!, { studentId: ids.student2 })
    ).not.toThrow();
  });
});

describe("wrappers", () => {
  it("withAuthz turns AuthzError into { ok: false, status }", async () => {
    asUser(ids.student2, "student");
    const action = authz.withAuthz(async (attemptId: string) => {
      await authz.requireAttemptAccess(attemptId);
      return "secret";
    });
    await expect(action(ids.attemptS1)).resolves.toEqual({
      ok: false,
      status: 403,
      error: expect.any(String),
    });
    asUser(ids.student1, "student");
    await expect(action(ids.attemptS1)).resolves.toEqual({ ok: true, data: "secret" });
  });

  it("withAuthzRoute returns a 403 response for a student reading another student's attempt", async () => {
    asUser(ids.student2, "student");
    const handler = authz.withAuthzRoute(async (_req, ctx: { attemptId: string }) => {
      await authz.requireAttemptAccess(ctx.attemptId);
      return Response.json({ ok: true });
    });
    const res = await handler(new Request("http://x/api/attempts"), { attemptId: ids.attemptS1 });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "forbidden" });
  });

  it("withAuthz rethrows unexpected errors instead of masking them", async () => {
    asUser(ids.teacherA, "teacher");
    const action = authz.withAuthz(async () => {
      await authz.requireTeacher();
      throw new Error("boom");
    });
    await expect(action()).rejects.toThrow("boom");
  });
});
