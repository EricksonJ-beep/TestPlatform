/**
 * Ticket 1.7: assessment builder actions and their cross-access rules, against an
 * in-memory Postgres with the real migrations.
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
import { buildQuestionSet, seededRng } from "@/lib/assessments/serve";
import {
  getAssessmentDetail,
  loadBuilderSections,
  listAssessments,
} from "@/lib/queries/assessments";
import {
  addPoolDraw,
  addQuestions,
  addSection,
  addSectionPerTarget,
  createAssessment,
  deleteAssessment,
  deleteSection,
  duplicateAssessment,
  moveItem,
  moveSection,
  removeItem,
  searchBankQuestions,
  setPublished,
  updateAssessmentSettings,
  updateItem,
  updateSection,
} from "./actions";

const ids = {
  teacherA: "",
  teacherB: "",
  courseA: "",
  courseB: "",
  bankA: "",
  bankB: "",
  lt: [] as string[],
  pools: [] as string[],
  questions: [] as string[],
  questionB: "",
  summative: "",
  formative: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

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
  const [cA, cB] = await db
    .insert(schema.courses)
    .values([
      { ownerId: a.id, name: "Biology" },
      { ownerId: b.id, name: "Chemistry" },
    ])
    .returning();
  ids.courseA = cA.id;
  ids.courseB = cB.id;
  const lts = await db
    .insert(schema.learningTargets)
    .values(
      [1, 2, 3, 4].map((n) => ({
        courseId: cA.id,
        code: `LT${n}`,
        title: `Target ${n}`,
        sortOrder: n,
      }))
    )
    .returning();
  ids.lt = lts.map((t) => t.id);
  const [bankA, bankB] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: a.id, courseId: cA.id, name: "Bio bank" },
      { ownerId: b.id, courseId: cB.id, name: "Chem bank" },
    ])
    .returning();
  ids.bankA = bankA.id;
  ids.bankB = bankB.id;
  // Four pools, one per target, each with 5 questions; plus 10 loose questions for the formative.
  for (let t = 0; t < 4; t++) {
    const [pool] = await db
      .insert(schema.questionPools)
      .values({ ownerId: a.id, courseId: cA.id, name: `Pool LT${t + 1}` })
      .returning();
    ids.pools.push(pool.id);
    await db.insert(schema.poolTargets).values({ poolId: pool.id, learningTargetId: ids.lt[t] });
    const qs = await db
      .insert(schema.questions)
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          bankId: bankA.id,
          ownerId: a.id,
          type: "multiple_choice" as const,
          stem: `LT${t + 1} pool question ${i + 1}`,
          points: 2,
        }))
      )
      .returning();
    await db
      .insert(schema.poolQuestions)
      .values(qs.map((q) => ({ poolId: pool.id, questionId: q.id })));
    await db
      .insert(schema.questionTargets)
      .values(qs.map((q) => ({ questionId: q.id, learningTargetId: ids.lt[t] })));
  }
  const loose = await db
    .insert(schema.questions)
    .values(
      Array.from({ length: 10 }, (_, i) => ({
        bankId: bankA.id,
        ownerId: a.id,
        type: "true_false" as const,
        stem: `Fixed question ${i + 1}`,
        points: 1,
      }))
    )
    .returning();
  ids.questions = loose.map((q) => q.id);
  const [qB] = await db
    .insert(schema.questions)
    .values({
      bankId: bankB.id,
      ownerId: b.id,
      type: "true_false",
      stem: "Chem question",
      points: 1,
    })
    .returning();
  ids.questionB = qB.id;
});

describe("create and settings", () => {
  it("creates with defaults by type; another teacher's course is refused", async () => {
    asUser(ids.teacherA, "teacher");
    ids.summative = (
      await ok(
        createAssessment(fd({ title: "Unit 3 test", type: "summative", courseId: ids.courseA }))
      )
    ).assessmentId;
    ids.formative = (
      await ok(
        createAssessment(fd({ title: "Unit 3 quiz", type: "formative", courseId: ids.courseA }))
      )
    ).assessmentId;
    const s = await getAssessmentDetail(ids.summative);
    expect(s).toMatchObject({ attemptLimit: 2, showResultsImmediately: false, isPublished: false });
    const f = await getAssessmentDetail(ids.formative);
    expect(f).toMatchObject({ attemptLimit: 3, showResultsImmediately: true });
    await fails(createAssessment(fd({ title: "X", type: "practice", courseId: ids.courseB })), 403);
    asUser(ids.teacherB, "teacher");
    expect(await listAssessments(ids.teacherB)).toHaveLength(0);
  });

  it("settings validate and save; a stranger gets 403, a student 403", async () => {
    asUser(ids.teacherA, "teacher");
    const base = {
      title: "Unit 3 test",
      type: "summative",
      reviewMode: "teacher_approved",
      retakeThreshold: "85",
      attemptLimit: "2",
      randomizeQuestions: "on",
      optionalRetakes: "on",
      allowBacktrack: "on",
    };
    await ok(updateAssessmentSettings(ids.summative, fd(base)));
    const s = await getAssessmentDetail(ids.summative);
    expect(s).toMatchObject({
      reviewMode: "teacher_approved",
      retakeThreshold: 85,
      randomizeQuestions: true,
      oneAtATime: false,
    });
    await fails(
      updateAssessmentSettings(ids.summative, fd({ ...base, retakeThreshold: "150" })),
      400
    );
    asUser(ids.teacherB, "teacher");
    await fails(updateAssessmentSettings(ids.summative, fd(base)), 403);
    asUser(ids.teacherB, "student");
    await fails(updateAssessmentSettings(ids.summative, fd(base)), 403);
  });
});

describe("summative: four target sections drawing from four pools", () => {
  it("adds a section per target, then a pool draw in each", async () => {
    asUser(ids.teacherA, "teacher");
    expect(await ok(addSectionPerTarget(ids.summative))).toEqual({ created: 4 });
    expect(await ok(addSectionPerTarget(ids.summative))).toEqual({ created: 0 });
    const detail = (await getAssessmentDetail(ids.summative))!;
    expect(detail.sections.map((s) => s.learningTargetId)).toEqual(ids.lt);
    for (const [i, s] of detail.sections.entries()) {
      await ok(addPoolDraw(ids.summative, s.id, ids.pools[i], 3));
    }
    const after = (await getAssessmentDetail(ids.summative))!;
    expect(after.sections.every((s) => s.items.length === 1 && s.items[0].kind === "pool")).toBe(
      true
    );
    expect(after.sections[0].items[0]).toMatchObject({
      kind: "pool",
      drawCount: 3,
      pool: { size: 5 },
    });
  });

  it("serves 12 questions, 3 per target, no repeats, deterministic per seed", async () => {
    const sections = await loadBuilderSections(ids.summative);
    const set = buildQuestionSet(sections, { randomizeQuestions: true, rng: seededRng(42) });
    expect(set).toHaveLength(12);
    for (const lt of ids.lt) expect(set.filter((q) => q.learningTargetId === lt)).toHaveLength(3);
    expect(new Set(set.map((q) => q.questionId)).size).toBe(12);
    const again = buildQuestionSet(sections, { randomizeQuestions: true, rng: seededRng(42) });
    expect(again.map((q) => q.questionId)).toEqual(set.map((q) => q.questionId));
  });

  it("refuses a pool from another course, a bad draw count, and a section from another assessment", async () => {
    asUser(ids.teacherB, "teacher");
    const [poolB] = await db
      .insert(schema.questionPools)
      .values({ ownerId: ids.teacherB, courseId: ids.courseB, name: "Chem pool" })
      .returning();
    asUser(ids.teacherA, "teacher");
    const detail = (await getAssessmentDetail(ids.summative))!;
    await fails(addPoolDraw(ids.summative, detail.sections[0].id, poolB.id, 2), 400);
    await fails(addPoolDraw(ids.summative, detail.sections[0].id, ids.pools[0], 0), 400);
    await fails(addPoolDraw(ids.formative, detail.sections[0].id, ids.pools[0], 2), 404);
  });
});

describe("formative: ten fixed questions", () => {
  it("adds questions, overrides points, reorders, removes", async () => {
    asUser(ids.teacherA, "teacher");
    const { sectionId } = await ok(
      addSection(ids.formative, fd({ title: "All questions", learningTargetId: ids.lt[0] }))
    );
    expect(await ok(addQuestions(ids.formative, sectionId, ids.questions))).toEqual({ added: 10 });
    expect(await ok(addQuestions(ids.formative, sectionId, ids.questions.slice(0, 2)))).toEqual({
      added: 0,
    });
    let detail = (await getAssessmentDetail(ids.formative))!;
    const items = detail.sections[0].items;
    expect(items).toHaveLength(10);
    expect(items.map((i) => (i.kind === "question" ? i.question.stem : ""))).toEqual(
      ids.questions.map((_, i) => `Fixed question ${i + 1}`)
    );

    await ok(updateItem(ids.formative, items[0].id, { points: 5 }));
    await ok(moveItem(ids.formative, items[2].id, "up"));
    await ok(removeItem(ids.formative, items[9].id));
    detail = (await getAssessmentDetail(ids.formative))!;
    const after = detail.sections[0].items;
    expect(after).toHaveLength(9);
    expect(after[0]).toMatchObject({ points: 5 });
    expect(after.slice(0, 3).map((i) => (i.kind === "question" ? i.question.stem : ""))).toEqual([
      "Fixed question 1",
      "Fixed question 3",
      "Fixed question 2",
    ]);

    const set = buildQuestionSet(await loadBuilderSections(ids.formative), {
      randomizeQuestions: false,
    });
    expect(set).toHaveLength(9);
    expect(set.reduce((n, q) => n + q.points, 0)).toBe(5 + 8);
    expect(set.every((q) => q.learningTargetId === ids.lt[0])).toBe(true);
  });

  it("refuses questions from another course's bank, archived questions, and a stranger's edits", async () => {
    asUser(ids.teacherA, "teacher");
    const detail = (await getAssessmentDetail(ids.formative))!;
    const sectionId = detail.sections[0].id;
    await fails(addQuestions(ids.formative, sectionId, [ids.questionB]), 400);
    await db
      .update(schema.questions)
      .set({ isArchived: true })
      .where(eq(schema.questions.id, ids.questions[9]));
    await fails(addQuestions(ids.formative, sectionId, [ids.questions[9]]), 400);
    await fails(addQuestions(ids.formative, sectionId, []), 400);
    asUser(ids.teacherB, "teacher");
    await fails(addQuestions(ids.formative, sectionId, [ids.questions[0]]), 403);
    await fails(addSection(ids.formative, fd({ title: "Nope" })), 403);
    await fails(searchBankQuestions(ids.formative, ids.bankA, {}), 403);
  });

  it("a co_edit share lets a colleague build; a view share does not", async () => {
    const [share] = await db
      .insert(schema.shares)
      .values({
        resourceType: "assessment",
        resourceId: ids.formative,
        ownerId: ids.teacherA,
        sharedWithUserId: ids.teacherB,
        permission: "view",
      })
      .returning();
    asUser(ids.teacherB, "teacher");
    await fails(addSection(ids.formative, fd({ title: "Nope" })), 403);
    expect(await getAssessmentDetail(ids.formative)).not.toBeNull(); // page guard is requireShared(view), tested in authz.test
    await db
      .update(schema.shares)
      .set({ permission: "co_edit" })
      .where(eq(schema.shares.id, share.id));
    const { sectionId } = await ok(addSection(ids.formative, fd({ title: "Colleague section" })));
    // The bank itself isn't shared, so fixed questions from it are refused even with co_edit on the assessment.
    await fails(addQuestions(ids.formative, sectionId, [ids.questions[0]]), 403);
    await fails(searchBankQuestions(ids.formative, ids.bankA, {}), 403);
    await ok(deleteSection(ids.formative, sectionId));
    await fails(deleteAssessment(ids.formative), 403); // owner only
    await db.delete(schema.shares).where(eq(schema.shares.id, share.id));
  });
});

describe("sections", () => {
  it("edit, reorder, and target-on-course rule", async () => {
    asUser(ids.teacherA, "teacher");
    const detail = (await getAssessmentDetail(ids.summative))!;
    const [s1, s2] = detail.sections;
    await ok(
      updateSection(
        ids.summative,
        s1.id,
        fd({ title: "Renamed", learningTargetId: ids.lt[0], instructions: "Show work" })
      )
    );
    await ok(moveSection(ids.summative, s2.id, "up"));
    const after = (await getAssessmentDetail(ids.summative))!;
    expect(after.sections.slice(0, 2).map((s) => s.title)).toEqual([s2.title, "Renamed"]);
    expect(after.sections[1].instructions).toBe("Show work");
    asUser(ids.teacherB, "teacher");
    const [ltB] = await db
      .insert(schema.learningTargets)
      .values({ courseId: ids.courseB, code: "LTB", title: "Other" })
      .returning();
    asUser(ids.teacherA, "teacher");
    await fails(
      updateSection(ids.summative, s1.id, fd({ title: "X", learningTargetId: ltB.id })),
      400
    );
  });
});

describe("publish, duplicate, delete", () => {
  it("publishing needs content; unpublishing is blocked by assignments; duplicate copies structure", async () => {
    asUser(ids.teacherA, "teacher");
    const { assessmentId: empty } = await ok(
      createAssessment(fd({ title: "Empty", type: "practice", courseId: ids.courseA }))
    );
    await fails(setPublished(empty, true), 400);
    await ok(setPublished(ids.summative, true));
    expect((await getAssessmentDetail(ids.summative))?.isPublished).toBe(true);

    const { assessmentId: copy } = await ok(duplicateAssessment(ids.summative));
    const c = (await getAssessmentDetail(copy))!;
    expect(c.title).toBe("Unit 3 test (copy)");
    expect(c.isPublished).toBe(false);
    expect(c.sections).toHaveLength(4);
    expect(c.sections.every((s) => s.items.length === 1)).toBe(true);
    expect(c.sections.map((s) => s.id)).not.toContain(ids.summative);

    const [cls] = await db
      .insert(schema.classes)
      .values({ ownerId: ids.teacherA, courseId: ids.courseA, name: "P3" })
      .returning();
    await db
      .insert(schema.assignments)
      .values({ ownerId: ids.teacherA, assessmentId: ids.summative, classId: cls.id });
    await fails(setPublished(ids.summative, false), 409);
    await fails(deleteAssessment(ids.summative), 409);
    await ok(deleteAssessment(copy));
    expect(await getAssessmentDetail(copy)).toBeNull();
    asUser(ids.teacherB, "teacher");
    await fails(duplicateAssessment(ids.summative), 403);
    await fails(deleteAssessment(empty), 403);
  });
});
