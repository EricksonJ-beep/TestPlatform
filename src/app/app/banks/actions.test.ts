/**
 * Ticket 1.2 "Done when": the template CSV imports cleanly with the right
 * targets, pools, options, and stimulus; a second import with the same
 * external_ids updates instead of duplicating; a bad row is rejected without
 * stopping the others. Plus sharing rules: co_edit can import, view cannot,
 * strangers cannot.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({
  session: null as Session | null,
  jar: new Map<string, string>(),
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (state.jar.has(k) ? { name: k, value: state.jar.get(k)! } : undefined),
    set: (k: string, v: string) => state.jar.set(k, v),
    delete: (k: string) => state.jar.delete(k),
  }),
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCsvRecords } from "@/lib/csv";
import { listBankQuestions } from "@/lib/queries/banks";
import {
  commitQuestionImport,
  createBank,
  previewQuestionImport,
  setBankArchived,
  updateBank,
} from "./actions";

const ids = { owner: "", coeditor: "", viewer: "", stranger: "", course: "", bank: "" };
const asUser = (userId: string) => {
  state.session = { userId, role: "teacher", email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const full = parseCsvRecords(readFileSync("question_import_template.csv", "utf8"));
// The template mixes two courses; a bank belongs to one, so the Anatomy rows are the import and the rest must be flagged.
const template = {
  headers: full.headers,
  records: full.records.filter((r) => r.course === "Anatomy & Physiology"),
};
const otherCourseRows = full.records.filter((r) => r.course !== "Anatomy & Physiology");

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values(
      ["owner", "coeditor", "viewer", "stranger"].map((n) => ({
        email: `${n}@t`,
        passwordHash: "x",
        role: "teacher" as const,
        firstName: n,
        lastName: "T",
      }))
    )
    .returning();
  [ids.owner, ids.coeditor, ids.viewer, ids.stranger] = users.map((u) => u.id);
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: ids.owner, name: "Anatomy & Physiology" })
    .returning();
  ids.course = course.id;
});

describe("banks", () => {
  it("owner creates a bank on their course; a stranger's course is refused", async () => {
    asUser(ids.owner);
    const r = await createBank(fd({ name: "Anatomy bank", courseId: ids.course }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.bank = r.data.bankId;
    asUser(ids.stranger);
    await expect(createBank(fd({ name: "X", courseId: ids.course }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(updateBank(ids.bank, fd({ name: "Hijack" }))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    await expect(setBankArchived(ids.bank, true)).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("view share can read but not import; co_edit can import", async () => {
    await db.insert(schema.shares).values([
      {
        resourceType: "question_bank",
        resourceId: ids.bank,
        ownerId: ids.owner,
        sharedWithUserId: ids.viewer,
        permission: "view",
      },
      {
        resourceType: "question_bank",
        resourceId: ids.bank,
        ownerId: ids.owner,
        sharedWithUserId: ids.coeditor,
        permission: "co_edit",
      },
    ]);
    asUser(ids.viewer);
    await expect(
      previewQuestionImport(ids.bank, template.headers, template.records.slice(0, 1))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    asUser(ids.stranger);
    await expect(
      previewQuestionImport(ids.bank, template.headers, template.records.slice(0, 1))
    ).resolves.toMatchObject({ ok: false, status: 403 });
    asUser(ids.coeditor);
    await expect(
      previewQuestionImport(ids.bank, template.headers, template.records.slice(0, 1))
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("importing the template", () => {
  it("preview reports inserts and what will be created; nothing is written", async () => {
    asUser(ids.owner);
    const r = await previewQuestionImport(ids.bank, template.headers, template.records);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.counts.error).toBe(0);
    expect(r.data.counts.insert).toBe(template.records.length);

    // Rows for another course are flagged and skipped, never imported into this bank.
    const mixed = await previewQuestionImport(ids.bank, full.headers, full.records);
    expect(mixed.ok && mixed.data.counts.skip).toBe(otherCourseRows.length);
    expect(
      mixed.ok &&
        mixed.data.rows
          .filter((x) => x.action === "skip")
          .every((x) => x.issues.some((i) => /belongs to/.test(i.message)))
    ).toBe(true);
    expect(r.data.willCreate.targets.length).toBeGreaterThan(0);
    expect(r.data.willCreate.pools.length).toBeGreaterThan(0);
    expect(await listBankQuestions(ids.bank)).toHaveLength(0);
  });

  it("commit inserts every row with options, targets, pools, and stimuli", async () => {
    asUser(ids.owner);
    const r = await commitQuestionImport(ids.bank, template.headers, template.records, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.counts).toEqual({ inserted: template.records.length, updated: 0, skipped: 0 });
    expect(r.data.created.targets).toBeGreaterThan(0);

    const questions = await listBankQuestions(ids.bank);
    expect(questions).toHaveLength(template.records.length);
    for (const q of questions) expect(q.targets.length).toBe(1);

    const mc = questions.find((q) => q.externalId === "ANAT-CIRC-001")!;
    expect(mc.type).toBe("multiple_choice");
    expect(mc.options.map((o) => [o.content, o.isCorrect])).toEqual([
      ["15", false],
      ["35", false],
      ["55", true],
      ["75", false],
    ]);
    expect(mc.tags).toEqual(["blood", "plasma"]);
    expect(mc.targets[0].code).toBe("LT1");

    const ms = questions.find((q) => q.externalId === "ANAT-CIRC-002")!;
    expect(ms.options.filter((o) => o.isCorrect).map((o) => o.content)).toEqual([
      "Erythrocytes",
      "Leukocytes",
      "Platelets",
    ]);

    const fb = questions.find((q) => q.type === "fill_blank")!;
    expect(fb.gradingConfig).toMatchObject({ acceptedAnswers: ["erythrocytes", "erythrocyte"] });

    const pools = await db.query.questionPools.findMany({
      where: eq(schema.questionPools.courseId, ids.course),
    });
    expect(pools.map((p) => p.name)).toContain("LT1 pool");
    const poolQs = await db.query.poolQuestions.findMany();
    expect(poolQs.length).toBe(template.records.filter((r) => r.pool).length);

    const stimulusRows = template.records.filter((r) => r.stimulus_ref);
    if (stimulusRows.length) {
      const refs = new Set(stimulusRows.map((r) => r.stimulus_ref.toLowerCase()));
      const stimuli = await db.query.stimuli.findMany({
        where: eq(schema.stimuli.courseId, ids.course),
      });
      expect(stimuli.length).toBe(refs.size);
      const withStim = questions.filter((q) => q.stimulusRef);
      expect(withStim.length).toBe(stimulusRows.length);
    }
  });

  it("re-importing the same external_ids updates as new versions instead of duplicating", async () => {
    asUser(ids.coeditor); // co_edit share does this one
    const records = template.records.map((r) =>
      r.external_id === "ANAT-CIRC-001" ? { ...r, stem: r.stem + " (revised)" } : r
    );
    const preview = await previewQuestionImport(ids.bank, template.headers, records);
    expect(preview.ok && preview.data.counts.update).toBe(
      template.records.filter((r) => r.external_id).length
    );

    const r = await commitQuestionImport(ids.bank, template.headers, records, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.counts.updated).toBe(template.records.filter((r) => r.external_id).length);

    const live = await listBankQuestions(ids.bank);
    expect(live).toHaveLength(template.records.length);
    const revised = live.find((q) => q.externalId === "ANAT-CIRC-001")!;
    expect(revised.stem).toMatch(/\(revised\)$/);
    expect(revised.version).toBe(2);
    const archived = await db.query.questions.findMany({
      where: and(eq(schema.questions.bankId, ids.bank), eq(schema.questions.isArchived, true)),
    });
    expect(archived.length).toBe(template.records.filter((r) => r.external_id).length);
    expect(archived.every((q) => q.externalId === null)).toBe(true);
  });

  it("a bad row is rejected without stopping the others; a wrong-course row is skipped", async () => {
    asUser(ids.owner);
    const records = [
      { ...template.records[0], external_id: "NEW-1", correct: "z" },
      { ...template.records[0], external_id: "NEW-2", course: "Biology" },
      { ...template.records[0], external_id: "NEW-3", stem: "A brand new question?" },
    ];
    const preview = await previewQuestionImport(ids.bank, template.headers, records);
    expect(preview.ok && preview.data.rows.map((x) => x.action)).toEqual([
      "skip",
      "skip",
      "insert",
    ]);
    const r = await commitQuestionImport(ids.bank, template.headers, records, []);
    expect(r.ok && r.data.counts).toEqual({ inserted: 1, updated: 0, skipped: 2 });
    const live = await listBankQuestions(ids.bank, { q: "brand new" });
    expect(live).toHaveLength(1);
  });

  it("user-chosen skips are honored and filters work", async () => {
    asUser(ids.owner);
    const records = [{ ...template.records[0], external_id: "NEW-4", stem: "Skip me please" }];
    const r = await commitQuestionImport(ids.bank, template.headers, records, [2]);
    expect(r.ok && r.data.counts).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    const byType = await listBankQuestions(ids.bank, { type: "true_false" });
    expect(byType.every((q) => q.type === "true_false")).toBe(true);
    const byTag = await listBankQuestions(ids.bank, { tag: "plasma" });
    expect(byTag.length).toBeGreaterThan(0);
  });

  it("a bank without a course cannot import", async () => {
    asUser(ids.owner);
    const r = await createBank(fd({ name: "No course" }));
    if (!r.ok) throw new Error("bank");
    await expect(
      previewQuestionImport(r.data.bankId, template.headers, template.records.slice(0, 1))
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });
});

describe("shared stimulus rows (Biology part of the template)", () => {
  it("creates one stimuli row per stimulus_ref and links every question in the group", async () => {
    asUser(ids.owner);
    const [bio] = await db
      .insert(schema.courses)
      .values({ ownerId: ids.owner, name: "Biology" })
      .returning();
    const b = await createBank(fd({ name: "Biology bank", courseId: bio.id }));
    if (!b.ok) throw new Error("bank");
    const bioRows = full.records.filter((r) => r.course === "Biology");
    const refs = new Set(
      bioRows.filter((r) => r.stimulus_ref).map((r) => r.stimulus_ref.toLowerCase())
    );
    expect(refs.size).toBeGreaterThan(0);

    const r = await commitQuestionImport(b.data.bankId, full.headers, bioRows, []);
    expect(r.ok && r.data.counts.inserted).toBe(bioRows.length);
    expect(r.ok && r.data.created.stimuli).toBe(refs.size);

    const stimuli = await db.query.stimuli.findMany({ where: eq(schema.stimuli.courseId, bio.id) });
    expect(stimuli.length).toBe(refs.size);
    expect(stimuli[0].content || stimuli[0].mediaUrl).toBeTruthy();
    const questions = await listBankQuestions(b.data.bankId);
    expect(questions.filter((q) => q.stimulusRef).length).toBe(
      bioRows.filter((r) => r.stimulus_ref).length
    );

    // Re-import reuses the stimulus instead of creating another.
    const again = await commitQuestionImport(b.data.bankId, full.headers, bioRows, []);
    expect(again.ok && again.data.created.stimuli).toBe(0);
    expect(
      (await db.query.stimuli.findMany({ where: eq(schema.stimuli.courseId, bio.id) })).length
    ).toBe(refs.size);
  });
});
