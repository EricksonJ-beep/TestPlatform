/**
 * Summatives from content packs (Jon, Oct 20 2026): a test built as one untargeted section served
 * no targets, so a 71% read "Done for now" with no corrections. The split and the attempt repair
 * bring the corrections and the retake plan back.
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

import { asc, eq } from "drizzle-orm";
import { saveAnswer, startAttempt, submitAttempt } from "@/app/student/actions";
import { db, schema } from "@/db";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getCorrectionsSummary } from "@/lib/queries/corrections";
import { getRetakeStatus } from "@/lib/queries/retakes";
import {
  groupByTarget,
  insertTargetSections,
  retargetServed,
  retargetSummativeAttempts,
  splitUntargetedSummatives,
  type TargetRef,
} from "./target-sections";

const ids = {
  student: "",
  assessment: "",
  assignment: "",
  lt: [] as string[],
  q: [] as { id: string; lt: string; right: string; wrong: string }[],
  attempt: "",
};

const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const asStudent = () => {
  state.session = {
    userId: ids.student,
    role: "student",
    email: "s@s",
    firstName: "B",
    lastName: "A",
  };
};
const card = async () =>
  (await listStudentAssignments(ids.student)).find((a) => a.id === ids.assignment)!;

const t = (id: string, sortOrder: number): TargetRef => ({
  id,
  code: `LT${sortOrder}`,
  title: id,
  sortOrder,
});

describe("groupByTarget / retargetServed", () => {
  it("groups by target in target order, keeping item order; null when a question has none", () => {
    const targets = new Map([
      ["a", t("two", 2)],
      ["b", t("one", 1)],
      ["c", t("two", 2)],
    ]);
    const items = ["a", "b", "c"].map((questionId) => ({ questionId }));
    expect(
      groupByTarget(items, targets)!.map((g) => [g.target.id, g.items.map((i) => i.questionId)])
    ).toEqual([
      ["one", ["b"]],
      ["two", ["a", "c"]],
    ]);
    expect(groupByTarget([...items, { questionId: "x" }], targets)).toBeNull();
  });

  it("fills only missing targets, and reports no change as null", () => {
    const served = [
      { questionId: "a", sectionId: "old", learningTargetId: null, points: 1, order: 1 },
      { questionId: "b", sectionId: "s2", learningTargetId: "keep", points: 1, order: 2 },
    ];
    const placement = new Map([
      ["a", { sectionId: "s1", learningTargetId: "one" }],
      ["b", { sectionId: "s1", learningTargetId: "one" }],
    ]);
    expect(retargetServed(served, placement)).toEqual([
      { ...served[0], sectionId: "s1", learningTargetId: "one" },
      served[1],
    ]);
    expect(retargetServed([served[1]], placement)).toBeNull();
  });
});

describe("a pack summative in one untargeted section", () => {
  beforeAll(async () => {
    const [teacher, student] = await db
      .insert(schema.users)
      .values([
        { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
        { email: "s@s", passwordHash: "x", role: "student", firstName: "B", lastName: "A" },
      ])
      .returning();
    ids.student = student.id;
    const [course] = await db
      .insert(schema.courses)
      .values({ ownerId: teacher.id, name: "Biology A" })
      .returning();
    const targets = await db
      .insert(schema.learningTargets)
      .values(
        [1, 2].map((n) => ({
          courseId: course.id,
          code: `U2.LT${n}`,
          title: `Target ${n}`,
          sortOrder: n,
        }))
      )
      .returning();
    ids.lt = targets.map((x) => x.id);
    const [cls] = await db
      .insert(schema.classes)
      .values({ ownerId: teacher.id, courseId: course.id, name: "3rd Hour" })
      .returning();
    await db.insert(schema.enrollments).values({ classId: cls.id, studentId: student.id });
    const [bank] = await db
      .insert(schema.questionBanks)
      .values({ ownerId: teacher.id, courseId: course.id, name: "Bank" })
      .returning();
    // Seven one-point questions: four on LT1, three on LT2, interleaved as a CSV might list them.
    for (const lt of [0, 1, 0, 1, 0, 1, 0].map((i) => ids.lt[i])) {
      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: bank.id,
          ownerId: teacher.id,
          type: "multiple_choice",
          stem: `q${ids.q.length}`,
          points: 1,
        })
        .returning();
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt });
      ids.q.push({ id: q.id, lt, right: right.id, wrong: wrong.id });
    }
    const [assessment] = await db
      .insert(schema.assessments)
      .values({
        ownerId: teacher.id,
        courseId: course.id,
        type: "summative",
        title: "Unit 2 Test: Biochemistry",
        isPublished: true,
      })
      .returning();
    ids.assessment = assessment.id;
    // The shape content packs built before the fix.
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId: assessment.id, title: "Questions", sortOrder: 0 })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values(ids.q.map((q, i) => ({ sectionId: sec.id, questionId: q.id, sortOrder: i })));
    const [asg] = await db
      .insert(schema.assignments)
      .values({
        ownerId: teacher.id,
        assessmentId: assessment.id,
        classId: cls.id,
        attemptsAllowed: 2,
        retakeThreshold: 80,
        reviewMode: "teacher_approved",
        retakesNeedUnlock: true,
      })
      .returning();
    ids.assignment = asg.id;

    // 5/7 = 71%: two LT1 questions wrong.
    asStudent();
    ({ attemptId: ids.attempt } = await ok(startAttempt(ids.assignment, null)));
    let wrongLeft = 2;
    for (const q of ids.q) {
      const wrong = q.lt === ids.lt[0] && wrongLeft-- > 0;
      await ok(
        saveAnswer(ids.attempt, q.id, { kind: "choice", optionId: wrong ? q.wrong : q.right })
      );
    }
    await ok(submitAttempt(ids.attempt));
  });

  it("before the repair: no targets served, so no corrections and 'Done for now'", async () => {
    const c = await card();
    expect(c.bestPercent).toBeCloseTo(71.43, 1);
    expect(c.state).toBe("done");
    expect((await getCorrectionsSummary(ids.attempt))!.state).toBe("none");
  });

  it("the repair splits the test by target and the student owes corrections", async () => {
    expect(await splitUntargetedSummatives()).toEqual([ids.assessment]);
    const sections = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, ids.assessment))
      .orderBy(asc(schema.assessmentSections.sortOrder));
    expect(sections.map((s) => [s.title, s.learningTargetId])).toEqual([
      ["U2.LT1 · Target 1", ids.lt[0]],
      ["U2.LT2 · Target 2", ids.lt[1]],
    ]);
    expect(await retargetSummativeAttempts()).toBe(1);

    const summary = (await getCorrectionsSummary(ids.attempt))!;
    expect(summary).toMatchObject({ state: "needed", needed: 2 });
    const c = await card();
    expect(c.state).toBe("corrections_needed");
    expect(c.bestPercent).toBeCloseTo(71.43, 1);
    const retake = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(retake.plan.required).toEqual([ids.lt[0]]);
    expect(retake.targets.map((x) => x.percent)).toEqual([50, 100]);

    // Re-running finds nothing left to do.
    expect(await splitUntargetedSummatives()).toEqual([]);
    expect(await retargetSummativeAttempts()).toBe(0);
  });

  it("a new pack summative is built one section per target", async () => {
    const [a] = await db
      .insert(schema.assessments)
      .values({
        ownerId: (await db.query.users.findFirst({ where: eq(schema.users.email, "t@t") }))!.id,
        type: "summative",
        title: "Fresh",
      })
      .returning();
    await insertTargetSections(
      a.id,
      ids.q.map((q) => q.id)
    );
    const sections = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, a.id))
      .orderBy(asc(schema.assessmentSections.sortOrder));
    expect(sections.map((s) => s.learningTargetId)).toEqual(ids.lt);
    expect(await splitUntargetedSummatives()).toEqual([]);
  });
});
