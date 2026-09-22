/**
 * Ticket 1.5: stimuli CRUD and attach/detach rules, plus the Appendix A
 * "tomato-graph" done-when — imported rows sharing a stimulus_ref render as one
 * group in the bank preview.
 */
import { readFileSync } from "node:fs";
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
import { parseCsvRecords } from "@/lib/csv";
import { listBankQuestions } from "@/lib/queries/banks";
import { listStimuli } from "@/lib/queries/stimuli";
import { groupByStimulus } from "@/lib/stimulus-groups";
import { commitQuestionImport, createBank } from "@/app/app/banks/actions";
import { bulkSetStimulus, createQuestion } from "@/app/app/banks/[bankId]/questions/actions";
import { createStimulus, deleteStimulus, updateStimulus } from "./actions";

const ids = {
  owner: "",
  other: "",
  course: "",
  otherCourse: "",
  bank: "",
  stim: "",
  otherStim: "",
  q1: "",
  q2: "",
};
const asUser = (userId: string) => {
  state.session = { userId, role: "teacher", email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const [a, b] = await db
    .insert(schema.users)
    .values([
      { email: "a@t", passwordHash: "x", role: "teacher", firstName: "A", lastName: "T" },
      { email: "b@t", passwordHash: "x", role: "teacher", firstName: "B", lastName: "T" },
    ])
    .returning();
  ids.owner = a.id;
  ids.other = b.id;
  const [c, oc] = await db
    .insert(schema.courses)
    .values([
      { ownerId: a.id, name: "Biology" },
      { ownerId: b.id, name: "Other" },
    ])
    .returning();
  ids.course = c.id;
  ids.otherCourse = oc.id;
  asUser(ids.owner);
  const r = await createBank(fd({ name: "Bio bank", courseId: ids.course }));
  if (!r.ok) throw new Error("bank");
  ids.bank = r.data.bankId;
  const [os] = await db
    .insert(schema.stimuli)
    .values({
      ownerId: b.id,
      courseId: oc.id,
      kind: "text",
      title: "Other course passage",
      content: "x",
    })
    .returning();
  ids.otherStim = os.id;
});

describe("stimuli manager", () => {
  it("creates, validates per kind, enforces unique ref, updates", async () => {
    asUser(ids.owner);
    const r = await createStimulus(
      ids.course,
      fd({
        kind: "text",
        title: "Cell membrane passage",
        ref: "membrane",
        content: "The membrane is selectively permeable.",
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.stim = r.data.stimulusId;

    const noContent = await createStimulus(ids.course, fd({ kind: "text", title: "Empty" }));
    expect(noContent).toMatchObject({ ok: false, status: 400 });
    const noMedia = await createStimulus(ids.course, fd({ kind: "image", title: "Graph" }));
    expect(noMedia).toMatchObject({ ok: false, status: 400 });
    const dupRef = await createStimulus(
      ids.course,
      fd({ kind: "text", title: "Dup", ref: "MEMBRANE", content: "x" })
    );
    expect(dupRef).toMatchObject({ ok: false, status: 409 });
    const badUrl = await createStimulus(
      ids.course,
      fd({ kind: "image", title: "Graph", mediaUrl: "graph.png" })
    );
    expect(badUrl).toMatchObject({ ok: false, status: 400 });

    await expect(
      updateStimulus(
        ids.course,
        ids.stim,
        fd({ kind: "text", title: "Cell membrane", ref: "membrane", content: "Updated passage." })
      )
    ).resolves.toMatchObject({ ok: true });
    const rows = await listStimuli(ids.course);
    expect(rows.map((s) => [s.title, s.content])).toEqual([["Cell membrane", "Updated passage."]]);
  });

  it("other teachers cannot touch a course's stimuli", async () => {
    asUser(ids.other);
    await expect(
      createStimulus(ids.course, fd({ kind: "text", title: "X", content: "x" }))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      updateStimulus(ids.course, ids.stim, fd({ kind: "text", title: "X", content: "x" }))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(deleteStimulus(ids.course, ids.stim)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("attaching to questions", () => {
  const mc = (stem: string, extra: Record<string, unknown> = {}) => ({
    type: "multiple_choice",
    stem,
    options: [
      { content: "a", isCorrect: true },
      { content: "b", isCorrect: false },
    ],
    ...extra,
  });

  it("editor payload: a stimulus from another course is refused; own course works", async () => {
    asUser(ids.owner);
    await expect(
      createQuestion(ids.bank, mc("Wrong course", { stimulusId: ids.otherStim }))
    ).resolves.toMatchObject({ ok: false, status: 400 });
    const r1 = await createQuestion(
      ids.bank,
      mc("Which molecules pass freely?", { stimulusId: ids.stim })
    );
    const r2 = await createQuestion(ids.bank, mc("What does selectively permeable mean?"));
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    ids.q1 = r1.data.questionId;
    ids.q2 = r2.data.questionId;
  });

  it("bulk attach groups questions; bulk detach and delete rules", async () => {
    asUser(ids.owner);
    await expect(bulkSetStimulus(ids.bank, [ids.q2], ids.otherStim)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(bulkSetStimulus(ids.bank, [ids.q2], ids.stim)).resolves.toMatchObject({
      ok: true,
    });
    const list = await listBankQuestions(ids.bank);
    const groups = groupByStimulus(list);
    expect(groups).toHaveLength(1);
    expect(groups[0].stimulus?.title).toBe("Cell membrane");
    expect(groups[0].questions).toHaveLength(2);
    expect((await listStimuli(ids.course))[0].questions).toBe(2);

    await expect(deleteStimulus(ids.course, ids.stim)).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    await expect(bulkSetStimulus(ids.bank, [ids.q1, ids.q2], null)).resolves.toMatchObject({
      ok: true,
    });
    expect(groupByStimulus(await listBankQuestions(ids.bank))).toHaveLength(2);
    await expect(deleteStimulus(ids.course, ids.stim)).resolves.toMatchObject({ ok: true });

    asUser(ids.other);
    await expect(bulkSetStimulus(ids.bank, [ids.q1], null)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe("the tomato-graph rows from the template", () => {
  it("import as one stimulus with its questions grouped beneath, contiguous, in the preview order", async () => {
    asUser(ids.owner);
    const full = parseCsvRecords(readFileSync("question_import_template.csv", "utf8"));
    const bio = full.records.filter((r) => r.course === "Biology");
    const r = await commitQuestionImport(ids.bank, full.headers, bio, []);
    expect(r.ok && r.data.created.stimuli).toBe(1);

    const list = await listBankQuestions(ids.bank);
    const groups = groupByStimulus(list);
    const tomato = groups.find(
      (g) => g.stimulus?.title?.toLowerCase().includes("tomato") || g.stimulus?.id
    );
    expect(tomato).toBeTruthy();
    expect(tomato!.questions.length).toBe(bio.filter((x) => x.stimulus_ref).length);
    expect(tomato!.questions.every((q) => q.stimulus?.id === tomato!.stimulus!.id)).toBe(true);
    // The stimulus row carries the content from the first row that named it.
    const stimulusRow = await db.query.stimuli.findFirst({
      where: eq(schema.stimuli.id, tomato!.stimulus!.id),
    });
    expect(stimulusRow?.content || stimulusRow?.mediaUrl).toBeTruthy();
    // Every group in the preview order is contiguous: no stimulus id appears in two separate groups.
    const seen = new Set<string>();
    for (const g of groups) {
      if (!g.stimulus) continue;
      expect(seen.has(g.stimulus.id)).toBe(false);
      seen.add(g.stimulus.id);
    }
  });
});
