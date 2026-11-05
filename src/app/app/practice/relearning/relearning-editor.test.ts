/**
 * The teacher's Read · Watch · Do editor (Nov 5 2026) on an in-memory Postgres with the real
 * migrations, the real `ps-u3-lt1-relearning` pack and the real actions: the owner saves (sections
 * in place, `edited_at` set), another teacher is refused, an invalid option is refused with its
 * issue before anything is written, a student partway through keeps their progress across an
 * edit, and a later revision of the pack keeps the teacher's edits.
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

import { readFileSync } from "node:fs";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeAttempt } from "@/lib/attempts";
import { applyPack, type PackDefinition } from "@/lib/content-packs";
import { getCorrectionScope } from "@/lib/queries/corrections";
import { getEditorOption } from "@/lib/queries/relearning-options";
import { formToPack, optionToForm } from "@/lib/relearning-editor";
import { getRelearningView } from "@/lib/relearning-server";
import { startAttempt } from "@/app/student/actions";
import { saveCorrection, submitCorrections } from "@/app/student/corrections/actions";
import {
  answerRelearningCheck,
  markRelearningSection,
  startRelearning,
} from "@/app/student/relearning/actions";
import { createRelearningOption, updateRelearningOption } from "./actions";

const PACK = JSON.parse(
  readFileSync("content/packs/ps-u3-lt1-relearning/pack.json", "utf8")
) as PackDefinition;

const ids = {
  jon: "",
  other: "",
  student: "",
  course: "",
  otherCourse: "",
  lt1: "",
  lt2: "",
  otherLt: "",
  quiz: "",
  read: "",
  do: "",
};

const as = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const ok = async <T>(p: Promise<Result<T>>) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const sectionsOf = (optionId: string) =>
  db
    .select()
    .from(schema.relearningSections)
    .where(eq(schema.relearningSections.optionId, optionId))
    .orderBy(asc(schema.relearningSections.part), asc(schema.relearningSections.sortOrder));
const optionRow = async (optionId: string) =>
  (await db.query.relearningOptions.findFirst({
    where: eq(schema.relearningOptions.id, optionId),
  }))!;
/** What the editor would send for an option as saved, after `edit` changes the form. */
async function edited(
  optionId: string,
  edit: (f: ReturnType<typeof optionToForm>) => void
): Promise<unknown> {
  const o = (await getEditorOption(optionId))!;
  const form = optionToForm(o);
  edit(form);
  return formToPack(form, o.target.code, o.mode).pack;
}

