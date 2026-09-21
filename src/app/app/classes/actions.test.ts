/**
 * Ticket 0.8 "Done when": create a class, add three students via CSV, log in as
 * one, reset their password, log in again — exercised at the server-action
 * level against an in-memory Postgres, plus the cross-teacher rejections.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/password";
import {
  addStudent,
  createClass,
  importStudentsCsv,
  removeStudent,
  resetStudentPassword,
} from "./actions";

const ids = { teacherA: "", teacherB: "", classA: "", maya: "" };

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};

function fd(obj: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  const [a, b] = await db
    .insert(schema.users)
    .values([
      { email: "a@t", passwordHash: "x", role: "teacher", firstName: "A", lastName: "T" },
      { email: "b@t", passwordHash: "x", role: "teacher", firstName: "B", lastName: "T" },
    ])
    .returning();
  ids.teacherA = a.id;
  ids.teacherB = b.id;
});

describe("classes", () => {
  it("a teacher creates a class (and its course on the fly); a student cannot", async () => {
    asUser(ids.teacherA, "teacher");
    const r = await createClass(
      fd({ name: "Bio P3", courseName: "Biology", period: "3", term: "Fall 2026" })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.classA = r.data.classId;

    const course = await db.query.courses.findFirst({
      where: eq(schema.courses.ownerId, ids.teacherA),
    });
    expect(course?.name).toBe("Biology");

    // Same course name again reuses the course instead of duplicating it.
    const r2 = await createClass(fd({ name: "Bio P5", courseName: "biology" }));
    expect(r2.ok).toBe(true);
    const courses = await db.query.courses.findMany({
      where: eq(schema.courses.ownerId, ids.teacherA),
    });
    expect(courses).toHaveLength(1);

    asUser("00000000-0000-0000-0000-000000000000", "student");
    const denied = await createClass(fd({ name: "Nope" }));
    expect(denied).toMatchObject({ ok: false, status: 403 });
  });

  it("validation errors come back as fieldErrors, not exceptions", async () => {
    asUser(ids.teacherA, "teacher");
    const r = await createClass(fd({ name: "" }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.fieldErrors?.name?.[0]).toMatch(/name/i);
  });
});

describe("students", () => {
  it("adds one student with a hashed temp password that never leaves the server", async () => {
    asUser(ids.teacherA, "teacher");
    const r = await addStudent(
      ids.classA,
      fd({
        firstName: "Maya",
        lastName: "Rivera",
        email: "Maya.Rivera@cadott.k12.wi.us",
        tempPassword: "maple-1234",
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      status: "created",
      email: "maya.rivera@cadott.k12.wi.us",
      tempPassword: "maple-1234",
    });
    ids.maya = r.data.studentId;

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, ids.maya) });
    expect(user?.role).toBe("student");
    expect(user?.mustChangePassword).toBe(true);
    expect(user?.passwordHash).not.toContain("maple");
    await expect(verifyPassword("maple-1234", user!.passwordHash)).resolves.toBe(true);
  });

  it("another teacher cannot add to, import into, or reset passwords in this class", async () => {
    asUser(ids.teacherB, "teacher");
    await expect(
      addStudent(ids.classA, fd({ firstName: "X", lastName: "Y", email: "x@y.org" }))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(resetStudentPassword(ids.classA, ids.maya)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(removeStudent(ids.classA, ids.maya)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    const file = new File(["first_name,last_name,email\nA,B,a@b.org\n"], "r.csv", {
      type: "text/csv",
    });
    await expect(importStudentsCsv(ids.classA, fd({ file }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("imports a CSV: creates new accounts, re-enrolls existing, reports bad rows", async () => {
    asUser(ids.teacherA, "teacher");
    const csv = [
      "First Name,Last Name,Email",
      "Dylan,Kowalski,dylan.kowalski@cadott.k12.wi.us",
      "Ava,Peterson,ava.peterson@cadott.k12.wi.us",
      "Liam,Weber,liam.weber@cadott.k12.wi.us",
      "Maya,Rivera,maya.rivera@cadott.k12.wi.us",
      "Bad,Row,not-an-email",
      "Dylan,Again,dylan.kowalski@cadott.k12.wi.us",
    ].join("\r\n");
    const file = new File([csv], "roster.csv", { type: "text/csv" });
    const r = await importStudentsCsv(ids.classA, fd({ file }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byLine = Object.fromEntries(r.data.results.map((x) => [x.line, x]));
    expect(byLine[2]).toMatchObject({ ok: true, student: { status: "created" } });
    expect(byLine[3]).toMatchObject({ ok: true, student: { status: "created" } });
    expect(byLine[4]).toMatchObject({ ok: true, student: { status: "created" } });
    expect(byLine[5]).toMatchObject({
      ok: true,
      student: { status: "already_enrolled", tempPassword: null },
    });
    expect(byLine[6]).toMatchObject({ ok: false });
    expect(byLine[7]).toMatchObject({ ok: false, error: "Duplicate email in file." });

    const created = r.data.results.filter((x) => x.ok && x.student.status === "created");
    expect(created).toHaveLength(3);
    for (const row of created) {
      if (!row.ok) continue;
      expect(row.student.tempPassword).toMatch(/^[a-z]+-\d{4}$/);
      const u = await db.query.users.findFirst({
        where: eq(schema.users.id, row.student.studentId),
      });
      await expect(verifyPassword(row.student.tempPassword!, u!.passwordHash)).resolves.toBe(true);
    }

    const roster = await db.query.enrollments.findMany({
      where: eq(schema.enrollments.classId, ids.classA),
    });
    expect(roster).toHaveLength(4);
  });

  it("rejects a CSV without the required columns", async () => {
    asUser(ids.teacherA, "teacher");
    const file = new File(["name,email\nA,a@b.org\n"], "r.csv", { type: "text/csv" });
    const r = await importStudentsCsv(ids.classA, fd({ file }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(r.error).toMatch(/first_name/);
  });

  it("reset password: the old one stops working, the new one is shown once and works", async () => {
    asUser(ids.teacherA, "teacher");
    const before = await db.query.users.findFirst({ where: eq(schema.users.id, ids.maya) });
    const r = await resetStudentPassword(ids.classA, ids.maya);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = await db.query.users.findFirst({ where: eq(schema.users.id, ids.maya) });
    expect(after!.passwordHash).not.toBe(before!.passwordHash);
    await expect(verifyPassword("maple-1234", after!.passwordHash)).resolves.toBe(false);
    await expect(verifyPassword(r.data.tempPassword, after!.passwordHash)).resolves.toBe(true);
    expect(after!.mustChangePassword).toBe(true);
  });

  it("cannot reset a student who is not in the class", async () => {
    asUser(ids.teacherA, "teacher");
    const r2 = await createClass(fd({ name: "Empty" }));
    if (!r2.ok) throw new Error("class");
    await expect(resetStudentPassword(r2.data.classId, ids.maya)).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("remove keeps the account but drops the enrollment", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(removeStudent(ids.classA, ids.maya)).resolves.toMatchObject({ ok: true });
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, ids.maya) });
    expect(user).toBeTruthy();
    const roster = await db.query.enrollments.findMany({
      where: eq(schema.enrollments.classId, ids.classA),
    });
    expect(roster).toHaveLength(3);
  });
});
