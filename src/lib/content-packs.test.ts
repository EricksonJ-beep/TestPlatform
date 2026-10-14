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

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyAllPacks, applyPack, listPacks } from "./content-packs";

const ids = { teacher: "", course: "", cls: "" };
let ps: { id: string };
let bio: { id: string };
let bioUnit2: { id: string };

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
  await db.insert(schema.units).values([
    { courseId: ps.id, name: "Unit 1 · Introduction to Physical Science", sortOrder: 0 },
    { courseId: ps.id, name: "Unit 2 · Atomic Structure", sortOrder: 1 },
    { courseId: ps.id, name: "Unit 3 · Bonding", sortOrder: 2 },
  ]);
  // Physical Science B carries Units 4–6 (scripts/courses/physical-science.ts).
  const [psB] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science B" })
    .returning();
  const psBUnits = await db
    .insert(schema.units)
    .values([
      { courseId: psB.id, name: "Unit 4 · Motion", sortOrder: 0 },
      { courseId: psB.id, name: "Unit 5 · Forces", sortOrder: 1 },
      { courseId: psB.id, name: "Unit 6 · Work and Efficiency", sortOrder: 2 },
    ])
    .returning();
  await db.insert(schema.learningTargets).values(
    psBUnits.flatMap((unit, i) =>
      (i === 2 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).map((n) => ({
        courseId: psB.id,
        unitId: unit.id,
        code: `U${i + 4}.LT${n}`,
        title: `Unit ${i + 4} target ${n}`,
      }))
    )
  );
  await db.insert(schema.learningTargets).values(
    [2, 3].flatMap((u) =>
      [1, 2, 3, 4].map((n) => ({
        courseId: ps.id,
        code: `U${u}.LT${n}`,
        title: `Unit ${u} target ${n}`,
      }))
    )
  );
  await db
    .insert(schema.learningTargets)
    .values(
      [1, 2, 3, 4].map((n) => ({ courseId: ps.id, code: `U1.LT${n}`, title: `Target ${n}` }))
    );
  // Jon's Biology A course is seeded with named units and per-unit codes (scripts/courses/biology.ts).
  [bio] = await db.insert(schema.courses).values({ ownerId: t.id, name: "Biology A" }).returning();
  [bioUnit2] = await db
    .insert(schema.units)
    .values({ courseId: bio.id, name: "Unit 2 · Biochemistry", sortOrder: 1 })
    .returning();
  await db.insert(schema.learningTargets).values(
    [
      ["U2.LT1", "Atoms, molecules, and bonds"],
      ["U2.LT3", "pH, acids, and bases"],
      ["U2.LT4", "The four macromolecules"],
      ["U2.LT5", "Enzymes"],
    ].map(([code, title]) => ({ courseId: bio.id, unitId: bioUnit2.id, code, title }))
  );
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "Anatomy · 5th Hour" })
    .returning();
  // A draft Jon started by hand for the osteon page: the pack should finish it, not duplicate it.
  await db.insert(schema.relearningActivities).values({
    ownerId: t.id,
    courseId: course.id,
    kind: "interactive",
    title: "Osteon",
    url: "/activities/osteon-labeling.html",
  });
  Object.assign(ids, { teacher: t.id, course: course.id, cls: cls.id });
});

