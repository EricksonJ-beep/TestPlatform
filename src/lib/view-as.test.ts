/**
 * "View as student": a teacher may borrow only the identity of a student
 * enrolled in a class they own, and the borrowed session is marked read-only.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

import { db, schema } from "@/db";
import { parseViewAs, resolveViewAs } from "./view-as";

const ids = { teacherA: "", teacherB: "", s1: "", s2: "", classA: "" };
const session = (userId: string, role: Session["role"]): Session => ({
  userId,
  role,
  email: `${userId}@x`,
  firstName: "Jon",
  lastName: "Erickson",
});

beforeAll(async () => {
  const [a, b, s1, s2] = await db
    .insert(schema.users)
    .values([
      { email: "a@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "b@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
      {
        email: null,
        username: "maya.rivera",
        passwordHash: "x",
        role: "student",
        firstName: "Maya",
        lastName: "Rivera",
      },
      {
        email: "ava@s",
        passwordHash: "x",
        role: "student",
        firstName: "Ava",
        lastName: "Peterson",
      },
    ])
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: a.id, name: "Anatomy · 2nd Hour" })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: s1.id });
  Object.assign(ids, { teacherA: a.id, teacherB: b.id, s1: s1.id, s2: s2.id, classA: cls.id });
});

describe("resolveViewAs", () => {
  it("the class owner becomes the enrolled student, marked as viewing", async () => {
    const s = await resolveViewAs(session(ids.teacherA, "teacher"), ids.s1);
    expect(s).toMatchObject({
      userId: ids.s1,
      role: "student",
      username: "maya.rivera",
      firstName: "Maya",
      viewingAs: { teacherId: ids.teacherA, teacherName: "Jon Erickson" },
    });
  });
  it("another teacher, a student not in the owner's classes, or a student caller keeps the real session", async () => {
    const other = session(ids.teacherB, "teacher");
    expect(await resolveViewAs(other, ids.s1)).toBe(other);
    const owner = session(ids.teacherA, "teacher");
    expect(await resolveViewAs(owner, ids.s2)).toBe(owner);
    expect(await resolveViewAs(owner, null)).toBe(owner);
    const student = session(ids.s2, "student");
    expect(await resolveViewAs(student, ids.s1)).toBe(student);
  });
  it("a teacher cannot be borrowed even by a class owner", async () => {
    const owner = session(ids.teacherA, "teacher");
    expect(await resolveViewAs(owner, ids.teacherB)).toBe(owner);
  });
  it("parses the cookie value and rejects junk", () => {
    expect(parseViewAs("s|c")).toEqual({ studentId: "s", classId: "c" });
    expect(parseViewAs("s")).toBeNull();
    expect(parseViewAs(undefined)).toBeNull();
    expect(parseViewAs("")).toBeNull();
  });
});
