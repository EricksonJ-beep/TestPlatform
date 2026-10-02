/**
 * Content packs: the real packs under content/packs apply into a bank, an
 * assessment, and an assignment for the named teacher, once.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyAllPacks, listPacks } from "./content-packs";

const ids = { teacher: "", course: "", cls: "" };
let ps: { id: string };

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
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Anatomy and Physiology" })
    .returning();
  // The seeded Anatomy course has one target per unit, coded U1, U2, … (scripts/courses/anatomy-physiology.ts).
  await db.insert(schema.learningTargets).values([
    { courseId: course.id, code: "U1", title: "Unit 1" },
    { courseId: course.id, code: "U2", title: "Unit 2" },
  ]);
  // Jon's Physical Science A course has per-unit codes U1.LT1 … U1.LT4 (scripts/courses/physical-science.ts).
  [ps] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science A" })
    .returning();
  await db
    .insert(schema.learningTargets)
    .values(
      [1, 2, 3, 4].map((n) => ({ courseId: ps.id, code: `U1.LT${n}`, title: `Target ${n}` }))
    );
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "Anatomy · 5th Hour" })
    .returning();
  Object.assign(ids, { teacher: t.id, course: course.id, cls: cls.id });
});

describe("content packs", () => {
  it("lists the packs shipped in the repo", () => {
    const names = listPacks().map((p) => p.name);
    expect(names).toContain("anatomy-u2-lab-quiz-integumentary");
    expect(names).toContain("anatomy-u1-quiz-intro-lab-mitosis");
    expect(names).toContain("ps-u1-test-form-b");
  });
  it("applies each pack once: bank, questions with repo-hosted pictures, published assessment, assignment", async () => {
    const first = await applyAllPacks();
    const skin = first.find((o) => o.name === "anatomy-u2-lab-quiz-integumentary")!;
    expect(skin.status).toBe("applied");
    if (skin.status !== "applied") throw new Error("unreachable");
    expect(skin.summary).toMatchObject({
      questions: 10,
      assignedTo: ["Anatomy · 5th Hour"],
      errors: [],
    });
    const bank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "AP · Unit 2 Lab Quiz: Integumentary"),
    }))!;
    const qs = await db.select().from(schema.questions).where(eq(schema.questions.bankId, bank.id));
    expect(qs).toHaveLength(10);
    expect(
      qs.filter((q) => q.mediaUrl?.startsWith("/quiz-images/anatomy-u2-lab-quiz-integumentary/"))
    ).toHaveLength(4);
    const a = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "Lab Quiz: Integumentary System"),
    }))!;
    expect(a).toMatchObject({ type: "formative", isPublished: true, courseId: ids.course });
    const asg = (await db.query.assignments.findFirst({
      where: eq(schema.assignments.assessmentId, a.id),
    }))!;
    expect(asg).toMatchObject({
      classId: ids.cls,
      attemptsAllowed: 3,
      retakeWaitHours: 24,
      retakesNeedUnlock: true,
    });
    // The mitosis pack creates its assessment but assigns nothing (assign: []) and lands on the existing U1 target.
    const mito = first.find((o) => o.name === "anatomy-u1-quiz-intro-lab-mitosis")!;
    expect(mito.status).toBe("applied");
    if (mito.status === "applied")
      expect(mito.summary).toMatchObject({ questions: 10, assignedTo: [] });
    const u1 = (await db.query.learningTargets.findFirst({
      where: eq(schema.learningTargets.code, "U1"),
    }))!;
    const mitoBank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "AP · Unit 1 Quiz: Intro Lab Mitosis"),
    }))!;
    const mitoQs = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.bankId, mitoBank.id));
    const tagged = await db
      .select()
      .from(schema.questionTargets)
      .where(eq(schema.questionTargets.learningTargetId, u1.id));
    expect(mitoQs).toHaveLength(10);
    expect(tagged.filter((t) => mitoQs.some((q) => q.id === t.questionId))).toHaveLength(10);
    // The Physical Science Form B pack: 32 questions on the four U1 targets, a published summative, no assignment.
    const formB = first.find((o) => o.name === "ps-u1-test-form-b")!;
    expect(formB.status).toBe("applied");
    if (formB.status === "applied")
      expect(formB.summary).toMatchObject({ questions: 32, assignedTo: [], errors: [] });
    const psBank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "PS · Unit 1 · Retake"),
    }))!;
    const psQs = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.bankId, psBank.id));
    expect(psQs).toHaveLength(32);
    const psTargets = await db
      .select()
      .from(schema.learningTargets)
      .where(eq(schema.learningTargets.courseId, ps.id));
    expect(psTargets).toHaveLength(4); // no stray targets created
    expect(
      psQs.filter((q) => q.mediaUrl === "/quiz-images/ps-u1-test-form-b/ruler_q12.png")
    ).toHaveLength(1);
    const psTagged = await db.select().from(schema.questionTargets);
    for (const target of psTargets) {
      const mine = psTagged.filter(
        (t) => t.learningTargetId === target.id && psQs.some((q) => q.id === t.questionId)
      );
      expect(mine).toHaveLength(
        { "U1.LT1": 9, "U1.LT2": 7, "U1.LT3": 8, "U1.LT4": 8 }[target.code]!
      );
    }
    const formBAssessment = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "Physical Science · Unit 1 Retake Test"),
    }))!;
    expect(formBAssessment).toMatchObject({
      type: "summative",
      isPublished: true,
      courseId: ps.id,
    });
    // Second run: nothing changes.
    const second = await applyAllPacks();
    expect(second.every((o) => o.status === "already_applied")).toBe(true);
    expect(
      await db.select().from(schema.questions).where(eq(schema.questions.bankId, bank.id))
    ).toHaveLength(10);
  });
  it("renames a bank or assessment still carrying a former name from the pack file", async () => {
    const bank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "PS · Unit 1 · Retake"),
    }))!;
    await db
      .update(schema.questionBanks)
      .set({ name: "PS · Unit 1 Test (Form B)" })
      .where(eq(schema.questionBanks.id, bank.id));
    const a = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "Physical Science · Unit 1 Retake Test"),
    }))!;
    await db
      .update(schema.assessments)
      .set({ title: "Physical Science · Unit 1 Test (Form B)" })
      .where(eq(schema.assessments.id, a.id));
    const out = await applyAllPacks();
    const formB = out.find((o) => o.name === "ps-u1-test-form-b")!;
    expect(formB.status).toBe("already_applied");
    if (formB.status === "already_applied") expect(formB.renamed).toHaveLength(2);
    expect(
      (await db.query.questionBanks.findFirst({ where: eq(schema.questionBanks.id, bank.id) }))!
        .name
    ).toBe("PS · Unit 1 · Retake");
    expect(
      (await db.query.assessments.findFirst({ where: eq(schema.assessments.id, a.id) }))!.title
    ).toBe("Physical Science · Unit 1 Retake Test");
    // Names already current: nothing to rename, nothing re-imported.
    const again = await applyAllPacks();
    const b = again.find((o) => o.name === "ps-u1-test-form-b")!;
    if (b.status === "already_applied") expect(b.renamed).toEqual([]);
    expect(
      await db.select().from(schema.questions).where(eq(schema.questions.bankId, bank.id))
    ).toHaveLength(32);
  });
  it("skips a pack whose teacher is missing and leaves it unapplied for next time", async () => {
    const out = await applyAllPacks("/nonexistent");
    expect(out).toEqual([]);
  });
});