describe("content packs", () => {
  it("lists the packs shipped in the repo", () => {
    const names = listPacks().map((p) => p.name);
    expect(names).toContain("anatomy-u2-lab-quiz-integumentary");
    expect(names).toContain("anatomy-u1-quiz-intro-lab-mitosis");
    expect(names).toContain("ps-u1-test-form-b");
    expect(names).toContain("anatomy-u2-activity-osteon-labeling");
  });
  it("applies each pack once: bank, questions with repo-hosted pictures, published assessment, assignment", async () => {
    const first = await applyAllPacks();
    // Physical Science Units 1–6 practice packs (Oct 13 2026): 50 questions, a set, and notes each;
    // U6.LT5 (Rube Goldberg) is the smaller 25-question bank with a planning guide.
    for (const name of [1, 2, 3, 4, 5, 6]
      .flatMap((u) => [1, 2, 3, 4].map((n) => `ps-u${u}-lt${n}-practice`))
      .concat("ps-u6-lt5-practice")) {
      const out = first.find((o) => o.name === name)!;
      expect(out.status).toBe("applied");
      if (out.status === "applied")
        expect(out.summary).toMatchObject({
          questions: name === "ps-u6-lt5-practice" ? 25 : 50,
          practiceSet: { published: true },
          activity: { published: true },
          errors: [],
        });
    }
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
    expect(psTargets).toHaveLength(12); // U1–U3 targets only: no stray targets created
    expect(
      psQs.filter((q) => q.mediaUrl === "/quiz-images/ps-u1-test-form-b/ruler_q12.png")
    ).toHaveLength(1);
    const psTagged = await db.select().from(schema.questionTargets);
    for (const target of psTargets) {
      const mine = psTagged.filter(
        (t) => t.learningTargetId === target.id && psQs.some((q) => q.id === t.questionId)
      );
      expect(mine).toHaveLength(
        // The Form B retake covers Unit 1 only.
        ({ "U1.LT1": 9, "U1.LT2": 7, "U1.LT3": 8, "U1.LT4": 8 } as Record<string, number>)[
          target.code
        ] ?? 0
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
    // The Biology carbohydrate quiz: 10 questions on U2.LT4, two molecule pictures, and both the
    // bank and the published assessment shelved under the pack's unit.
    const carbs = first.find((o) => o.name === "bio-u2-quiz-carbohydrates")!;
    expect(carbs.status).toBe("applied");
    if (carbs.status === "applied")
      expect(carbs.summary).toMatchObject({
        questions: 10,
        unitId: bioUnit2.id,
        assignedTo: [],
        errors: [],
      });
    const carbBank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "Bio · Unit 2 Quiz: Carbohydrates"),
    }))!;
    expect(carbBank.unitId).toBe(bioUnit2.id);
    const carbQs = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.bankId, carbBank.id));
    expect(carbQs).toHaveLength(10);
    expect(carbQs.filter((q) => q.type === "multiple_select")).toHaveLength(1);
    expect(
      carbQs.filter((q) => q.mediaUrl?.startsWith("/quiz-images/bio-u2-quiz-carbohydrates/"))
    ).toHaveLength(2);
    const bioTargets = await db
      .select()
      .from(schema.learningTargets)
      .where(eq(schema.learningTargets.unitId, bioUnit2.id));
    expect(bioTargets).toHaveLength(4); // the seeded U2 targets only; no stray targets
    const carbAssessment = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "Unit 2 Quiz: Carbohydrates"),
    }))!;
    expect(carbAssessment).toMatchObject({
      type: "formative",
      isPublished: true,
      unitId: bioUnit2.id,
    });
    // The Biology biochemistry test: 30 multiple choice + 2 matching (one point per pair, 39 in all),
    // nine pictures, the enzyme graph shared by two questions as one stimulus, shelved under Unit 2.
    const bct = first.find((o) => o.name === "bio-u2-test-biochemistry")!;
    expect(bct.status).toBe("applied");
    if (bct.status === "applied")
      expect(bct.summary).toMatchObject({
        questions: 32,
        unitId: bioUnit2.id,
        assignedTo: [],
        errors: [],
      });
    const bctBank = (await db.query.questionBanks.findFirst({
      where: eq(schema.questionBanks.name, "Bio · Unit 2 Test: Biochemistry"),
    }))!;
    expect(bctBank.unitId).toBe(bioUnit2.id);
    const bctQs = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.bankId, bctBank.id));
    expect(bctQs).toHaveLength(32);
    expect(bctQs.filter((q) => q.type === "matching")).toHaveLength(2);
    expect(bctQs.reduce((sum, q) => sum + q.points, 0)).toBe(39);
    expect(
      bctQs.filter((q) => q.mediaUrl?.startsWith("/quiz-images/bio-u2-test-biochemistry/"))
    ).toHaveLength(9);
    const stimuli = await db
      .select()
      .from(schema.stimuli)
      .where(eq(schema.stimuli.courseId, bio.id));
    expect(stimuli).toHaveLength(1);
    expect(bctQs.filter((q) => q.stimulusId === stimuli[0].id)).toHaveLength(2);
    const bctTagged = await db.select().from(schema.questionTargets);
    for (const target of bioTargets) {
      const mine = bctTagged.filter(
        (t) => t.learningTargetId === target.id && bctQs.some((q) => q.id === t.questionId)
      );
      expect(mine).toHaveLength(
        { "U2.LT1": 8, "U2.LT3": 0, "U2.LT4": 20, "U2.LT5": 4 }[target.code]!
      );
    }
    const bctAssessment = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "Unit 2 Test: Biochemistry"),
    }))!;
    expect(bctAssessment).toMatchObject({
      type: "summative",
      isPublished: true,
      unitId: bioUnit2.id,
    });
    // The Biology pH quiz (Oct 14 2026): 15 multiple choice on U2.LT3 in the author's order,
    // pictures on items 6–9, answer key as written, options never shuffled.
    const ph = first.find((o) => o.name === "bio-u2-quiz-ph")!;
    expect(ph.status).toBe("applied");
    if (ph.status === "applied")
      expect(ph.summary).toMatchObject({
        questions: 15,
        unitId: bioUnit2.id,
        assignedTo: [],
        errors: [],
      });
    const phAssessment = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, "pH Quiz — Biology"),
    }))!;
    expect(phAssessment).toMatchObject({
      type: "formative",
      isPublished: true,
      unitId: bioUnit2.id,
      randomizeOptions: false,
    });
    const [phSection] = await db
      .select()
      .from(schema.assessmentSections)
      .where(eq(schema.assessmentSections.assessmentId, phAssessment.id));
    const phItems = await db
      .select({
        sortOrder: schema.assessmentQuestions.sortOrder,
        question: schema.questions,
      })
      .from(schema.assessmentQuestions)
      .innerJoin(schema.questions, eq(schema.questions.id, schema.assessmentQuestions.questionId))
      .where(eq(schema.assessmentQuestions.sectionId, phSection.id))
      .orderBy(schema.assessmentQuestions.sortOrder);
    expect(phItems.map((i) => i.question.externalId)).toEqual(
      Array.from({ length: 15 }, (_, i) => `BIO-PH-${String(i + 1).padStart(3, "0")}`)
    );
    expect(
      phItems.map((i) => i.question.mediaUrl?.replace("/quiz-images/bio-u2-quiz-ph/", "") ?? null)
    ).toEqual([
      null,
      null,
      null,
      null,
      null,
      "ph_scale_q6.png",
      "indicator_strips_q7.png",
      "ion_beakers_q8.png",
      "enzyme_graph_q9.png",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const phKey: string[] = [];
    for (const { question } of phItems) {
      const opts = await db
        .select()
        .from(schema.questionOptions)
        .where(eq(schema.questionOptions.questionId, question.id))
        .orderBy(schema.questionOptions.sortOrder);
      expect(opts).toHaveLength(4);
      phKey.push(opts.map((o, i) => (o.isCorrect ? "ABCD"[i] : "")).join(""));
    }
    expect(phKey.join("")).toBe("ABBADDCAABCDCBC");
    const lt3 = bioTargets.find((t) => t.code === "U2.LT3")!;
    expect(
      bctTagged.filter(
        (t) => t.learningTargetId === lt3.id && phItems.some((i) => i.question.id === t.questionId)
      )
    ).toHaveLength(15);
    // The osteon activity pack: no bank or CSV; it completes the hand-made draft (same page),
    // renames it, tags U2, and publishes it.
    const osteon = first.find((o) => o.name === "anatomy-u2-activity-osteon-labeling")!;
    expect(osteon.status).toBe("applied");
    if (osteon.status === "applied") {
      expect(osteon.summary).toMatchObject({
        activity: { reused: true, targets: 1, published: true },
        errors: [],
      });
      expect(osteon.summary).not.toHaveProperty("bankId");
    }
    const acts = await db
      .select()
      .from(schema.relearningActivities)
      .where(eq(schema.relearningActivities.url, "/activities/osteon-labeling.html"));
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({
      title: "Osteon (Haversian system): label the structures",
      kind: "interactive",
      courseId: ids.course,
      isPublished: true,
    });
    expect(acts[0].content).toMatch(/osteocyte/);
    const u2 = (await db.query.learningTargets.findFirst({
      where: eq(schema.learningTargets.code, "U2"),
    }))!;
    expect(
      await db
        .select()
        .from(schema.activityTargets)
        .where(eq(schema.activityTargets.activityId, acts[0].id))
    ).toEqual([{ activityId: acts[0].id, learningTargetId: u2.id }]);
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
  it("creates an activity when none exists, and keeps it a draft when no target code matches", async () => {
    const base = {
      name: "test-activity-pack",
      teacherEmail: "EricksonJ@cadott.k12.wi.us",
      course: "Anatomy and Physiology",
    };
    const made = await applyPack({
      ...base,
      activity: {
        title: "Heart model: label the structures",
        url: "/activities/heart-model-labeling.html",
        targets: ["U1", "U9"],
      },
    });
    expect(made.status).toBe("applied");
    if (made.status === "applied") {
      expect(made.summary).toMatchObject({
        activity: { reused: false, targets: 1, published: true },
        errors: ['learning target "U9" not found in the course; not tagged'],
      });
    }
    const heart = (await db.query.relearningActivities.findFirst({
      where: eq(schema.relearningActivities.url, "/activities/heart-model-labeling.html"),
    }))!;
    expect(heart).toMatchObject({ kind: "interactive", isPublished: true, content: null });
    const draft = await applyPack({
      ...base,
      name: "test-activity-pack-no-target",
      activity: { title: "Untagged page", url: "/activities/untagged.html", targets: ["U9"] },
    });
    if (draft.status === "applied")
      expect(draft.summary).toMatchObject({ activity: { targets: 0, published: false } });
    const un = (await db.query.relearningActivities.findFirst({
      where: eq(schema.relearningActivities.url, "/activities/untagged.html"),
    }))!;
    expect(un.isPublished).toBe(false);
  });
  it("a practice pack makes a bank with hints, a set that deals from it, and a guided-notes reading", async () => {
    const root = mkdtempSync(join(tmpdir(), "bloom-packs-"));
    const name = "test-ps-u1-lt3-practice";
    mkdirSync(join(root, name));
    writeFileSync(
      join(root, name, "questions.csv"),
      [
        "external_id,course,learning_target,type,stem,correct,difficulty,explanation,hint",
        'T-1,Physical Science A,U1.LT3,numeric,How many cm are in 2 m?,200,1,"1 m = 100 cm, so 2 × 100 = 200 cm.",How many cm are in 1 m?',
        "T-2,Physical Science A,U1.LT3,numeric,How many mm are in 3 cm?,30,4,1 cm = 10 mm.,",
      ].join("\n")
    );
    const out = await applyPack(
      {
        name,
        teacherEmail: "EricksonJ@cadott.k12.wi.us",
        course: "Physical Science A",
        bank: "PS · U1.LT3 · Practice",
        practiceSet: {
          title: "U1.LT3 Practice: conversions",
          drawCount: 10,
          targets: ["U1.LT3"],
        },
        activity: {
          kind: "guided_notes",
          title: "U1.LT3 Relearning: conversions",
          content: "A conversion factor is a fraction equal to 1.",
          prompts: ["What is a conversion factor?", "Convert 5 m to cm."],
          targets: ["U1.LT3"],
        },
      },
      root
    );
    expect(out.status).toBe("applied");
    if (out.status !== "applied") return;
    expect(out.summary).toMatchObject({
      questions: 2,
      practiceSet: { reused: false, published: true },
      activity: { published: true },
      errors: [],
    });
    const bankId = out.summary.bankId as string;
    const qs = await db.query.questions.findMany({ where: eq(schema.questions.bankId, bankId) });
    expect(qs.find((q) => q.externalId === "T-1")?.hint).toBe("How many cm are in 1 m?");
    const set = (await db.query.practiceSets.findFirst({
      where: eq(schema.practiceSets.title, "U1.LT3 Practice: conversions"),
    }))!;
    expect(set).toMatchObject({ bankId, drawCount: 10, isPublished: true, courseId: ps.id });
    const tags = await db.query.practiceSetTargets.findMany({
      where: eq(schema.practiceSetTargets.practiceSetId, set.id),
    });
    expect(tags).toHaveLength(1);
    const notes = (await db.query.relearningActivities.findFirst({
      where: eq(schema.relearningActivities.title, "U1.LT3 Relearning: conversions"),
    }))!;
    expect(notes).toMatchObject({
      kind: "guided_notes",
      url: null,
      isPublished: true,
      content: "A conversion factor is a fraction equal to 1.",
      prompts: [
        { id: "p1", prompt: "What is a conversion factor?" },
        { id: "p2", prompt: "Convert 5 m to cm." },
      ],
    });
  });

  it("a new revision of an applied pack applies once more, updating questions, set, and notes in place", async () => {
    const root = mkdtempSync(join(tmpdir(), "bloom-packs-"));
    const name = "test-revision-pack";
    mkdirSync(join(root, name));
    const csv = (stem: string) =>
      [
        "external_id,course,learning_target,type,stem,correct,explanation,hint",
        `R-1,Physical Science A,U1.LT2,numeric,${stem},5,Because.,Think.`,
      ].join("\n");
    const def = {
      name,
      teacherEmail: "EricksonJ@cadott.k12.wi.us",
      course: "Physical Science A",
      bank: "PS · Revision bank",
      practiceSet: { title: "Revision set", drawCount: 10, targets: ["U1.LT2"] },
      activity: {
        kind: "reading" as const,
        title: "Revision reading",
        content: "Old text.",
        targets: ["U1.LT2"],
      },
    };
    writeFileSync(join(root, name, "questions.csv"), csv("Old stem?"));
    expect((await applyPack(def, root)).status).toBe("applied");
    expect((await applyPack(def, root)).status).toBe("already_applied");

    writeFileSync(join(root, name, "questions.csv"), csv("New stem?"));
    const r2 = { ...def, revision: 2, activity: { ...def.activity, content: "New text." } };
    const out = await applyPack(r2, root);
    expect(out.status).toBe("applied");
    if (out.status === "applied")
      expect(out.summary).toMatchObject({
        practiceSet: { reused: true },
        activity: { reused: true },
      });
    expect((await applyPack(r2, root)).status).toBe("already_applied");
    const live = await db.query.questions.findMany({
      where: eq(schema.questions.externalId, "R-1"),
    });
    expect(live.map((q) => [q.stem, q.version, q.isArchived])).toEqual([["New stem?", 2, false]]);
    const sets = await db.query.practiceSets.findMany({
      where: eq(schema.practiceSets.title, "Revision set"),
    });
    expect(sets).toHaveLength(1);
    const reading = await db.query.relearningActivities.findMany({
      where: eq(schema.relearningActivities.title, "Revision reading"),
    });
    expect(reading.map((a) => a.content)).toEqual(["New text."]);
  });

  it("skips a pack whose teacher is missing and leaves it unapplied for next time", async () => {
    const out = await applyAllPacks("/nonexistent");
    expect(out).toEqual([]);
  });
});
