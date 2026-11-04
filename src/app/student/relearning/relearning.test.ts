/**
 * Read · Watch · Do end to end (docs/relearning-revamp-plan.md A1–A6, Q3, S2; ticket R4), on an
 * in-memory Postgres with the real migrations and the real actions. One target serves core +
 * extension and finishes on the A3 credit rules, opening the practice check; a quiz on two
 * targets stitches their cores, and adding or removing an 80% target re-serves the bundle; modes
 * switch until finished (A4); a test target with nothing built waits for the teacher's check-off
 * (A5); a video that won't play is flagged and resolved (A6); nobody works on another's row.
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

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { QuickCheck, RelearningSectionBody } from "@/db/schema";
import { finalizeAttempt } from "@/lib/attempts";
import { getCorrectionScope } from "@/lib/queries/corrections";
import { getNeedsYou } from "@/lib/queries/dashboard";
import { getPathState } from "@/lib/queries/relearning-path";
import { nextCheck } from "@/lib/relearning-path";
import { getRelearningView } from "@/lib/relearning-server";
import { checkOffRelearning, resolveVideoFlag } from "@/app/app/results/actions";
import { startAttempt } from "../actions";
import { saveCorrection, submitCorrections } from "../corrections/actions";
import {
  answerRelearningCheck,
  flagRelearningVideo,
  markRelearningSection,
  saveRelearningShortAnswer,
  setRelearningTargetAdded,
  startRelearning,
} from "./actions";

type Lt = "lt1" | "lt2" | "lt3";
type Asg = "quiz" | "mixed" | "test";
type Student = "amy" | "bo" | "cy" | "eli";
const ids = {
  teacher: "",
  st: {} as Record<Student, string>,
  lt: {} as Record<Lt, string>,
  q: {} as Record<Lt, { id: string; right: string; wrong: string }[]>,
  asg: {} as Record<Asg, string>,
  /** Section ids by option ("lt1-read") and part. */
  sec: {} as Record<string, { core: string; extension: string }>,
};
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed up the subscript and the coefficient. The outside number multiplies everything inside.",
};

const as = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const refused = async (
  p: Promise<{ ok: true } | { ok: false; status: number; error: string }>,
  status: number,
  text?: RegExp
) => {
  const r = await p;
  expect(r).toMatchObject({ ok: false, status });
  if (!r.ok && text) expect(r.error).toMatch(text);
};

async function take(student: Student, key: Asg, right: Partial<Record<Lt, number>>) {
  as(ids.st[student], "student");
  const { attemptId } = await ok(startAttempt(ids.asg[key], null));
  const attempt = (await db.query.attempts.findFirst({
    where: eq(schema.attempts.id, attemptId),
  }))!;
  const served = new Set(attempt.questionSet.map((s) => s.questionId));
  const rows = Object.entries(right).flatMap(([lt, n]) =>
    ids.q[lt as Lt]
      .filter((q) => served.has(q.id))
      .map((q, i) => ({
        attemptId,
        questionId: q.id,
        answer: { kind: "choice" as const, optionId: i < n! ? q.right : q.wrong },
      }))
  );
  await db.insert(schema.responses).values(rows);
  await finalizeAttempt(attemptId);
  return attemptId;
}
async function correct(student: Student, attemptId: string) {
  as(ids.st[student], "student");
  const scope = (await getCorrectionScope(attemptId))!;
  for (const questionId of scope.needed) await ok(saveCorrection(attemptId, questionId, WHY));
  await ok(submitCorrections(attemptId));
}
const rowsOf = (student: Student, key: Asg) =>
  db
    .select()
    .from(schema.relearningPaths)
    .where(
      and(
        eq(schema.relearningPaths.assignmentId, ids.asg[key]),
        eq(schema.relearningPaths.studentId, ids.st[student])
      )
    );
const rowFor = async (student: Student, key: Asg, lt: Lt) =>
  (await rowsOf(student, key)).find((r) => r.learningTargetId === ids.lt[lt])!;