beforeAll(async () => {
  const [jon, other, student] = await db
    .insert(schema.users)
    .values([
      {
        email: "EricksonJ@cadott.k12.wi.us",
        passwordHash: "x",
        role: "teacher",
        firstName: "Jon",
        lastName: "Erickson",
      },
      { email: "colleague@t", passwordHash: "x", role: "teacher", firstName: "Pat", lastName: "C" },
      { email: "2001@s", passwordHash: "x", role: "student", firstName: "Ava", lastName: "Adams" },
    ])
    .returning();
  Object.assign(ids, { jon: jon.id, other: other.id, student: student.id });
  const [course] = await db
    .insert(schema.courses)
    .values({
      ownerId: jon.id,
      name: "Physical Science A",
      relearningPathFrom: new Date(Date.now() - 86_400_000),
    })
    .returning();
  const [otherCourse] = await db
    .insert(schema.courses)
    .values({ ownerId: other.id, name: "Chemistry" })
    .returning();
  Object.assign(ids, { course: course.id, otherCourse: otherCourse.id });
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId: course.id, name: "Unit 3 · Bonding", sortOrder: 2 })
    .returning();
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, unitId: unit.id, code: "U3.LT1", title: "Formulas", sortOrder: 1 },
      { courseId: course.id, unitId: unit.id, code: "U3.LT2", title: "Ionic", sortOrder: 2 },
    ])
    .returning();
  const [otherLt] = await db
    .insert(schema.learningTargets)
    .values({ courseId: otherCourse.id, code: "C1", title: "Moles" })
    .returning();
  Object.assign(ids, { lt1: lt1.id, lt2: lt2.id, otherLt: otherLt.id });

  const applied = await applyPack(PACK);
  expect(applied).toMatchObject({ status: "applied", summary: { errors: [] } });
  const options = await db
    .select()
    .from(schema.relearningOptions)
    .where(eq(schema.relearningOptions.learningTargetId, lt1.id));
  ids.read = options.find((o) => o.mode === "read")!.id;
  ids.do = options.find((o) => o.mode === "do")!.id;

  // A quiz on U3.LT1 that Ava takes at 0/5, so her relearning opens once corrections are in.
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: jon.id, courseId: course.id, name: "U3 Quiz" })
    .returning();
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: jon.id,
      courseId: course.id,
      type: "formative",
      title: "Formulas quiz",
      isPublished: true,
    })
    .returning();
  const [sec] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: assessment.id, title: "U3.LT1", learningTargetId: lt1.id })
    .returning();
  const wrong: Record<string, string> = {};
  for (let i = 0; i < 5; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({ bankId: bank.id, ownerId: jon.id, type: "multiple_choice", stem: `Q${i}` })
      .returning();
    await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt1.id });
    const [, w] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    wrong[q.id] = w.id;
    await db
      .insert(schema.assessmentQuestions)
      .values({ sectionId: sec.id, questionId: q.id, sortOrder: i });
  }
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: jon.id, courseId: course.id, name: "PS 2nd", period: "2" })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: student.id });
  const [asg] = await db
    .insert(schema.assignments)
    .values({
      ownerId: jon.id,
      classId: cls.id,
      assessmentId: assessment.id,
      attemptsAllowed: 3,
      opensAt: new Date(Date.now() - 3 * 86_400_000),
    })
    .returning();
  ids.quiz = asg.id;

  as(student.id, "student");
  const { attemptId } = await ok(startAttempt(asg.id, null));
  await db.insert(schema.responses).values(
    Object.entries(wrong).map(([questionId, optionId]) => ({
      attemptId,
      questionId,
      answer: { kind: "choice" as const, optionId },
    }))
  );
  await finalizeAttempt(attemptId);
  const scope = (await getCorrectionScope(attemptId))!;
  for (const questionId of scope.needed)
    await ok(
      saveCorrection(attemptId, questionId, {
        correctAnswer: "Right",
        explanation:
          "I mixed up the subscript and the coefficient. The outside number multiplies everything.",
      })
    );
  await ok(submitCorrections(attemptId));
});

