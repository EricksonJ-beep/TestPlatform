/**
 * Ticket 1.3: the question editor's server side — create each type, save as a
 * new version with history, bulk tag/move/duplicate/archive, and access rules.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getQuestionForEdit, listBankQuestions } from "@/lib/queries/banks";
import {
  bulkArchive,
  bulkDuplicate,
  bulkMove,
  bulkTag,
  createQuestion,
  getHistory,
  updateQuestion,
} from "./actions";

const ids = {
  owner: "",
  coeditor: "",
  viewer: "",
  course: "",
  otherCourse: "",
  bank: "",
  bank2: "",
  otherBank: "",
  lt1: "",
  ltOther: "",
  unit: "",
  q: "",
};
const asUser = (userId: string) => {
  state.session = { userId, role: "teacher", email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const mc = (over: Record<string, unknown> = {}) => ({
  type: "multiple_choice",
  stem: "Plasma is what percent of blood?",
  points: 1,
  difficulty: 2,
  bloom: "remember",
  grading: "auto",
  tags: ["blood"],
  targetIds: [ids.lt1],
  options: [
    { content: "15", isCorrect: false },
    { content: "55", isCorrect: true },
    { content: "75", isCorrect: false, feedback: "Too high." },
  ],
  ...over,
});
const ok = async <T>(
  p: Promise<
    | { ok: true; data: T }
    | { ok: false; status: number; error: string; fieldErrors?: Record<string, string[]> }
  >
) => {
  const r = await p;
  if (!r.ok)
    throw new Error(
      `expected ok, got ${r.status}: ${r.error} ${JSON.stringify(r.fieldErrors ?? {})}`
    );
  return r.data;
};

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values(
      ["owner", "coeditor", "viewer"].map((n) => ({
        email: `${n}@t`,
        passwordHash: "x",
        role: "teacher" as const,
        firstName: n,
        lastName: "T",
      }))
    )
    .returning();
  [ids.owner, ids.coeditor, ids.viewer] = users.map((u) => u.id);
  const [course, other] = await db
    .insert(schema.courses)
    .values([
      { ownerId: ids.owner, name: "Anatomy" },
      { ownerId: ids.owner, name: "Biology" },
    ])
    .returning();
  ids.course = course.id;
  ids.otherCourse = other.id;
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId: course.id, name: "Unit 1" })
    .returning();
  ids.unit = unit.id;
  const [lt1, ltOther] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "LT1", title: "Blood" },
      { courseId: other.id, code: "LT1", title: "Cells" },
    ])
    .returning();
  ids.lt1 = lt1.id;
  ids.ltOther = ltOther.id;
  const [bank, bank2, otherBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: ids.owner, courseId: course.id, name: "Anatomy A" },
      { ownerId: ids.owner, courseId: course.id, name: "Anatomy B" },
      { ownerId: ids.owner, courseId: other.id, name: "Biology" },
    ])
    .returning();
  ids.bank = bank.id;
  ids.bank2 = bank2.id;
  ids.otherBank = otherBank.id;
  await db.insert(schema.shares).values([
    {
      resourceType: "question_bank",
      resourceId: bank.id,
      ownerId: ids.owner,
      sharedWithUserId: ids.coeditor,
      permission: "co_edit",
    },
    {
      resourceType: "question_bank",
      resourceId: bank.id,
      ownerId: ids.owner,
      sharedWithUserId: ids.viewer,
      permission: "view",
    },
  ]);
});

describe("create", () => {
  it("creates one of each Phase 1 type with the right grading config", async () => {
    asUser(ids.owner);
    ids.q = (
      await ok(createQuestion(ids.bank, mc({ unitId: ids.unit, standardCodes: ["HS-LS1-2"] })))
    ).questionId;
    const q = (await getQuestionForEdit(ids.q))!;
    expect(q.version).toBe(1);
    expect(q.options.map((o) => [o.content, o.isCorrect, o.feedback])).toEqual([
      ["15", false, null],
      ["55", true, null],
      ["75", false, "Too high."],
    ]);
    expect(q.targetIds).toEqual([ids.lt1]);
    expect(q.standardCodes).toEqual(["HS-LS1-2"]);

    const ms = await ok(
      createQuestion(
        ids.bank,
        mc({
          type: "multiple_select",
          options: [
            { content: "a", isCorrect: true },
            { content: "b", isCorrect: true },
            { content: "c", isCorrect: false },
          ],
          partialCredit: true,
        })
      )
    );
    expect((await getQuestionForEdit(ms.questionId))!.gradingConfig).toEqual({
      partialCredit: true,
    });

    const tf = await ok(
      createQuestion(
        ids.bank,
        mc({
          type: "true_false",
          options: [
            { content: "True", isCorrect: false },
            { content: "False", isCorrect: true },
          ],
        })
      )
    );
    expect(
      (await getQuestionForEdit(tf.questionId))!.options.map((o) => [o.content, o.isCorrect])
    ).toEqual([
      ["True", false],
      ["False", true],
    ]);

    const fb = await ok(
      createQuestion(
        ids.bank,
        mc({
          type: "fill_blank",
          stem: "RBCs are also called ___.",
          options: [],
          acceptedAnswers: ["erythrocytes", "erythrocyte"],
        })
      )
    );
    expect((await getQuestionForEdit(fb.questionId))!.gradingConfig).toEqual({
      acceptedAnswers: ["erythrocytes", "erythrocyte"],
      caseSensitive: false,
    });

    const sa = await ok(
      createQuestion(
        ids.bank,
        mc({ type: "short_answer", options: [], grading: "manual", keywords: [] })
      )
    );
    expect((await getQuestionForEdit(sa.questionId))!.grading).toBe("manual");

    const er = await ok(
      createQuestion(ids.bank, mc({ type: "extended_response", options: [], grading: "auto" }))
    );
    expect((await getQuestionForEdit(er.questionId))!.grading).toBe("manual");

    const num = await ok(
      createQuestion(
        ids.bank,
        mc({
          type: "numeric",
          options: [],
          numeric: { mode: "tolerance", answer: 9.8, tolerance: 0.2, unit: "m/s^2" },
        })
      )
    );
    expect((await getQuestionForEdit(num.questionId))!.gradingConfig).toEqual({
      mode: "tolerance",
      unit: "m/s^2",
      answer: 9.8,
      tolerance: 0.2,
    });
  });

  it("rejects bad shapes with field errors", async () => {
    asUser(ids.owner);
    const noCorrect = await createQuestion(
      ids.bank,
      mc({
        options: [
          { content: "a", isCorrect: false },
          { content: "b", isCorrect: false },
        ],
      })
    );
    expect(noCorrect).toMatchObject({ ok: false, status: 400 });
    if (!noCorrect.ok) expect(noCorrect.fieldErrors?.options?.[0]).toMatch(/exactly one/);
    const noBlank = await createQuestion(
      ids.bank,
      mc({ type: "fill_blank", stem: "No marker here", options: [], acceptedAnswers: ["x"] })
    );
    expect(noBlank).toMatchObject({ ok: false, status: 400 });
    const rangeBad = await createQuestion(
      ids.bank,
      mc({ type: "numeric", options: [], numeric: { mode: "range", min: 5, max: 1 } })
    );
    expect(rangeBad).toMatchObject({ ok: false, status: 400 });
  });

  it("targets must belong to the bank's course", async () => {
    asUser(ids.owner);
    await expect(createQuestion(ids.bank, mc({ targetIds: [ids.ltOther] }))).resolves.toMatchObject(
      { ok: false, status: 400 }
    );
  });

  it("view share and strangers cannot create; co_edit can", async () => {
    asUser(ids.viewer);
    await expect(createQuestion(ids.bank, mc())).resolves.toMatchObject({ ok: false, status: 403 });
    asUser(ids.coeditor);
    await expect(
      createQuestion(ids.bank, mc({ stem: "Co-editor's question" }))
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("versions", () => {
  it("saving an edit creates v2, archives v1, keeps history, and moves pool membership", async () => {
    asUser(ids.owner);
    const [pool] = await db
      .insert(schema.questionPools)
      .values({ ownerId: ids.owner, courseId: ids.course, name: "LT1 pool" })
      .returning();
    await db.insert(schema.poolQuestions).values({ poolId: pool.id, questionId: ids.q });
    await db
      .update(schema.questions)
      .set({ externalId: "ANAT-1" })
      .where(eq(schema.questions.id, ids.q));

    const v2 = await ok(
      updateQuestion(ids.bank, ids.q, mc({ stem: "Plasma is what percent of blood volume?" }))
    );
    expect(v2.questionId).not.toBe(ids.q);
    const newest = (await getQuestionForEdit(v2.questionId))!;
    expect(newest.version).toBe(2);
    expect(newest.externalId).toBe("ANAT-1");
    const old = (await getQuestionForEdit(ids.q))!;
    expect(old.isArchived).toBe(true);
    expect(old.externalId).toBeNull();
    expect(old.options.length).toBe(3); // history keeps its options

    const members = await db.query.poolQuestions.findMany({
      where: eq(schema.poolQuestions.poolId, pool.id),
    });
    expect(members.map((m) => m.questionId)).toEqual([v2.questionId]);

    const h = await ok(getHistory(ids.bank, ids.q));
    expect(h.versions.map((v) => [v.version, v.isArchived])).toEqual([
      [2, false],
      [1, true],
    ]);

    // Editing the archived version is refused; the live list shows only v2.
    await expect(updateQuestion(ids.bank, ids.q, mc())).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    const live = await listBankQuestions(ids.bank, { q: "blood volume" });
    expect(live.map((q) => q.version)).toEqual([2]);
    ids.q = v2.questionId;
  });
});

describe("bulk", () => {
  it("tag merges, duplicate copies, archive hides, restore returns", async () => {
    asUser(ids.owner);
    await ok(bulkTag(ids.bank, [ids.q], ["review", "blood"]));
    expect((await getQuestionForEdit(ids.q))!.tags).toEqual(["blood", "review"]);

    const d = await ok(bulkDuplicate(ids.bank, [ids.q]));
    const copy = (await getQuestionForEdit(d.created[0]))!;
    expect(copy.stem).toBe((await getQuestionForEdit(ids.q))!.stem);
    expect(copy.externalId).toBeNull();
    expect(copy.version).toBe(1);
    expect(copy.targetIds).toEqual([ids.lt1]);
    expect(copy.options.length).toBe(3);

    await ok(bulkArchive(ids.bank, [d.created[0]], true));
    expect((await listBankQuestions(ids.bank)).some((q) => q.id === d.created[0])).toBe(false);
    expect(
      (await listBankQuestions(ids.bank, { archived: true })).some((q) => q.id === d.created[0])
    ).toBe(true);
    await ok(bulkArchive(ids.bank, [d.created[0]], false));
    expect((await listBankQuestions(ids.bank)).some((q) => q.id === d.created[0])).toBe(true);
  });

  it("move works within a course and is refused across courses or into a bank you can't edit", async () => {
    asUser(ids.owner);
    await expect(bulkMove(ids.bank, [ids.q], ids.otherBank)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await ok(bulkMove(ids.bank, [ids.q], ids.bank2));
    expect((await getQuestionForEdit(ids.q))!.bankId).toBe(ids.bank2);
    // Now it lives in bank2; acting on it from bank is a 404.
    await expect(bulkTag(ids.bank, [ids.q], ["x"])).resolves.toMatchObject({
      ok: false,
      status: 404,
    });

    asUser(ids.coeditor); // can edit bank, not bank2
    await expect(bulkMove(ids.bank2, [ids.q], ids.bank)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("viewers cannot use bulk actions", async () => {
    asUser(ids.viewer);
    await expect(bulkArchive(ids.bank, [ids.q], true)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