const mc = (id: string, extra: Partial<QuickCheck> = {}): QuickCheck => ({
  id,
  kind: "multiple_choice",
  prompt: `Question ${id}`,
  options: [
    { id: "a", text: "Wrong" },
    { id: "b", text: "Right" },
  ],
  answer: "b",
  explanation: `Because ${id}.`,
  ...extra,
});

beforeAll(async () => {
  const [t, amy, bo, cy, eli] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "2001@s", passwordHash: "x", role: "student", firstName: "Amy", lastName: "A" },
      { email: "2002@s", passwordHash: "x", role: "student", firstName: "Bo", lastName: "B" },
      { email: "2003@s", passwordHash: "x", role: "student", firstName: "Cy", lastName: "C" },
      { email: "2004@s", passwordHash: "x", role: "student", firstName: "Eli", lastName: "E" },
    ])
    .returning();
  ids.teacher = t.id;
  ids.st = { amy: amy.id, bo: bo.id, cy: cy.id, eli: eli.id };
  const [ps] = await db
    .insert(schema.courses)
    .values({
      ownerId: t.id,
      name: "Physical Science",
      relearningPathFrom: new Date(Date.now() - 86_400_000),
    })
    .returning();
  const targets = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: ps.id, code: "U3.LT1", title: "Formulas", sortOrder: 1 },
      { courseId: ps.id, code: "U3.LT2", title: "Ionic", sortOrder: 2 },
      { courseId: ps.id, code: "U3.LT3", title: "Naming", sortOrder: 3 },
    ])
    .returning();
  ids.lt = { lt1: targets[0].id, lt2: targets[1].id, lt3: targets[2].id };
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: ps.id, name: "U3 Quiz" })
    .returning();
  ids.q = { lt1: [], lt2: [], lt3: [] };
  for (const k of ["lt1", "lt2", "lt3"] as Lt[]) {
    for (let i = 0; i < 5; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: bank.id,
          ownerId: t.id,
          type: "multiple_choice",
          stem: `${k} ${i}`,
          points: 1,
        })
        .returning();
      await db
        .insert(schema.questionTargets)
        .values({ questionId: q.id, learningTargetId: ids.lt[k] });
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      ids.q[k].push({ id: q.id, right: right.id, wrong: wrong.id });
    }
  }
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: ps.id, name: "PS 2nd", period: "2" })
    .returning();
  await db
    .insert(schema.enrollments)
    .values([amy, bo, cy, eli].map((s) => ({ classId: cls.id, studentId: s.id })));
  async function assessment(type: "formative" | "summative", title: string, sections: Lt[]) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId: ps.id, type, title, isPublished: true })
      .returning();
    for (const [i, lt] of sections.entries()) {
      const [sec] = await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: lt, sortOrder: i, learningTargetId: ids.lt[lt] })
        .returning();
      await db
        .insert(schema.assessmentQuestions)
        .values(ids.q[lt].map((q, j) => ({ sectionId: sec.id, questionId: q.id, sortOrder: j })));
    }
    return a.id;
  }
  const opensAt = new Date(Date.now() - 3 * 86_400_000);
  const rows = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment("formative", "Formulas quiz", ["lt1"]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment("formative", "Bonding quiz", ["lt1", "lt2"]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment("summative", "Unit 3 test", ["lt1", "lt3"]),
        attemptsAllowed: 2,
        opensAt,
      },
    ])
    .returning();
  ids.asg = { quiz: rows[0].id, mixed: rows[1].id, test: rows[2].id };

  // LT1: all three modes, each a core and an extension. LT2: Read only. LT3: nothing built.
  async function option(
    lt: Lt,
    mode: "read" | "watch" | "do",
    core: { body: RelearningSectionBody; checks: QuickCheck[] },
    extension: { body: RelearningSectionBody; checks: QuickCheck[]; shortAnswerPrompt?: string }
  ) {
    const [o] = await db
      .insert(schema.relearningOptions)
      .values({
        ownerId: t.id,
        learningTargetId: ids.lt[lt],
        mode,
        title: `${mode} ${lt}`,
        isPublished: true,
      })
      .returning();
    const [c, e] = await db
      .insert(schema.relearningSections)
      .values([
        { optionId: o.id, part: "core", sortOrder: 0, estMinutes: 4, ...core },
        { optionId: o.id, part: "extension", sortOrder: 0, estMinutes: 6, ...extension },
      ])
      .returning();
    ids.sec[`${lt}-${mode}`] = { core: c.id, extension: e.id };
  }
  const text = (text: string): RelearningSectionBody => ({ type: "text", text });
  await option(
    "lt1",
    "read",
    { body: text("Core"), checks: [mc("r1")] },
    {
      body: text("More"),
      checks: [mc("r2")],
      shortAnswerPrompt: "Explain the 2 in 2H₂O.",
    }
  );
  await option(
    "lt1",
    "watch",
    { body: { type: "video", youtubeId: "abcdefghijk" }, checks: [mc("w1", { atSeconds: 30 })] },
    { body: { type: "video", youtubeId: "bcdefghijkl" }, checks: [] }
  );
  await option(
    "lt1",
    "do",
    {
      body: { type: "flashcards", cards: [{ id: "k1", front: "Subscript", back: "Small number" }] },
      checks: [mc("d1")],
    },
    {
      body: { type: "worked_steps", problem: "Ba(OH)₂", steps: [{ id: "s1", text: "List" }] },
      checks: [mc("d2", { afterStepId: "s1" })],
    }
  );
  await option(
    "lt2",
    "read",
    { body: text("Ionic core"), checks: [] },
    { body: text("Ionic more"), checks: [] }
  );
});

