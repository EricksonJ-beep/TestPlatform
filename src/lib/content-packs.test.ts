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
    // Second run: nothing changes.
    const second = await applyAllPacks();
    expect(second.every((o) => o.status === "already_applied")).toBe(true);
    expect(
      await db.select().from(schema.questions).where(eq(schema.questions.bankId, bank.id))
    ).toHaveLength(10);
  });
  it("skips a pack whose teacher is missing and leaves it unapplied for next time", async () => {
    const out = await applyAllPacks("/nonexistent");
    expect(out).toEqual([]);
  });
});
