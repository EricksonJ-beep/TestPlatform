/**
 * The relearning walkthrough (Jon, Nov 5 2026): the setup makes a practice course with the path
 * switched on and a practice class, once; the `walkthrough-*` packs then fill it with two targets'
 * Practice banks, Read · Watch · Do, a quiz and a test assigned to the class, and the test's
 * retake pools. No student is made.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyPack, listPacks } from "@/lib/content-packs";
import { loadBankHealth } from "@/lib/queries/bank-health";
import { pathSwitchOn } from "@/lib/queries/relearning-path";
import { ensureWalkthrough, readWalkthroughSetup } from "@/lib/walkthrough";

const setup = readWalkthroughSetup();
let teacherId = "";

beforeAll(async () => {
  const [t] = await db
    .insert(schema.users)
    .values({
      email: setup.teacherEmail,
      passwordHash: "x",
      role: "teacher",
      firstName: "Jon",
      lastName: "Erickson",
    })
    .returning();
  teacherId = t.id;
});

describe("the relearning walkthrough", () => {
  it("makes the course (path on) and the class once, and never a student", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const first = await ensureWalkthrough(setup, now);
    expect(first).toMatchObject({ status: "ready", created: ["course", "class"] });
    const again = await ensureWalkthrough(setup, new Date("2026-12-01T12:00:00Z"));
    expect(again).toMatchObject({ status: "ready", created: [] });
    if (first.status !== "ready" || again.status !== "ready") throw new Error("unreachable");
    expect(again.courseId).toBe(first.courseId);
    const course = (await db.query.courses.findFirst({
      where: eq(schema.courses.id, first.courseId),
    }))!;
    expect(course).toMatchObject({ name: setup.course, ownerId: teacherId, cvtcRules: false });
    // Switched on an hour before it was made; a later run doesn't move it.
    expect(course.relearningPathFrom?.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    const cls = (await db.query.classes.findFirst({
      where: eq(schema.classes.id, first.classId),
    }))!;
    expect(cls).toMatchObject({ name: setup.class, courseId: course.id, joinOpen: false });
    expect(await db.select().from(schema.enrollments)).toHaveLength(0);
  });

  it("skips quietly when the teacher isn't there", async () => {
    expect(await ensureWalkthrough({ ...setup, teacherEmail: "nobody@example.com" })).toEqual({
      status: "skipped",
      reason: "no teacher nobody@example.com",
    });
  });

  it("the walkthrough packs fill it: banks, Read · Watch · Do, a quiz and a test on the class", async () => {
    const packs = listPacks().filter((p) => p.name.startsWith("walkthrough-"));
    expect(packs.map((p) => p.name)).toEqual([
      "walkthrough-1-practice-u3-lt1",
      "walkthrough-2-practice-u3-lt2",
      "walkthrough-3-relearning",
      "walkthrough-4-retake-bank",
      "walkthrough-5-quiz",
      "walkthrough-6-test",
    ]);
    for (const p of packs) {
      const out = await applyPack(p);
      expect(out.status, p.name).toBe("applied");
      if (out.status === "applied") expect(out.summary.errors, p.name).toEqual([]);
    }
    const course = (await db.query.courses.findFirst({
      where: eq(schema.courses.name, setup.course),
    }))!;
    const targets = await db
      .select({ code: schema.learningTargets.code })
      .from(schema.learningTargets)
      .where(eq(schema.learningTargets.courseId, course.id));
    expect(targets.map((t) => t.code).sort()).toEqual(["U3.LT1", "U3.LT2"]);

    // Practice banks the practice check can draw from: healthy on both targets.
    const banks = await db
      .select({
        id: schema.questionBanks.id,
        name: schema.questionBanks.name,
        courseId: schema.questionBanks.courseId,
      })
      .from(schema.questionBanks)
      .where(eq(schema.questionBanks.courseId, course.id));
    const practice = banks.filter((b) => b.name.endsWith("· Practice"));
    expect(practice).toHaveLength(2);
    const health = await loadBankHealth(practice);
    for (const b of practice) expect(health.get(b.id)!.worst, b.name).toBe("ok");

    // Read · Watch · Do for each target.
    const options = await db
      .select({ mode: schema.relearningOptions.mode })
      .from(schema.relearningOptions)
      .where(eq(schema.relearningOptions.ownerId, teacherId));
    expect(options.map((o) => o.mode).sort()).toEqual([
      "do",
      "do",
      "read",
      "read",
      "watch",
      "watch",
    ]);

    // The quiz and the test, assigned to the practice class, on the path.
    const cls = (await db.query.classes.findFirst({
      where: eq(schema.classes.name, setup.class),
    }))!;
    const assigned = await db
      .select({
        id: schema.assignments.id,
        title: schema.assessments.title,
        type: schema.assessments.type,
        attemptsAllowed: schema.assignments.attemptsAllowed,
      })
      .from(schema.assignments)
      .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
      .where(eq(schema.assignments.classId, cls.id));
    expect(assigned.map((a) => [a.title, a.type, a.attemptsAllowed]).sort()).toEqual([
      ["Walkthrough Quiz: Formulas and Bonding", "formative", 3],
      ["Walkthrough Test: Formulas and Bonding", "summative", 2],
    ]);
    for (const a of assigned) expect(await pathSwitchOn(a.id)).toEqual(course.relearningPathFrom);

    // The test's two target sections retake from their pools.
    const test = assigned.find((a) => a.type === "summative")!;
    const testAsg = (await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, test.id),
    }))!;
    const sections = await db
      .select({ pool: schema.assessmentSections.retakePoolId })
      .from(schema.assessmentSections)
      .where(
        and(
          eq(schema.assessmentSections.assessmentId, testAsg.assessmentId),
          isNotNull(schema.assessmentSections.learningTargetId)
        )
      );
    expect(sections).toHaveLength(2);
    expect(sections.every((s) => s.pool !== null)).toBe(true);
  });
});