describe("one target: core + extension, credit, and the practice check after (A2, A3)", () => {
  let rowId = "";
  it("offers Read, Watch and Do with their minutes and serves core then extension", async () => {
    await correct("amy", await take("amy", "quiz", { lt1: 2 }));
    const view = (await getRelearningView(ids.asg.quiz, ids.st.amy, null))!;
    expect(view.bundle).toMatchObject({ bundleId: null, open: true, targetIds: [ids.lt.lt1] });
    expect(view.choices.map((c) => [c.mode, c.minutes])).toEqual([
      ["read", 10],
      ["watch", 10],
      ["do", 10],
    ]);
    as(ids.st.amy, "student");
    const { bundleId } = await ok(startRelearning(ids.asg.quiz, "read"));
    const row = await rowFor("amy", "quiz", "lt1");
    expect(row).toMatchObject({ bundleId, mode: "read", finishedAt: null });
    expect(row.servedSectionIds).toEqual([ids.sec["lt1-read"].core, ids.sec["lt1-read"].extension]);
    rowId = row.id;
  });

  it("grades quick checks with unlimited tries, the explanation only once right", async () => {
    as(ids.st.amy, "student");
    const sec = ids.sec["lt1-read"].core;
    expect(await ok(answerRelearningCheck(rowId, sec, "r1", "a"))).toMatchObject({
      correct: false,
      explanation: null,
      rowFinished: false,
    });
    expect(await ok(answerRelearningCheck(rowId, sec, "r1", "b"))).toMatchObject({
      correct: true,
      explanation: "Because r1.",
    });
    // A later wrong try never undoes a right answer.
    await ok(answerRelearningCheck(rowId, sec, "r1", "a"));
    expect((await rowFor("amy", "quiz", "lt1")).progress.checks?.r1).toMatchObject({
      correct: true,
      tries: 3,
    });
    await ok(markRelearningSection(rowId, sec, { scrolledToEnd: true }));
    // A section the row didn't serve is refused.
    await refused(answerRelearningCheck(rowId, ids.sec["lt1-watch"].core, "w1", "b"), 404);
  });

  it("switches modes until finished, keeping what was done (A4)", async () => {
    as(ids.st.amy, "student");
    expect(await ok(startRelearning(ids.asg.quiz, "do"))).toMatchObject({ switched: true });
    expect((await rowFor("amy", "quiz", "lt1")).servedSectionIds).toEqual([
      ids.sec["lt1-do"].core,
      ids.sec["lt1-do"].extension,
    ]);
    await ok(startRelearning(ids.asg.quiz, "read"));
    const row = await rowFor("amy", "quiz", "lt1");
    expect(row.mode).toBe("read");
    expect(row.progress.sections?.[ids.sec["lt1-read"].core]).toMatchObject({
      scrolledToEnd: true,
    });
  });

  it("finishes on the extension's check, reading and short answer, and opens the check", async () => {
    as(ids.st.amy, "student");
    const ext = ids.sec["lt1-read"].extension;
    await ok(answerRelearningCheck(rowId, ext, "r2", "b"));
    await ok(markRelearningSection(rowId, ext, { scrolledToEnd: true }));
    expect(await ok(saveRelearningShortAnswer(rowId, ext, "Too short"))).toMatchObject({
      rowFinished: false,
    });
    expect(
      await ok(saveRelearningShortAnswer(rowId, ext, "The 2 in front doubles every atom."))
    ).toEqual({ rowFinished: true, bundleFinished: true });
    const path = (await getPathState(ids.asg.quiz, ids.st.amy))!;
    expect(path.state.targets[0]).toMatchObject({ relearn: "done", practice: "current" });
    expect(nextCheck(path.state)).toMatchObject({ kind: "path", targetIds: [ids.lt.lt1] });
    await refused(startRelearning(ids.asg.quiz, "watch"), 409, /finished/);
  });

  it("lets nobody else work on the row", async () => {
    as(ids.st.eli, "student");
    await refused(answerRelearningCheck(rowId, ids.sec["lt1-read"].core, "r1", "b"), 404);
    as(ids.teacher, "teacher");
    await refused(
      markRelearningSection(rowId, ids.sec["lt1-read"].core, { scrolledToEnd: true }),
      403
    );
  });
});

