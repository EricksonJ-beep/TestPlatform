/**
 * Ticket 1.16: sharing between two teachers. view cannot edit or copy; copy
 * cannot edit but can duplicate onto its own course (targets remapped by
 * code); co_edit can edit and import; nobody sees an unshared item; revoking
 * closes the door at once.
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
import { listBankQuestions, listBanksSharedWithMe } from "@/lib/queries/banks";
import { listAssessmentsSharedWithMe, listShares } from "@/lib/queries/shares";
import { updateAssessmentSettings } from "../assessments/actions";
import { commitQuestionImport, updateBank } from "../banks/actions";
import { createQuestion } from "../banks/[bankId]/questions/actions";
import { copyAssessmentToMine, copyBankToMine, revokeShare, shareResource } from "./actions";

const ids = {
  a: "",
  b: "",
  courseA: "",
  courseB: "",
  ltA1: "",
  ltB1: "",
  bank: "",
  bankPrivate: "",
  assessment: "",
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

const bankRef = () => ({ type: "question_bank" as const, id: ids.bank });
const assessmentRef = () => ({ type: "assessment" as const, id: ids.assessment });

beforeAll(async () => {
  const [a, b] = await db
    .insert(schema.users)
    .values([
      {
        email: "jon@cadott.k12.wi.us",
        passwordHash: "x",
        role: "teacher",
        firstName: "Jon",
        lastName: "Erickson",
      },
      {
        email: "colleague@cadott.k12.wi.us",
        passwordHash: "x",
        role: "teacher",
        firstName: "Pat",
        lastName: "Colleague",
      },
    ])
    .returning();
  ids.a = a.id;
  ids.b = b.id;
  const [courseA, courseB] = await db
    .insert(schema.courses)
    .values([
      { ownerId: a.id, name: "Physical Science" },
      { ownerId: b.id, name: "Physical Science (Pat)" },
    ])
    .returning();
  ids.courseA = courseA.id;
  ids.courseB = courseB.id;
  const [ltA1, ltB1] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: courseA.id, code: "LT1", title: "Measure", sortOrder: 1 },
      { courseId: courseB.id, code: "lt1", title: "Measure (Pat)", sortOrder: 1 },
      { courseId: courseB.id, code: "LT9", title: "Other", sortOrder: 9 },
    ])
    .returning();
  ids.ltA1 = ltA1.id;
  ids.ltB1 = ltB1.id;
  const [bank, bankPrivate] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: a.id, courseId: courseA.id, name: "PS shared" },
      { ownerId: a.id, courseId: courseA.id, name: "Jon private" },
    ])
    .returning();
  ids.bank = bank.id;
  ids.bankPrivate = bankPrivate.id;
  const qs = await db
    .insert(schema.questions)
    .values([
      {
        bankId: bank.id,
        ownerId: a.id,
        type: "multiple_choice",
        stem: "Q1",
        points: 1,
        externalId: "PS-1",
      },
      { bankId: bank.id, ownerId: a.id, type: "multiple_choice", stem: "Q2", points: 1 },
    ])
    .returning();
  for (const q of qs) {
    await db.insert(schema.questionOptions).values([
      { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
      { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
    ]);
    await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: ltA1.id });
  }
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: a.id,
      courseId: courseA.id,
      type: "formative",
      title: "PS quiz",
      isPublished: true,
    })
    .returning();
  ids.assessment = assessment.id;
  const [section] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "LT1", learningTargetId: ltA1.id, sortOrder: 0 })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values({ sectionId: section.id, questionId: qs[0].id, sortOrder: 0 });
});

describe("sharing a bank", () => {
  it("only the owner shares; not with themselves, not with an unknown email", async () => {
    asUser(ids.b, "teacher");
    await fails(
      shareResource(bankRef(), fd({ email: "jon@cadott.k12.wi.us", permission: "view" })),
      403
    );
    asUser(ids.a, "teacher");
    await fails(
      shareResource(bankRef(), fd({ email: "jon@cadott.k12.wi.us", permission: "view" })),
      400
    );
    await fails(
      shareResource(bankRef(), fd({ email: "nobody@cadott.k12.wi.us", permission: "view" })),
      404
    );
    expect(
      await ok(
        shareResource(bankRef(), fd({ email: "Colleague@Cadott.k12.wi.us", permission: "view" }))
      )
    ).toEqual({
      userId: ids.b,
      permission: "view",
    });
    expect(await listShares(bankRef())).toMatchObject([{ userId: ids.b, permission: "view" }]);
  });

  it("view: the colleague sees it under Shared, can read it, cannot edit or copy; the private bank stays invisible", async () => {
    asUser(ids.b, "teacher");
    const shared = await listBanksSharedWithMe(ids.b);
    expect(shared.map((s) => [s.name, s.permission, s.questions])).toEqual([
      ["PS shared", "view", 2],
    ]);
    await fails(updateBank(ids.bank, fd({ name: "Renamed" })), 403);
    await fails(createQuestion(ids.bank, {}), 403);
    await fails(copyBankToMine(ids.bank, fd({ courseId: ids.courseB })), 403);
    await fails(updateBank(ids.bankPrivate, fd({ name: "Nope" })), 403);
    await fails(copyBankToMine(ids.bankPrivate, fd({})), 403);
  });

  it("copy: the colleague duplicates it onto their own course with targets remapped by code, but still cannot edit", async () => {
    asUser(ids.a, "teacher");
    await ok(
      shareResource(bankRef(), fd({ email: "colleague@cadott.k12.wi.us", permission: "copy" }))
    );
    asUser(ids.b, "teacher");
    await fails(updateBank(ids.bank, fd({ name: "Renamed" })), 403);
    const r = await ok(copyBankToMine(ids.bank, fd({ courseId: ids.courseB })));
    expect(r).toMatchObject({ copied: 2, retagged: 2 });
    const copy = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.id, r.bankId),
    }))!;
    expect(copy).toMatchObject({
      ownerId: ids.b,
      courseId: ids.courseB,
      name: "PS shared (from Erickson)",
    });
    const qs = await listBankQuestions(r.bankId);
    expect(qs).toHaveLength(2);
    expect(qs.every((q) => q.options.length === 2 && q.targets[0]?.id === ids.ltB1)).toBe(true);
    // The original is untouched and still Jon's.
    expect(await db.$count(schema.questions, eq(schema.questions.bankId, ids.bank))).toBe(2);
  });

  it("co_edit: the colleague imports a CSV into the shared bank and Jon sees the question", async () => {
    asUser(ids.a, "teacher");
    await ok(
      shareResource(bankRef(), fd({ email: "colleague@cadott.k12.wi.us", permission: "co_edit" }))
    );
    asUser(ids.b, "teacher");
    await ok(updateBank(ids.bank, fd({ name: "PS shared", description: "Both of us" })));
    const headers = [
      "course",
      "unit",
      "learning_target",
      "type",
      "stem",
      "option_a",
      "option_b",
      "correct",
      "tolerance",
      "tolerance_mode",
      "unit",
    ];
    const record = {
      course: "Physical Science",
      unit: "Unit 1",
      learning_target: "LT1 Measure",
      type: "multiple_choice",
      stem: "Imported by Pat",
      option_a: "Yes",
      option_b: "No",
      correct: "a",
      tolerance: "",
      tolerance_mode: "",
      unit_2: "",
    };
    const result = await ok(commitQuestionImport(ids.bank, headers, [record], []));
    expect(result.counts).toMatchObject({ inserted: 1 });
    asUser(ids.a, "teacher");
    const qs = await listBankQuestions(ids.bank);
    expect(qs.map((q) => q.stem).sort()).toEqual(["Imported by Pat", "Q1", "Q2"]);
    expect(qs.find((q) => q.stem === "Imported by Pat")!.targets[0]).toMatchObject({ code: "LT1" });
  });

  it("revoke: access ends at once", async () => {
    asUser(ids.a, "teacher");
    await ok(revokeShare(bankRef(), ids.b));
    asUser(ids.b, "teacher");
    expect(await listBanksSharedWithMe(ids.b)).toEqual([]);
    await fails(updateBank(ids.bank, fd({ name: "Renamed" })), 403);
    await fails(copyBankToMine(ids.bank, fd({})), 403);
  });
});

describe("sharing an assessment", () => {
  it("view cannot edit or copy; copy duplicates onto the colleague's course; co_edit edits", async () => {
    asUser(ids.a, "teacher");
    await ok(
      shareResource(
        assessmentRef(),
        fd({ email: "colleague@cadott.k12.wi.us", permission: "view" })
      )
    );
    asUser(ids.b, "teacher");
    expect(
      (await listAssessmentsSharedWithMe(ids.b)).map((a) => [a.title, a.permission, a.sections])
    ).toEqual([["PS quiz", "view", 1]]);
    await fails(updateAssessmentSettings(ids.assessment, fd({})), 403);
    await fails(copyAssessmentToMine(ids.assessment, fd({ courseId: ids.courseB })), 403);

    asUser(ids.a, "teacher");
    await ok(
      shareResource(
        assessmentRef(),
        fd({ email: "colleague@cadott.k12.wi.us", permission: "copy" })
      )
    );
    asUser(ids.b, "teacher");
    const r = await ok(copyAssessmentToMine(ids.assessment, fd({ courseId: ids.courseB })));
    expect(r).toMatchObject({ sections: 1, remapped: 1 });
    const copy = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.id, r.assessmentId),
    }))!;
    expect(copy).toMatchObject({
      ownerId: ids.b,
      courseId: ids.courseB,
      isPublished: false,
      title: "PS quiz (from Erickson)",
    });
    const [section] = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, copy.id));
    expect(section.learningTargetId).toBe(ids.ltB1);
    expect(
      await db.$count(
        schema.assessmentQuestions,
        eq(schema.assessmentQuestions.sectionId, section.id)
      )
    ).toBe(1);
    await fails(updateAssessmentSettings(ids.assessment, fd({})), 403);

    asUser(ids.a, "teacher");
    await ok(
      shareResource(
        assessmentRef(),
        fd({ email: "colleague@cadott.k12.wi.us", permission: "co_edit" })
      )
    );
    asUser(ids.b, "teacher");
    // Guard passes now; the empty form fails validation, not authorization.
    await fails(updateAssessmentSettings(ids.assessment, fd({})), 400);
  });
});
