/**
 * "Build my practice" (Jon, Oct 13 2026): the deal is spread evenly across the
 * picked targets, fresh before repeats, and only ever from banks the teacher
 * opened for practice. The Anatomy practice packs bring their own targets.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PoolQuestion } from "@/lib/assessments/serve";
import { applyPack, listPacks } from "./content-packs";
import { listCustomPracticeOptions, startCustomPractice } from "./custom-practice";
import { dealCustomPractice } from "./custom-practice-rules";

const q = (id: string, targetIds: string[]): PoolQuestion => ({
  questionId: id,
  points: 1,
  stimulusId: null,
  targetIds,
});
const seeded =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

describe("dealCustomPractice", () => {
  const byTarget = new Map([
    ["A", Array.from({ length: 20 }, (_, i) => q(`a${i}`, ["A"]))],
    ["B", Array.from({ length: 20 }, (_, i) => q(`b${i}`, ["B"]))],
    ["C", [q("c0", ["C"]), q("c1", ["C"])]],
  ]);
  const count = (hand: PoolQuestion[], t: string) =>
    hand.filter((h) => h.targetIds.includes(t)).length;

  it("spreads the hand evenly and hands a short target's share to the others", () => {
    const hand = dealCustomPractice(byTarget, 12, { rng: seeded() });
    expect(hand).toHaveLength(12);
    expect(count(hand, "C")).toBe(2);
    expect(count(hand, "A") + count(hand, "B")).toBe(10);
    expect(Math.abs(count(hand, "A") - count(hand, "B"))).toBeLessThanOrEqual(1);
  });

  it("deals every question once when asked for more than there are", () => {
    const hand = dealCustomPractice(byTarget, 100, { rng: seeded(7) });
    expect(hand).toHaveLength(42);
    expect(new Set(hand.map((h) => h.questionId)).size).toBe(42);
  });

  it("prefers questions the student hasn't seen", () => {
    const avoid = new Set(Array.from({ length: 15 }, (_, i) => `a${i}`));
    const hand = dealCustomPractice(new Map([["A", byTarget.get("A")!]]), 5, {
      rng: seeded(3),
      avoid,
    });
    expect(hand.every((h) => !avoid.has(h.questionId))).toBe(true);
  });

  it("deals a question tagged to two picked targets once", () => {
    const shared = q("s", ["A", "B"]);
    const hand = dealCustomPractice(
      new Map([
        ["A", [shared]],
        ["B", [shared, q("b", ["B"])]],
      ]),
      4,
      { rng: seeded(5) }
    );
    expect(hand.map((h) => h.questionId).sort()).toEqual(["b", "s"]);
  });
});

describe("Anatomy practice packs and Build my practice", () => {
  const ids = { teacher: "", student: "", course: "", unit2: "" };

  beforeAll(async () => {
    const [t] = await db
      .insert(schema.users)
      .values({
        email: "EricksonJ@cadott.k12.wi.us",
        passwordHash: "x",
        role: "teacher",
        firstName: "Jon",
        lastName: "Erickson",
      })
      .returning();
    const [s] = await db
      .insert(schema.users)
      .values({
        email: "s@x.org",
        passwordHash: "x",
        role: "student",
        firstName: "Sam",
        lastName: "S",
      })
      .returning();
    const [course] = await db
      .insert(schema.courses)
      .values({ ownerId: t.id, name: "Anatomy and Physiology" })
      .returning();
    const [unit2] = await db
      .insert(schema.units)
      .values({ courseId: course.id, name: "Unit 2", sortOrder: 1 })
      .returning();
    // The placeholder unit target from scripts/courses/anatomy-physiology.ts stays as it is.
    await db
      .insert(schema.learningTargets)
      .values({ courseId: course.id, unitId: unit2.id, code: "U2", title: "Unit 2" });
    Object.assign(ids, { teacher: t.id, student: s.id, course: course.id, unit2: unit2.id });
    const pack = listPacks().find((p) => p.name === "anatomy-u2-practice-bank")!;
    const out = await applyPack(pack);
    expect(out.status).toBe("applied");
  });

  it("creates the unit's targets, imports 20 questions per target, and opens the bank", async () => {
    const targets = await db.query.learningTargets.findMany({
      where: eq(schema.learningTargets.courseId, ids.course),
    });
    expect(targets.filter((t) => t.code.startsWith("U2.LT"))).toHaveLength(18);
    expect(targets.find((t) => t.code === "U2.LT7")).toMatchObject({
      unitId: ids.unit2,
      title: "Bone tissue and bone cells",
    });
    const bank = await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.courseId, ids.course),
    });
    expect(bank).toMatchObject({ name: "AP · Unit 2 · Practice", openPractice: true });

    const [course] = await listCustomPracticeOptions([ids.course]);
    expect(course.units).toHaveLength(1);
    expect(course.units[0].name).toBe("Unit 2");
    expect(course.units[0].targets.map((t) => t.code).slice(0, 3)).toEqual([
      "U2.LT1",
      "U2.LT2",
      "U2.LT3",
    ]);
    expect(course.units[0].targets.every((t) => t.available === 20)).toBe(true);
  });

  it("deals a fresh hand on the picked targets, and never from a closed bank", async () => {
    const targets = await db.query.learningTargets.findMany({
      where: eq(schema.learningTargets.courseId, ids.course),
    });
    const lt1 = targets.find((t) => t.code === "U2.LT1")!;
    const lt2 = targets.find((t) => t.code === "U2.LT2")!;

    // A test bank on the same target that is not open for practice.
    const [testBank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: ids.teacher, courseId: ids.course, name: "AP · Unit 2 · Test" })
      .returning();
    const [secret] = await db
      .insert(schema.questions)
      .values({
        ownerId: ids.teacher,
        bankId: testBank.id,
        type: "true_false",
        stem: "Test-only question",
      })
      .returning();
    await db
      .insert(schema.questionTargets)
      .values({ questionId: secret.id, learningTargetId: lt1.id });

    const first = await startCustomPractice(ids.student, ids.course, [lt1.id, lt2.id], 10);
    const a1 = await db.query.practiceAttempts.findFirst({
      where: eq(schema.practiceAttempts.id, first.attemptId),
    });
    expect(a1).toMatchObject({ practiceSetId: null, courseId: ids.course });
    expect(a1!.targetIds!.sort()).toEqual([lt1.id, lt2.id].sort());
    expect(a1!.questionSet).toHaveLength(10);
    expect(a1!.questionSet.filter((s) => s.learningTargetId === lt1.id)).toHaveLength(5);
    expect(a1!.questionSet.some((s) => s.questionId === secret.id)).toBe(false);

    const second = await startCustomPractice(ids.student, ids.course, [lt1.id, lt2.id], 10);
    const a2 = await db.query.practiceAttempts.findFirst({
      where: eq(schema.practiceAttempts.id, second.attemptId),
    });
    const seen = new Set(a1!.questionSet.map((s) => s.questionId));
    expect(a2!.questionSet.some((s) => seen.has(s.questionId))).toBe(false);
  });

  it("refuses targets from another course or with no open questions", async () => {
    const [other] = await db
      .insert(schema.courses)
      .values({ ownerId: ids.teacher, name: "Biology A" })
      .returning();
    const [foreign] = await db
      .insert(schema.learningTargets)
      .values({ courseId: other.id, code: "U1.LT1", title: "Elsewhere" })
      .returning();
    await expect(startCustomPractice(ids.student, ids.course, [foreign.id], 10)).rejects.toThrow(
      "empty"
    );
    const placeholder = await db.query.learningTargets.findFirst({
      where: and(
        eq(schema.learningTargets.courseId, ids.course),
        eq(schema.learningTargets.code, "U2")
      ),
    });
    await expect(
      startCustomPractice(ids.student, ids.course, [placeholder!.id], 10)
    ).rejects.toThrow("empty");
  });
});
