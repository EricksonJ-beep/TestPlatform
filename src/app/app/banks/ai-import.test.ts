/**
 * Ticket 1.17: the Word/PDF import action with the model call mocked. The
 * guard, the size and type checks, the "not configured" state, and the
 * mapping into rows the CSV preview accepts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({
  session: null as Session | null,
  configured: true,
  calls: 0,
}));

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
vi.mock("@/lib/ai/extract-questions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/extract-questions")>(
    "@/lib/ai/extract-questions"
  );
  return {
    ...actual,
    isAiConfigured: () => state.configured,
    extractQuestions: async (input: {
      fileName: string;
      kind: string;
      targets: { code: string }[];
    }) => {
      state.calls++;
      return {
        questions: [
          {
            type: "multiple_choice",
            stem: `From ${input.fileName} (${input.kind})`,
            options: ["370 m", "3.7 m", "37 m", "0.37 m"],
            correct: "b",
            explanation: "100 cm in a meter.",
            learning_target: input.targets[0]?.code ?? null,
            points: 1,
            unit: null,
          },
          {
            type: "numeric",
            stem: "Convert 87 m to centimeters.",
            options: [],
            correct: "8700",
            explanation: null,
            learning_target: "LT99",
            points: null,
            unit: "cm",
          },
        ],
        notes: "Answer key found on page 4.",
        usage: { inputTokens: 1200, outputTokens: 300, model: "claude-opus-5" },
      };
    },
  };
});

import { db, schema } from "@/db";
import { parseDocumentImport, previewQuestionImport } from "./actions";

const ids = { teacher: "", other: "", bank: "", noCourseBank: "" };
const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });
const PDF = "application/pdf";
const doc = (over: Partial<{ fileName: string; contentType: string; base64: string }> = {}) => ({
  fileName: "Unit 1 Test.pdf",
  contentType: PDF,
  base64: Buffer.from("%PDF-1.4 fake").toString("base64"),
  ...over,
});

beforeAll(async () => {
  const [t, o] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "Other", lastName: "T" },
    ])
    .returning();
  ids.teacher = t.id;
  ids.other = o.id;
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science" })
    .returning();
  await db
    .insert(schema.learningTargets)
    .values({ courseId: course.id, code: "LT3", title: "Convert", sortOrder: 3 });
  const [bank, noCourse] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t.id, courseId: course.id, name: "PS" },
      { ownerId: t.id, name: "No course" },
    ])
    .returning();
  ids.bank = bank.id;
  ids.noCourseBank = noCourse.id;
});

describe("parseDocumentImport", () => {
  it("is guarded, typed, and sized", async () => {
    asUser(ids.other, "teacher");
    await fails(parseDocumentImport(ids.bank, doc()), 403);
    asUser(ids.teacher, "teacher");
    await fails(parseDocumentImport(ids.bank, doc({ contentType: "image/png" })), 400);
    await fails(parseDocumentImport(ids.bank, doc({ base64: "" })), 400);
    await fails(parseDocumentImport(ids.bank, doc({ base64: "A".repeat(15 * 1024 * 1024) })), 400);
    await fails(parseDocumentImport(ids.noCourseBank, doc()), 400);
    state.configured = false;
    await fails(parseDocumentImport(ids.bank, doc()), 503);
    state.configured = true;
    expect(state.calls).toBe(0);
  });

  it("maps the model's questions into rows the CSV preview accepts, with targets resolved", async () => {
    asUser(ids.teacher, "teacher");
    const r = await parseDocumentImport(ids.bank, doc());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(state.calls).toBe(1);
    expect(r.data.notes).toBe("Answer key found on page 4.");
    expect(r.data.usage).toMatchObject({ inputTokens: 1200, outputTokens: 300 });
    expect(r.data.records).toHaveLength(2);
    expect(r.data.records[0]).toMatchObject({
      course: "Physical Science",
      type: "multiple_choice",
      learning_target: "LT3 Convert",
      option_b: "3.7 m",
      correct: "b",
      external_id: "Unit-1-Test-01",
    });
    expect(r.data.records[1]).toMatchObject({
      type: "numeric",
      correct: "8700",
      unit_2: "cm",
      learning_target: "",
    });

    // The same preview the CSV path uses: row 1 imports; row 2 is flagged for its missing target.
    const plan = await previewQuestionImport(ids.bank, r.data.headers, r.data.records);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.data.rows[0]).toMatchObject({ line: 2, action: "insert" });
    expect(plan.data.rows[1].action).toBe("skip");
    expect(plan.data.rows[1].issues.some((i) => /learning_target/.test(i.message))).toBe(true);
  });
});
