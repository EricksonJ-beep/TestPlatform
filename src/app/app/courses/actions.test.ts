/**
 * Ticket 1.1: course structure actions and their cross-access rules, run against
 * an in-memory Postgres with the real migrations.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
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

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentCourse } from "@/lib/current-course";
import {
  createCourse,
  createPool,
  createTarget,
  createUnit,
  deletePool,
  deleteTarget,
  deleteUnit,
  moveUnit,
  setCurrentCourse,
  updateCourse,
  updatePool,
  updateTarget,
  updateUnit,
} from "./actions";

const ids = {
  teacherA: "",
  teacherB: "",
  courseA: "",
  courseB: "",
  unit1: "",
  unit2: "",
  lt1: "",
  lt4: "",
  ltB: "",
  pool: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
function fd(obj: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};

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

describe("courses", () => {
  it("teacher A creates a course; duplicate names are rejected case-insensitively", async () => {
    asUser(ids.teacherA, "teacher");
    ids.courseA = (await ok(createCourse(fd({ name: "Biology" })))).courseId;
    await expect(createCourse(fd({ name: "biology" }))).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    asUser(ids.teacherB, "teacher");
    ids.courseB = (await ok(createCourse(fd({ name: "Biology" })))).courseId; // other teacher, fine
  });

  it("only the owner can rename", async () => {
    asUser(ids.teacherB, "teacher");
    await expect(updateCourse(ids.courseA, fd({ name: "Hijack" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    asUser(ids.teacherA, "teacher");
    await ok(updateCourse(ids.courseA, fd({ name: "Biology", description: "10th grade" })));
    const c = await db.query.courses.findFirst({ where: eq(schema.courses.id, ids.courseA) });
    expect(c?.description).toBe("10th grade");
  });

  it("a student cannot create a course", async () => {
    asUser("00000000-0000-0000-0000-000000000000", "student");
    await expect(createCourse(fd({ name: "Nope" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("units", () => {
  it("owner adds, renames, reorders, deletes; others get 403", async () => {
    asUser(ids.teacherA, "teacher");
    ids.unit1 = (
      await ok(createUnit(ids.courseA, fd({ name: "Unit 1 · Chemistry of life" })))
    ).unitId;
    ids.unit2 = (await ok(createUnit(ids.courseA, fd({ name: "Unit 2 · Cells" })))).unitId;
    await ok(updateUnit(ids.courseA, ids.unit1, fd({ name: "Unit 1 · Biochemistry" })));
    await ok(moveUnit(ids.courseA, ids.unit2, "up"));
    const units = await db.query.units.findMany({
      where: eq(schema.units.courseId, ids.courseA),
      orderBy: (u, { asc }) => [asc(u.sortOrder)],
    });
    expect(units.map((u) => u.name)).toEqual(["Unit 2 · Cells", "Unit 1 · Biochemistry"]);

    asUser(ids.teacherB, "teacher");
    await expect(createUnit(ids.courseA, fd({ name: "X" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(updateUnit(ids.courseA, ids.unit1, fd({ name: "X" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(deleteUnit(ids.courseA, ids.unit1)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("a unit id from another course is rejected even by the owner of both", async () => {
    asUser(ids.teacherB, "teacher");
    const unitB = (await ok(createUnit(ids.courseB, fd({ name: "B unit" })))).unitId;
    asUser(ids.teacherA, "teacher");
    await expect(updateUnit(ids.courseA, unitB, fd({ name: "X" }))).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("learning targets", () => {
  it("codes are unique per course, case-insensitively", async () => {
    asUser(ids.teacherA, "teacher");
    ids.lt1 = (
      await ok(
        createTarget(
          ids.courseA,
          fd({ code: "LT1", title: "Blood composition", unitId: ids.unit1 })
        )
      )
    ).targetId;
    ids.lt4 = (
      await ok(createTarget(ids.courseA, fd({ code: "LT4", title: "Active transport" })))
    ).targetId;
    await expect(
      createTarget(ids.courseA, fd({ code: "lt1", title: "Dup" }))
    ).resolves.toMatchObject({ ok: false, status: 409 });
    await expect(
      updateTarget(ids.courseA, ids.lt4, fd({ code: "LT1", title: "Clash" }))
    ).resolves.toMatchObject({ ok: false, status: 409 });

    asUser(ids.teacherB, "teacher");
    ids.ltB = (
      await ok(createTarget(ids.courseB, fd({ code: "LT1", title: "Same code, other course" })))
    ).targetId;
  });

  it("other teachers cannot touch them", async () => {
    asUser(ids.teacherB, "teacher");
    await expect(createTarget(ids.courseA, fd({ code: "LT9", title: "X" }))).resolves.toMatchObject(
      { ok: false, status: 403 }
    );
    await expect(
      updateTarget(ids.courseA, ids.lt1, fd({ code: "LT1", title: "X" }))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(deleteTarget(ids.courseA, ids.lt1)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("deleting a target that a pool references is refused", async () => {
    asUser(ids.teacherA, "teacher");
    ids.pool = (
      await ok(createPool(ids.courseA, fd({ name: "LT4 pool", targetIds: [ids.lt4] })))
    ).poolId;
    await expect(deleteTarget(ids.courseA, ids.lt4)).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    await expect(deleteTarget(ids.courseA, ids.lt1)).resolves.toMatchObject({ ok: true });
  });
});

describe("pools", () => {
  it("pools can only be tagged with targets from their own course", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(
      createPool(ids.courseA, fd({ name: "Bad", targetIds: [ids.ltB] }))
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      updatePool(ids.courseA, ids.pool, fd({ name: "LT4 pool", targetIds: [ids.lt4, ids.ltB] }))
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("owner updates tags; others are rejected; deletion works when empty", async () => {
    asUser(ids.teacherA, "teacher");
    await ok(
      updatePool(
        ids.courseA,
        ids.pool,
        fd({ name: "LT4 pool", description: "retake pool", targetIds: [ids.lt4] })
      )
    );
    const tags = await db.query.poolTargets.findMany({
      where: eq(schema.poolTargets.poolId, ids.pool),
    });
    expect(tags.map((t) => t.learningTargetId)).toEqual([ids.lt4]);

    asUser(ids.teacherB, "teacher");
    await expect(updatePool(ids.courseA, ids.pool, fd({ name: "X" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(deletePool(ids.courseA, ids.pool)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });

    asUser(ids.teacherA, "teacher");
    await expect(deletePool(ids.courseA, ids.pool)).resolves.toMatchObject({ ok: true });
  });
});

describe("current course cookie", () => {
  it("accepts only the teacher's own course and falls back to the first course otherwise", async () => {
    asUser(ids.teacherA, "teacher");
    await expect(setCurrentCourse(ids.courseB)).resolves.toMatchObject({ ok: false, status: 403 });
    await ok(setCurrentCourse(ids.courseA));
    expect((await getCurrentCourse(ids.teacherA)).current?.id).toBe(ids.courseA);

    // A forged cookie pointing at someone else's course is ignored.
    state.jar.set("bloom.course", ids.courseB);
    expect((await getCurrentCourse(ids.teacherA)).current?.id).toBe(ids.courseA);

    await ok(setCurrentCourse(null));
    expect(state.jar.has("bloom.course")).toBe(false);
  });
});