describe("a quiz on two targets stitches their cores (Q3)", () => {
  it("adds the 80% target as it starts, cores only, and re-serves when it's taken out", async () => {
    await correct("bo", await take("bo", "mixed", { lt1: 2, lt2: 4 }));
    const view = (await getRelearningView(ids.asg.mixed, ids.st.bo, null))!;
    expect(view.bundle).toMatchObject({ targetIds: [ids.lt.lt1], addable: [ids.lt.lt2] });
    as(ids.st.bo, "student");
    const { bundleId } = await ok(startRelearning(ids.asg.mixed, "read", { add: [ids.lt.lt2] }));
    const rows = await rowsOf("bo", "mixed");
    expect(rows.every((r) => r.bundleId === bundleId)).toBe(true);
    expect((await rowFor("bo", "mixed", "lt1")).servedSectionIds).toEqual([
      ids.sec["lt1-read"].core,
    ]);
    expect(await rowFor("bo", "mixed", "lt2")).toMatchObject({
      added: true,
      servedSectionIds: [ids.sec["lt2-read"].core],
    });
    // LT2's missed question comes into corrections scope (Q2: corrections → 90).
    const gate = await db.query.retakeGates.findFirst({
      where: and(
        eq(schema.retakeGates.assignmentId, ids.asg.mixed),
        eq(schema.retakeGates.studentId, ids.st.bo),
        eq(schema.retakeGates.learningTargetId, ids.lt.lt2)
      ),
    });
    expect(gate?.optedIn).toBe(true);

    await ok(setRelearningTargetAdded(ids.asg.mixed, ids.lt.lt2, false));
    expect((await rowsOf("bo", "mixed")).map((r) => r.learningTargetId)).toEqual([ids.lt.lt1]);
    expect((await rowFor("bo", "mixed", "lt1")).servedSectionIds).toEqual([
      ids.sec["lt1-read"].core,
      ids.sec["lt1-read"].extension,
    ]);
    await ok(setRelearningTargetAdded(ids.asg.mixed, ids.lt.lt2, true));
    expect((await rowFor("bo", "mixed", "lt1")).servedSectionIds).toEqual([
      ids.sec["lt1-read"].core,
    ]);
    expect((await rowFor("bo", "mixed", "lt2")).bundleId).toBe(bundleId);
  });
});

