/**
 * Ticket R1 (docs/retake-cycle-plan.md): unit tests are one section per learning target, so
 * per-target scores and targeted retakes work on them.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { planTargetSections, resectionAllTests, resectionByTarget } from "./test-sections";

const T = (id: string, code: string, sortOrder = 0) => ({
  id,
  code,
  title: `${code} title`,
  sortOrder,
});

describe("planTargetSections", () => {
  const targets = [T("b", "LT2", 1), T("a", "LT1", 0), T("c", "LT3", 2)];

  it("one section per target in the course's order; questions keep their order inside", () => {
    const plan = planTargetSections(
      [
        { q: 1, targetIds: ["c"] },
        { q: 2, targetIds: ["a"] },
        { q: 3, targetIds: ["c"] },
        { q: 4, targetIds: ["a"] },
      ],
      targets
    );
    expect(plan.map((s) => [s.learningTargetId, s.title, s.items.map((i) => i.q)])).toEqual([
      ["a", "LT1 · LT1 title", [2, 4]],
      ["c", "LT3 · LT3 title", [1, 3]],
    ]);
  });

  it("a question on several targets goes to the first in course order; untagged go to Other, last", () => {
    const plan = planTargetSections(
      [
        { q: 1, targetIds: ["c", "b"] },
        { q: 2, targetIds: [] },
        { q: 3, targetIds: ["elsewhere"] },
      ],
      targets
    );
    expect(plan.map((s) => [s.learningTargetId, s.items.map((i) => i.q)])).toEqual([
      ["b", [1]],
      [null, [2, 3]],
    ]);
    expect(plan[1].title).toBe("Other");
  });
});

describe("resectionByTarget", () => {
  const ids = { teacher: "", course: "", lt1: "", lt2: "", q: [] as string[], student: "" };

  async function singleSectionTest(type: "summative" | "formative", title: string) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: ids.teacher, courseId: ids.course, type, title })
      .returning();
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId: a.id, title: "Questions" })
      .returning();
    await db.insert(schema.assessmentQuestions).values(
      ids.q.map((questionId, i) => ({
        sectionId: sec.id,
        questionId,
        sortOrder: i,
        points: i === 0 ? 4 : null,
      }))
    );
    return a.id;
  }

  beforeAll(async () => {
    const [t] = await db
      .insert(schema.users)
      .values({ email: "t@x", passwordHash: "x", role: "teacher", firstName: "T", lastName: "T" })
      .returning();
    const [s] = await db
      .insert(schema.users)
      .values({ email: "s@x", passwordHash: "x", role: "student", firstName: "S", lastName: "S" })
      .returning();
    ids.teacher = t.id;
    ids.student = s.id;
    const [c] = await db.insert(schema.courses).values({ ownerId: t.id, name: "Bio" }).returning();
    ids.course = c.id;
    const [lt1, lt2] = await db
      .insert(schema.learningTargets)
      .values([
        { courseId: c.id, code: "LT1", title: "Atoms", sortOrder: 0 },
        { courseId: c.id, code: "LT2", title: "Bonds", sortOrder: 1 },
      ])
      .returning();
    ids.lt1 = lt1.id;
    ids.lt2 = lt2.id;
    const [bank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: t.id, courseId: c.id, name: "Bank" })
      .returning();
    // q0 → LT2, q1 → LT1, q2 → LT2, q3 → none
    const qs = await db
      .insert(schema.questions)
      .values(
        [0, 1, 2, 3].map((i) => ({
          bankId: bank.id,
          ownerId: t.id,
          type: "true_false" as const,
          stem: `Q${i}`,
        }))
      )
      .returning();
    ids.q = qs.map((q) => q.id);
    await db.insert(schema.questionTargets).values([
      { questionId: ids.q[0], learningTargetId: lt2.id },
      { questionId: ids.q[1], learningTargetId: lt1.id },
      { questionId: ids.q[2], learningTargetId: lt2.id },
    ]);
  });

  it("moves a single-section test nobody started into target sections, keeping point overrides", async () => {
    const id = await singleSectionTest("summative", "Unit test");
    expect(await resectionByTarget(id)).toEqual({
      status: "resectioned",
      sections: 3,
      untargeted: 1,
    });
    const sections = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, id))
      .orderBy(schema.assessmentSections.sortOrder);
    expect(sections.map((s) => [s.title, s.learningTargetId])).toEqual([
      ["LT1 · Atoms", ids.lt1],
      ["LT2 · Bonds", ids.lt2],
      ["Other", null],
    ]);
    const rows = await db.select().from(schema.assessmentQuestions);
    const inSection = (sid: string) =>
      rows
        .filter((r) => r.sectionId === sid)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => r.questionId);
    expect(inSection(sections[0].id)).toEqual([ids.q[1]]);
    expect(inSection(sections[1].id)).toEqual([ids.q[0], ids.q[2]]);
    expect(inSection(sections[2].id)).toEqual([ids.q[3]]);
    expect(
      rows.find((r) => r.questionId === ids.q[0] && r.sectionId === sections[1].id)?.points
    ).toBe(4);
    // Running again finds it already sectioned.
    expect(await resectionByTarget(id)).toEqual({ status: "skipped", reason: "already_sectioned" });
  });

  it("leaves quizzes and tests a student has started alone", async () => {
    const quiz = await singleSectionTest("formative", "Quiz");
    expect(await resectionByTarget(quiz)).toEqual({ status: "skipped", reason: "not_summative" });

    const started = await singleSectionTest("summative", "Started test");
    const [cls] = await db
      .insert(schema.classes)
      .values({ ownerId: ids.teacher, courseId: ids.course, name: "P1", joinCode: "ABC123" })
      .returning();
    const [asg] = await db
      .insert(schema.assignments)
      .values({ assessmentId: started, classId: cls.id, ownerId: ids.teacher })
      .returning();
    await db
      .insert(schema.attempts)
      .values({ assignmentId: asg.id, studentId: ids.student, number: 1, questionSet: [] });
    expect(await resectionByTarget(started)).toEqual({ status: "skipped", reason: "has_attempts" });

    const all = await resectionAllTests();
    expect(all.map((r) => [r.title, r.outcome])).toEqual([
      ["Started test", { status: "skipped", reason: "has_attempts" }],
    ]);
  });
});
