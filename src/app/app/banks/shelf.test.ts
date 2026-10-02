/**
 * Unit shelves (Jon, Oct 2 2026): placing a bank or an assessment on a unit of
 * its course and saving the order. Owner only; a unit from another course is
 * refused; ids that are not the owner's are ignored, not applied.
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
import { listMyBanks } from "@/lib/queries/banks";
import { listAssessments } from "@/lib/queries/assessments";
import { listUnitsForTeacher } from "@/lib/queries/courses";
import { groupByUnit } from "@/lib/unit-shelves";
import { placeBank } from "./actions";
import { placeAssessment } from "../assessments/actions";

const ids = {
  owner: "",
  stranger: "",
  course: "",
  other: "",
  u1: "",
  u2: "",
  uOther: "",
  a: "",
  b: "",
  c: "",
  strangers: "",
  t1: "",
  t2: "",
};
const asUser = (userId: string) => {
  state.session = { userId, role: "teacher", email: `${userId}@x`, firstName: "T", lastName: "U" };
};

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values([
      { email: "o@x", passwordHash: "x", role: "teacher", firstName: "O", lastName: "W" },
      { email: "s@x", passwordHash: "x", role: "teacher", firstName: "S", lastName: "T" },
    ])
    .returning();
  ids.owner = users[0].id;
  ids.stranger = users[1].id;
  const courses = await db
    .insert(schema.courses)
    .values([
      { ownerId: ids.owner, name: "Physical Science A" },
      { ownerId: ids.owner, name: "Biology" },
    ])
    .returning();
  ids.course = courses[0].id;
  ids.other = courses[1].id;
  const units = await db
    .insert(schema.units)
    .values([
      { courseId: ids.course, name: "Unit 1", sortOrder: 0 },
      { courseId: ids.course, name: "Unit 2", sortOrder: 1 },
      { courseId: ids.other, name: "Bio Unit 1", sortOrder: 0 },
    ])
    .returning();
  [ids.u1, ids.u2, ids.uOther] = units.map((u) => u.id);
  const banks = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: ids.owner, courseId: ids.course, name: "A" },
      { ownerId: ids.owner, courseId: ids.course, name: "B" },
      { ownerId: ids.owner, courseId: ids.course, name: "C" },
      { ownerId: ids.stranger, courseId: ids.course, name: "Not mine" },
    ])
    .returning();
  [ids.a, ids.b, ids.c, ids.strangers] = banks.map((b) => b.id);
  const tests = await db
    .insert(schema.assessments)
    .values([
      { ownerId: ids.owner, courseId: ids.course, type: "summative", title: "T1" },
      { ownerId: ids.owner, courseId: ids.course, type: "summative", title: "T2" },
    ])
    .returning();
  [ids.t1, ids.t2] = tests.map((t) => t.id);
});

describe("placeBank", () => {
  it("puts the bank on the unit in the given order; the list and the shelves reflect it", async () => {
    asUser(ids.owner);
    expect(await placeBank(ids.b, ids.u1, [ids.b])).toMatchObject({ ok: true });
    expect(await placeBank(ids.a, ids.u1, [ids.a, ids.b])).toMatchObject({ ok: true });
    expect(await placeBank(ids.c, ids.u1, [ids.a, ids.c, ids.b])).toMatchObject({ ok: true });
    const banks = await listMyBanks(ids.owner);
    const shelves = groupByUnit(banks, await listUnitsForTeacher(ids.owner));
    const ps = shelves.find((c) => c.course === "Physical Science A")!;
    expect(ps.shelves.map((s) => s.name)).toEqual(["Unit 1", "Unit 2"]);
    expect(ps.shelves[0].items.map((i) => i.name)).toEqual(["A", "C", "B"]);
  });
  it("moving to another unit, and back to no unit, reorders what is left", async () => {
    asUser(ids.owner);
    expect(await placeBank(ids.c, ids.u2, [ids.c])).toMatchObject({ ok: true });
    expect(await placeBank(ids.a, null, [ids.a])).toMatchObject({ ok: true });
    const banks = await listMyBanks(ids.owner);
    const ps = groupByUnit(banks, await listUnitsForTeacher(ids.owner))[0];
    expect(ps.shelves.map((s) => [s.name, s.items.map((i) => i.name)])).toEqual([
      ["Unit 1", ["B"]],
      ["Unit 2", ["C"]],
      ["No unit yet", ["A"]],
    ]);
  });
  it("refuses a unit from another course, a stranger, and ignores ids that are not mine", async () => {
    asUser(ids.owner);
    expect(await placeBank(ids.b, ids.uOther, [ids.b])).toMatchObject({ ok: false, status: 400 });
    expect(await placeBank(ids.b, ids.u1, [ids.strangers, ids.b])).toMatchObject({ ok: true });
    const theirs = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.id, ids.strangers),
    }))!;
    expect(theirs.unitId).toBeNull();
    expect(theirs.sortOrder).toBe(0);
    asUser(ids.stranger);
    expect(await placeBank(ids.b, ids.u1, [ids.b])).toMatchObject({ ok: false, status: 403 });
    expect(await placeBank("not-a-uuid", ids.u1, [])).toMatchObject({ ok: false, status: 404 });
  });
});

describe("placeAssessment", () => {
  it("shelves assessments the same way", async () => {
    asUser(ids.owner);
    expect(await placeAssessment(ids.t2, ids.u2, [ids.t2])).toMatchObject({ ok: true });
    expect(await placeAssessment(ids.t1, ids.u2, [ids.t1, ids.t2])).toMatchObject({ ok: true });
    const ps = groupByUnit(
      await listAssessments(ids.owner),
      await listUnitsForTeacher(ids.owner)
    ).find((c) => c.course === "Physical Science A")!;
    expect(ps.shelves.find((s) => s.name === "Unit 2")!.items.map((i) => i.title)).toEqual([
      "T1",
      "T2",
    ]);
    expect(await placeAssessment(ids.t1, ids.uOther, [ids.t1])).toMatchObject({
      ok: false,
      status: 400,
    });
    asUser(ids.stranger);
    expect(await placeAssessment(ids.t1, ids.u1, [ids.t1])).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