describe("a test: one target at a time; nothing built waits for the teacher (S2, A5)", () => {
  it("refuses a target with nothing built until the teacher checks it off", async () => {
    await correct("cy", await take("cy", "test", { lt1: 2, lt3: 2 }));
    const view = (await getRelearningView(ids.asg.test, ids.st.cy, ids.lt.lt3))!;
    expect(view.bundle.targetIds).toEqual([ids.lt.lt3]);
    expect(view.choices).toEqual([]);
    expect(view.unbuilt).toEqual([ids.lt.lt3]);
    as(ids.st.cy, "student");
    await refused(
      startRelearning(ids.asg.test, "read", { targetId: ids.lt.lt3 }),
      409,
      /teacher will give you/
    );
    as(ids.teacher, "teacher");
    expect(await ok(checkOffRelearning(ids.asg.test, ids.st.cy, ids.lt.lt3))).toEqual({
      checkedOff: 1,
    });
    expect(await rowFor("cy", "test", "lt3")).toMatchObject({
      mode: null,
      checkedOffBy: ids.teacher,
    });
    const path = (await getPathState(ids.asg.test, ids.st.cy))!;
    const lt3 = path.state.targets.find((t) => t.id === ids.lt.lt3)!;
    expect(lt3).toMatchObject({ relearn: "done", practice: "current" });
    // LT1 is untouched: it relearns on its own.
    expect(path.state.targets.find((t) => t.id === ids.lt.lt1)!.relearn).toBe("current");
  });

  it("flags a video that won't play for Needs you, and lets the student switch (A6)", async () => {
    as(ids.st.cy, "student");
    await ok(startRelearning(ids.asg.test, "watch", { targetId: ids.lt.lt1 }));
    const row = await rowFor("cy", "test", "lt1");
    expect(row.servedSectionIds).toEqual([
      ids.sec["lt1-watch"].core,
      ids.sec["lt1-watch"].extension,
    ]);
    const video = ids.sec["lt1-watch"].core;
    await ok(flagRelearningVideo(row.id, video, "150"));
    await ok(flagRelearningVideo(row.id, video, "150"));
    const flag = await db.query.relearningVideoFlags.findFirst({
      where: eq(schema.relearningVideoFlags.sectionId, video),
    });
    expect(flag).toMatchObject({ hits: 2, errorCode: "150", resolvedAt: null });
    // It lands in the teacher's Needs you, one row for the video.
    expect((await getNeedsYou(ids.teacher)).videos).toEqual([
      expect.objectContaining({
        sectionId: video,
        targetCode: "U3.LT1",
        youtubeId: "abcdefghijk",
        students: 1,
        hits: 2,
        errorCodes: ["150"],
      }),
    ]);
    expect(await ok(startRelearning(ids.asg.test, "read", { targetId: ids.lt.lt1 }))).toMatchObject(
      { switched: true }
    );
    // A reading isn't a video.
    await refused(flagRelearningVideo(row.id, ids.sec["lt1-read"].core, null), 400);
    // Only the teacher who owns the video resolves its flags.
    await refused(resolveVideoFlag(video), 403);
    as(ids.teacher, "teacher");
    expect(await ok(resolveVideoFlag(video))).toEqual({ resolved: 1 });
    expect((await getNeedsYou(ids.teacher)).videos).toEqual([]);
  });
});