describe("saving an option", () => {
  it("lets the owner save: sections update in place and the option is marked edited", async () => {
    const before = await sectionsOf(ids.do);
    as(ids.jon, "teacher");
    const input = await edited(ids.do, (f) => {
      f.title = "Do: flip, then count";
      f.sections[0].cards.push({ id: "k6", front: "Parentheses", back: "A combo." });
      f.sections[1].steps[3].text = "Add them up: 3 + 12 + 1 + 4 = 20 atoms.";
    });
    expect(await ok(updateRelearningOption(ids.do, input))).toEqual({ optionId: ids.do });
    const after = await sectionsOf(ids.do);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(after[0].body).toMatchObject({ type: "flashcards" });
    expect(after[0].body.type === "flashcards" && after[0].body.cards.at(-1)).toEqual({
      id: "k6",
      front: "Parentheses",
      back: "A combo.",
    });
    // Checks and their ids (the progress keys) are kept as they were.
    expect(after[1].checks.map((c) => c.id)).toEqual(before[1].checks.map((c) => c.id));
    const o = await optionRow(ids.do);
    expect(o.title).toBe("Do: flip, then count");
    expect(o.editedAt).toBeInstanceOf(Date);
  });

  it("creates a Watch option with the video id, clip and pause times", async () => {
    as(ids.jon, "teacher");
    const { optionId } = await ok(
      createRelearningOption(ids.course, ids.lt2, "watch", {
        title: "Watch: ionic bonds",
        published: true,
        sections: [
          {
            part: "core",
            minutes: 4,
            body: { type: "video", youtubeId: "dQw4w9WgXcQ", startSeconds: 30, endSeconds: 210 },
            checks: [
              {
                id: "q1",
                kind: "multiple_choice",
                prompt: "What does sodium give away?",
                options: [
                  { id: "a", text: "An electron" },
                  { id: "b", text: "A proton" },
                ],
                answer: "a",
                atSeconds: 95,
              },
            ],
          },
        ],
      })
    );
    const o = await optionRow(optionId);
    expect(o).toMatchObject({ mode: "watch", learningTargetId: ids.lt2, isPublished: true });
    expect(o.editedAt).toBeInstanceOf(Date);
    const [core] = await sectionsOf(optionId);
    expect(core).toMatchObject({
      part: "core",
      estMinutes: 4,
      body: { type: "video", youtubeId: "dQw4w9WgXcQ", startSeconds: 30, endSeconds: 210 },
      checks: [{ id: "q1", atSeconds: 95, answer: "a" }],
    });
  });

  it("refuses another teacher, on the option and on the course", async () => {
    as(ids.other, "teacher");
    const input = await edited(ids.read, (f) => (f.title = "Mine now"));
    expect(await updateRelearningOption(ids.read, input)).toMatchObject({ ok: false, status: 403 });
    expect(await createRelearningOption(ids.course, ids.lt2, "do", input)).toMatchObject({
      ok: false,
      status: 403,
    });
    // Their own course, but Jon's target: not on that course.
    expect(await createRelearningOption(ids.otherCourse, ids.lt2, "do", input)).toMatchObject({
      ok: false,
      status: 404,
    });
    as(ids.student, "student");
    expect(await updateRelearningOption(ids.read, input)).toMatchObject({ ok: false, status: 403 });
    expect((await optionRow(ids.read)).title).toBe("Read: reading chemical formulas");
  });

  it("refuses an invalid option with its issue, writing nothing", async () => {
    as(ids.jon, "teacher");
    const r = await createRelearningOption(ids.course, ids.lt2, "do", {
      title: "Do: ionic",
      published: true,
      sections: [{ part: "core", body: { type: "video", youtubeId: "nope" } }],
    });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) {
      expect(r.error).toBe("Section 1: youtubeId must be an 11-character YouTube id");
      expect(r.fieldErrors?.option).toContain(
        "section 1: youtubeId must be an 11-character YouTube id"
      );
    }
    expect(
      await db.query.relearningOptions.findFirst({
        where: and(
          eq(schema.relearningOptions.learningTargetId, ids.lt2),
          eq(schema.relearningOptions.mode, "do")
        ),
      })
    ).toBeUndefined();

    const before = await sectionsOf(ids.read);
    const noCore = await edited(ids.read, (f) => {
      f.sections = f.sections.filter((s) => s.part !== "core");
    });
    const r2 = await updateRelearningOption(ids.read, noCore);
    expect(r2).toMatchObject({ ok: false, status: 400 });
    if (!r2.ok) expect(r2.error).toBe("Needs a core section");
    const badAnswer = await edited(ids.read, (f) => (f.sections[0].checks[0].answer = "z"));
    const r3 = await updateRelearningOption(ids.read, badAnswer);
    if (!r3.ok) expect(r3.error).toMatch(/check c1's answer isn't one of its options/);
    expect(r3.ok).toBe(false);
    expect(await sectionsOf(ids.read)).toEqual(before);
    expect(await updateRelearningOption(ids.read, "not an option")).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("a student partway through", () => {
  it("keeps their progress when the teacher edits the option they're on", async () => {
    as(ids.student, "student");
    await ok(startRelearning(ids.quiz, "read"));
    const view = (await getRelearningView(ids.quiz, ids.student, null))!;
    const row = view.bundle.rows[0];
    const [core, extension] = row.servedSectionIds;
    expect(await ok(answerRelearningCheck(row.id, core, "c1", "b"))).toMatchObject({
      correct: true,
    });
    await ok(markRelearningSection(row.id, core, { scrolledToEnd: true }));

    as(ids.jon, "teacher");
    const input = await edited(ids.read, (f) => {
      f.sections[0].text += "\n\n**One more example:** CO₂ has 1 C and 2 O.";
      f.sections[0].checks[1].prompt = "How many O atoms are in Ca(OH)₂? Type a number.";
      f.sections[1].checks.push({
        ...f.sections[1].checks[1],
        id: "e3",
        prompt: "How many atoms are in 3H₂O?",
        accepted: ["9", "nine"],
      });
    });
    await ok(updateRelearningOption(ids.read, input));
    const sections = await sectionsOf(ids.read);
    expect(sections.map((s) => s.id)).toEqual([core, extension]);

    // Her right answer and her reading still count, and the edited check grades as edited.
    as(ids.student, "student");
    const after = (await getRelearningView(ids.quiz, ids.student, null))!.bundle.rows[0];
    expect(after.servedSectionIds).toEqual([core, extension]);
    expect(after.progress.checks?.c1).toMatchObject({ correct: true });
    expect(after.progress.sections?.[core]).toMatchObject({ scrolledToEnd: true });
    expect(await ok(answerRelearningCheck(row.id, core, "c2", "2"))).toMatchObject({
      correct: true,
    });
    expect(await ok(answerRelearningCheck(row.id, extension, "e3", "nine"))).toMatchObject({
      correct: true,
    });
  });
});

describe("a later content-pack revision", () => {
  it("keeps the teacher's edits and still updates options they haven't edited", async () => {
    as(ids.jon, "teacher");
    const readTitle = "Read: chemical formulas, Jon's version";
    await ok(
      updateRelearningOption(ids.read, await edited(ids.read, (f) => (f.title = readTitle)))
    );
    const readBefore = await sectionsOf(ids.read);
    // The Do option was edited above too. The pack's Watch wasn't, and LT2's Read is new.
    const r3 = await applyPack({
      ...PACK,
      revision: (PACK.revision ?? 1) + 1,
      relearning: [
        ...PACK.relearning!.map((r) => ({ ...r, title: `${r.title} (pack r3)` })),
        {
          target: "U3.LT2",
          mode: "read" as const,
          title: "Read: ionic bonds (pack r3)",
          sections: [{ part: "core" as const, body: { type: "text" as const, text: "Ions." } }],
        },
      ],
    });
    expect(r3).toMatchObject({
      status: "applied",
      summary: {
        errors: [],
        relearning: {
          options: 2,
          kept: ["U3.LT1 read: kept teacher edits", "U3.LT1 do: kept teacher edits"],
        },
      },
    });
    expect((await optionRow(ids.read)).title).toBe(readTitle);
    expect((await optionRow(ids.do)).title).toBe("Do: flip, then count");
    expect(await sectionsOf(ids.read)).toEqual(readBefore);
    const watch = await db.query.relearningOptions.findFirst({
      where: and(
        eq(schema.relearningOptions.learningTargetId, ids.lt1),
        eq(schema.relearningOptions.mode, "watch")
      ),
    });
    expect(watch?.title).toMatch(/[(]pack r3[)]$/);
    const ionic = await db.query.relearningOptions.findFirst({
      where: and(
        eq(schema.relearningOptions.learningTargetId, ids.lt2),
        eq(schema.relearningOptions.mode, "read")
      ),
    });
    expect(ionic).toMatchObject({ title: "Read: ionic bonds (pack r3)", editedAt: null });
  });
});
