/**
 * The relearning path end to end (docs/relearning-revamp-plan.md, ticket R2), in-memory Postgres
 * with the real migrations and the real student actions. On a switched-on course: a quiz at 40%
 * (corrections raise nothing, the path raises to 80, a retake goes higher), a mixed quiz (LT1
 * required, LT2 optional: corrections scope, 90, the stitched path to 100), and a test with two
 * targets below the line (per-target gates, the retake locked until both pass). The student card,
 * the class gradebook, the final score and startAttempt agree at every step. A course switched on
 * after attempt 1 and a CVTC course keep the v2 rules. Relearning and practice-check rows are
 * written directly here; their own actions come with R3 and R4.
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
import { finalizeAttempt, recomputeFinalScore } from "@/lib/attempts";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { getCorrectionScope, getCorrectionsSummary } from "@/lib/queries/corrections";
import { getPathState } from "@/lib/queries/relearning-path";
import { getRelearningMonitor, getTierBoard } from "@/lib/queries/tiers";
import { getGradebook } from "@/lib/queries/results";
import { loadScoreTrails, trailKey } from "@/lib/queries/score-trail";
import { listStudentResults } from "@/lib/queries/student-results";
import { seedScoreHistory } from "@/lib/score-history";
import { buildStudentToDo } from "@/lib/student-home";
import { retakeChoice } from "@/lib/retakes";
import {
  chooseRetakeScope,
  keepMyScore,
  requestRetake,
  setQuizCorrectionsOptIn,
  setRetakeOptIn,
  startAttempt,
} from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

type Q = { id: string; right: string; wrong: string };
type Lt = "lt1" | "lt2" | "lt3" | "lt4" | "bio1" | "ap1";
type Asg = "quiz" | "mixed" | "test" | "bioQuiz" | "apQuiz";
const ids = {
  teacher: "",
  ava: "",
  ben: "",
  cal: "",
  dee: "",
  eve: "",
  fay: "",
  gus: "",
  cls: "",
  lt: {} as Record<Lt, string>,
  q: {} as Record<Lt, Q[]>,
  asg: {} as Record<Asg, string>,
};
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed up the two kinds of bonds on the quiz. The right answer matches the definition in our notes.",
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
  text: RegExp
) => {
  const r = await p;
  expect(r).toMatchObject({ ok: false, status: 403 });
  if (!r.ok) expect(r.error).toMatch(text);
};
const card = async (studentId: string, key: Asg) =>
  (await listStudentAssignments(studentId)).find((a) => a.id === ids.asg[key])!;
const cell = async (studentId: string, key: Asg) => {
  const gb = (await getClassGradebook(ids.cls))!;
  return gb.rows
    .find((r) => r.student.id === studentId)!
    .cells.find((c) => c.assignmentId === ids.asg[key])!;
};
const final = async (studentId: string, key: Asg) =>
  (await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, ids.asg[key]),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  }))!;
/** The student's card and the teacher's gradebook cell show the same cycle and score. */
async function agree(studentId: string, key: Asg) {
  const [c, g] = await Promise.all([card(studentId, key), cell(studentId, key)]);
  expect(g.cycle).toBe(c.cycle);
  expect(g.score?.percent).toBe(c.final?.percent);
  return c;
}

/** Take a quiz or test: per target, how many of its questions get the right option. */
async function take(studentId: string, key: Asg, right: Partial<Record<Lt, number>>) {
  as(studentId, "student");
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
/** Correct every question in scope that isn't turned in yet, and submit (auto review: approved). */
async function correct(studentId: string, attemptId: string) {
  as(studentId, "student");
  const scope = (await getCorrectionScope(attemptId))!;
  const done = await db
    .select({ questionId: schema.corrections.questionId })
    .from(schema.corrections)
    .where(eq(schema.corrections.attemptId, attemptId));
  const have = new Set(done.map((d) => d.questionId));
  for (const questionId of scope.needed.filter((q) => !have.has(q)))
    await ok(saveCorrection(attemptId, questionId, WHY));
  expect((await ok(submitCorrections(attemptId))).state).toBe("approved");
}
/** A finished relearning bundle on these targets (R4 writes these). */
async function relearn(studentId: string, key: Asg, targets: Lt[], added: Lt[] = []) {
  const bundleId = crypto.randomUUID();
  await db.insert(schema.relearningPaths).values(
    targets.map((t) => ({
      assignmentId: ids.asg[key],
      studentId,
      learningTargetId: ids.lt[t],
      bundleId,
      mode: "read" as const,
      added: added.includes(t),
      finishedAt: new Date(),
    }))
  );
  await recomputeFinalScore(ids.asg[key], studentId);
  return bundleId;
}
/** A passed practice check on a bundle (R3 writes these). */
async function passCheck(studentId: string, key: Asg, targets: Lt[], bundleId: string) {
  await db.insert(schema.practiceChecks).values({
    assignmentId: ids.asg[key],
    studentId,
    purpose: "path",
    targetIds: targets.map((t) => ids.lt[t]),
    relearningBundleId: bundleId,
    passMark: 4,
    passedAt: new Date(),
  });
  await recomputeFinalScore(ids.asg[key], studentId);
}

beforeAll(async () => {
  const [t, ava, ben, cal, dee, eve, fay, gus] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "1001@s", passwordHash: "x", role: "student", firstName: "Ava", lastName: "A" },
      { email: "1002@s", passwordHash: "x", role: "student", firstName: "Ben", lastName: "B" },
      { email: "1003@s", passwordHash: "x", role: "student", firstName: "Cal", lastName: "C" },
      { email: "1004@s", passwordHash: "x", role: "student", firstName: "Dee", lastName: "D" },
      { email: "1005@s", passwordHash: "x", role: "student", firstName: "Eve", lastName: "E" },
      { email: "1006@s", passwordHash: "x", role: "student", firstName: "Fay", lastName: "F" },
      { email: "1007@s", passwordHash: "x", role: "student", firstName: "Gus", lastName: "G" },
    ])
    .returning();
  Object.assign(ids, {
    teacher: t.id,
    ava: ava.id,
    ben: ben.id,
    cal: cal.id,
    dee: dee.id,
    eve: eve.id,
    fay: fay.id,
    gus: gus.id,
  });
  const day = 86_400_000;
  const [ps, bio, ap] = await db
    .insert(schema.courses)
    .values([
      // Switched on yesterday: everything taken today is on the path.
      { ownerId: t.id, name: "Physical Science", relearningPathFrom: new Date(Date.now() - day) },
      // Switches on next month: today's attempt 1 is from before it, so the v2 rules stand.
      { ownerId: t.id, name: "Biology", relearningPathFrom: new Date(Date.now() + 30 * day) },
      // CVTC rules win even with a switch set.
      {
        ownerId: t.id,
        name: "Anatomy and Physiology",
        cvtcRules: true,
        relearningPathFrom: new Date(Date.now() - day),
      },
    ])
    .returning();
  const targets = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: ps.id, code: "U3.LT1", title: "Ionic", sortOrder: 1 },
      { courseId: ps.id, code: "U3.LT2", title: "Covalent", sortOrder: 2 },
      { courseId: ps.id, code: "U3.LT3", title: "Metallic", sortOrder: 3 },
      { courseId: ps.id, code: "U3.LT4", title: "Naming", sortOrder: 4 },
      { courseId: bio.id, code: "U2.LT1", title: "Carbon", sortOrder: 1 },
      { courseId: ap.id, code: "AP.LT1", title: "Tissues", sortOrder: 1 },
    ])
    .returning();
  const keys: Lt[] = ["lt1", "lt2", "lt3", "lt4", "bio1", "ap1"];
  ids.lt = Object.fromEntries(keys.map((k, i) => [k, targets[i].id])) as Record<Lt, string>;
  const [psBank, bioBank, apBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t.id, courseId: ps.id, name: "U3 Quiz" },
      { ownerId: t.id, courseId: bio.id, name: "U2 Quiz" },
      { ownerId: t.id, courseId: ap.id, name: "Tissue Quiz" },
    ])
    .returning();
  ids.q = { lt1: [], lt2: [], lt3: [], lt4: [], bio1: [], ap1: [] };
  for (const k of keys) {
    const bank = k === "bio1" ? bioBank : k === "ap1" ? apBank : psBank;
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
  const [cls, bioCls, apCls] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t.id, courseId: ps.id, name: "PS 2nd", period: "2" },
      { ownerId: t.id, courseId: bio.id, name: "Bio 4th", period: "4" },
      { ownerId: t.id, courseId: ap.id, name: "A&P 5th", period: "5" },
    ])
    .returning();
  ids.cls = cls.id;
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: ava.id },
    { classId: cls.id, studentId: ben.id },
    { classId: cls.id, studentId: cal.id },
    { classId: cls.id, studentId: fay.id },
    { classId: cls.id, studentId: gus.id },
    { classId: bioCls.id, studentId: dee.id },
    { classId: apCls.id, studentId: eve.id },
  ]);
  async function assessment(
    courseId: string,
    type: "formative" | "summative",
    title: string,
    sections: Lt[]
  ) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId, type, title, isPublished: true })
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
  const opensAt = new Date(Date.now() - 3 * day);
  const rows = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment(ps.id, "formative", "8.1 Ionic quiz", ["lt1"]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment(ps.id, "formative", "Bonding quiz", ["lt1", "lt2"]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await assessment(ps.id, "summative", "Unit 3 Test", [
          "lt1",
          "lt2",
          "lt3",
          "lt4",
        ]),
        attemptsAllowed: 2,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: bioCls.id,
        assessmentId: await assessment(bio.id, "formative", "Carbon quiz", ["bio1"]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: apCls.id,
        assessmentId: await assessment(ap.id, "formative", "Tissue quiz", ["ap1"]),
        attemptsAllowed: 3,
        opensAt,
      },
    ])
    .returning();
  const asgKeys: Asg[] = ["quiz", "mixed", "test", "bioQuiz", "apQuiz"];
  ids.asg = Object.fromEntries(asgKeys.map((k, i) => [k, rows[i].id])) as Record<Asg, string>;
});

describe("a quiz at 40% on the path (Q1, Q5)", () => {
  let first = "";

  it("owes corrections first; corrections alone raise nothing", async () => {
    first = await take(ids.ava, "quiz", { lt1: 2 });
    let c = await agree(ids.ava, "quiz");
    expect(c.path).toBeTruthy();
    expect(c.cycle).toBe("corrections_needed");
    expect(c.final?.percent).toBe(40);
    await refused(startAttempt(ids.asg.quiz, null), /Finish your corrections on U3\.LT1 first/);

    await correct(ids.ava, first);
    c = await agree(ids.ava, "quiz");
    expect(c.final).toMatchObject({ percent: 40, basis: "best_attempt" });
    expect(c.cycle).toBe("relearning");
    await refused(startAttempt(ids.asg.quiz, null), /Do your relearning on U3\.LT1 first/);
  });

  it("raises to 80 once the relearning and the practice check are done", async () => {
    const bundle = await relearn(ids.ava, "quiz", ["lt1"]);
    expect((await agree(ids.ava, "quiz")).cycle).toBe("relearning");
    await refused(
      startAttempt(ids.asg.quiz, null),
      /Pass the practice check on U3\.LT1 first: 4 of 5 right/
    );

    await passCheck(ids.ava, "quiz", ["lt1"], bundle);
    expect(await final(ids.ava, "quiz")).toMatchObject({ percent: 80, basis: "relearning_path" });
    const c = await agree(ids.ava, "quiz");
    expect(c.cycle).toBe("retake_available");
    expect(c.state).toBe("retake_available");
    expect(c.kept).toBe(false);
    // The to-do row comes from the step path (R5): optional, its mini path, keep or retake.
    const row = buildStudentToDo({ assignments: [c] }).higher.find(
      (r) => r.assignmentId === ids.asg.quiz
    )!;
    expect(row).toMatchObject({
      group: "higher",
      kind: "retake",
      why: "You earned 80%. Keep it, or retake the quiz to go higher. Your highest score counts.",
      action: { kind: "link", label: "Keep or retake" },
    });
    expect(row.path?.[0].steps.map((x) => x.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
    // Each done step carries the date it was finished (approved, finished, passed).
    const doneAt = (await getPathState(ids.asg.quiz, ids.ava))!.state.targets.find(
      (t) => t.id === ids.lt.lt1
    )!.doneAt;
    for (const at of [doneAt.corrections, doneAt.relearn, doneAt.practice])
      expect(Date.now() - at!.getTime()).toBeLessThan(60_000);
    expect(row.path?.[0].steps.slice(0, 3).every((x) => x.note?.startsWith("Done "))).toBe(true);
  });

  it("Keep my 80%: done for now, and the retake stays open (decision 28)", async () => {
    as(ids.ava, "student");
    expect(await ok(keepMyScore(ids.asg.quiz))).toEqual({ kept: true });
    const c = await card(ids.ava, "quiz");
    expect(c).toMatchObject({ kept: true, state: "retake_available" });
    // Done for now: off the to-do list; the card still offers the retake.
    const todo = buildStudentToDo({ assignments: [c] });
    expect(
      [...todo.todo, ...todo.higher, ...todo.waiting].some((r) => r.assignmentId === ids.asg.quiz)
    ).toBe(false);
    // A student partway through the path can't keep anything yet.
    as(ids.ben, "student");
    expect(await keepMyScore(ids.asg.quiz)).toMatchObject({ ok: false, status: 409 });
  });

  it("lets a retake take it higher, with no new corrections (40 → 80 → 100)", async () => {
    const second = await take(ids.ava, "quiz", { lt1: 5 });
    expect(await final(ids.ava, "quiz")).toMatchObject({ percent: 100, basis: "retake" });
    expect((await getCorrectionsSummary(second))!.state).toBe("none");
    const c = await agree(ids.ava, "quiz");
    expect(c.cycle).toBe("done");
    // The keep was before this attempt, so it no longer counts.
    expect(c.kept).toBe(false);
  });
});

describe("a mixed quiz: LT1 at 40%, LT2 at 80% (decision 31)", () => {
  let first = "";

  it("scopes corrections to LT1 until the student opts into LT2", async () => {
    first = await take(ids.ben, "mixed", { lt1: 2, lt2: 4 });
    const summary = (await getCorrectionsSummary(first))!;
    expect(summary.needed).toBe(3);
    await correct(ids.ben, first);
    expect((await agree(ids.ben, "mixed")).cycle).toBe("relearning");
  });

  it("raises LT2 to 90 with its own corrections once opted in", async () => {
    as(ids.ben, "student");
    // LT1 is required, not optional: it can't be "added".
    expect(await setQuizCorrectionsOptIn(ids.asg.mixed, ids.lt.lt1, true)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await ok(setQuizCorrectionsOptIn(ids.asg.mixed, ids.lt.lt2, true))).toEqual({
      optedIn: true,
    });
    expect((await getCorrectionsSummary(first))!.needed).toBe(4);
    await correct(ids.ben, first);
    // LT1 2 of 5 + LT2 at 90% (4.5 of 5) = 6.5 of 10.
    expect(await final(ids.ben, "mixed")).toMatchObject({
      percent: 65,
      basis: "corrections_to_90",
    });
    // Its corrections are in, so the opt-in stays.
    as(ids.ben, "student");
    expect(await setQuizCorrectionsOptIn(ids.asg.mixed, ids.lt.lt2, false)).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("stitches LT2 into LT1's path: passing lifts LT1 to 80 and LT2 to 100", async () => {
    const bundle = await relearn(ids.ben, "mixed", ["lt1", "lt2"], ["lt2"]);
    await passCheck(ids.ben, "mixed", ["lt1", "lt2"], bundle);
    const f = await final(ids.ben, "mixed");
    expect(f).toMatchObject({ percent: 90, basis: "relearning_path" });
    expect(f.perTarget[ids.lt.lt1].percent).toBe(80);
    expect(f.perTarget[ids.lt.lt2].percent).toBe(100);
    expect((await agree(ids.ben, "mixed")).cycle).toBe("retake_available");
  });

  it("keeps the path open after the quiz closes, then offers Ask to retake", async () => {
    await db
      .update(schema.assignments)
      .set({ closesAt: new Date(Date.now() - 3_600_000) })
      .where(eq(schema.assignments.id, ids.asg.mixed));
    const c = await agree(ids.ben, "mixed");
    expect(c.state).toBe("ask_to_retake");
    as(ids.ben, "student");
    expect((await ok(requestRetake(ids.asg.mixed))).attemptNumber).toBe(2);
  });
});

describe("a test with LT2 and LT4 below the line (S1–S6)", () => {
  let first = "";
  const bundles: Partial<Record<Lt, string>> = {};

  it("owes corrections on LT2 and LT4 only, then relearning on each", async () => {
    first = await take(ids.cal, "test", { lt1: 5, lt2: 3, lt3: 4, lt4: 3 });
    expect((await getCorrectionsSummary(first))!.needed).toBe(4);
    expect(await final(ids.cal, "test")).toMatchObject({ percent: 75, basis: "per_target" });
    await correct(ids.cal, first);
    const c = await agree(ids.cal, "test");
    expect(c.cycle).toBe("relearning");
    await refused(
      startAttempt(ids.asg.test, null),
      /Do your relearning on U3\.LT2 and U3\.LT4 first/
    );
  });

  it("keeps the retake locked until both targets pass their checks; no partial credit", async () => {
    bundles.lt2 = await relearn(ids.cal, "test", ["lt2"]);
    await passCheck(ids.cal, "test", ["lt2"], bundles.lt2);
    bundles.lt4 = await relearn(ids.cal, "test", ["lt4"]);
    const gates = await db
      .select()
      .from(schema.retakeGates)
      .where(
        and(
          eq(schema.retakeGates.assignmentId, ids.asg.test),
          eq(schema.retakeGates.studentId, ids.cal)
        )
      );
    const gate = (lt: Lt) => gates.find((g) => g.learningTargetId === ids.lt[lt])!;
    expect(gate("lt2")).toMatchObject({ correctionsOk: true, activityOk: true, practiceOk: true });
    expect(gate("lt4")).toMatchObject({ correctionsOk: true, activityOk: true, practiceOk: false });
    expect((await agree(ids.cal, "test")).cycle).toBe("relearning");
    await refused(startAttempt(ids.asg.test, null), /Pass the practice check on U3\.LT4 first/);
    expect((await final(ids.cal, "test")).percent).toBe(75);

    // The tier board and the monitor use the path's words (R5): LT2 done, LT4 owes its check.
    const board = (await getTierBoard(ids.asg.test))!;
    const cardRow = board.cards.find((c) => c.studentId === ids.cal)!;
    expect(cardRow.stageLabel).toBe("Relearning (U3.LT4: practice check)");
    expect(cardRow.readiness).toMatchObject({ [ids.lt.lt2]: "ready", [ids.lt.lt4]: "not_ready" });
    const monitor = (await getRelearningMonitor(ids.asg.test, ids.cal))!;
    const line = (lt: Lt) => monitor.targets.find((t) => t.id === ids.lt[lt])!.line;
    expect(line("lt2")).toMatch(
      /^U3\.LT2: corrections ✓.* · relearn ✓ · practice check ✓ · retake/
    );
    expect(line("lt4")).toMatch(
      /^U3\.LT4: corrections ✓.* · relearn ✓ · practice check ✗ · retake locked$/
    );

    await passCheck(ids.cal, "test", ["lt4"], bundles.lt4);
    const c = await agree(ids.cal, "test");
    expect(c.cycle).toBe("retake_required");
    expect((await final(ids.cal, "test")).percent).toBe(75);
  });

  it("serves the retake on the required targets", async () => {
    as(ids.cal, "student");
    const { attemptId } = await ok(startAttempt(ids.asg.test, null));
    const attempt = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, attemptId),
    }))!;
    expect([...(attempt.scope ?? [])].sort()).toEqual([ids.lt.lt2, ids.lt.lt4].sort());
  });
});

describe("the test retake picker: Full test or Custom (R6, S3)", () => {
  /** Attempt 1 at LT1 100, LT2 60, LT3 80, LT4 60; then corrections, relearning and a check on LT2 and LT4. */
  async function readyForRetake(studentId: string) {
    const first = await take(studentId, "test", { lt1: 5, lt2: 3, lt3: 4, lt4: 3 });
    await correct(studentId, first);
    for (const lt of ["lt2", "lt4"] as Lt[]) {
      const bundleId = await relearn(studentId, "test", [lt]);
      await passCheck(studentId, "test", [lt], bundleId);
    }
    return first;
  }
  /** The retake's scope, and the targets its questions came from. */
  async function served(attemptId: string) {
    const attempt = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, attemptId),
    }))!;
    const ltOf = new Map<string, Lt>();
    for (const lt of ["lt1", "lt2", "lt3", "lt4"] as Lt[])
      for (const q of ids.q[lt]) ltOf.set(q.id, lt);
    return {
      scope: [...(attempt.scope ?? [])].sort(),
      targets: [...new Set(attempt.questionSet.map((q) => ltOf.get(q.questionId)))].sort(),
    };
  }
  const idsOf = (lts: Lt[]) => lts.map((lt) => ids.lt[lt]).sort();

  it("Custom: LT2 and LT4 are locked in; an added LT3 needs its corrections, then the retake serves LT2, LT3 and LT4", async () => {
    const first = await readyForRetake(ids.fay);
    let c = await card(ids.fay, "test");
    expect(c.cycle).toBe("retake_required");
    expect(c.retake!.plan).toMatchObject({
      required: [ids.lt.lt2, ids.lt.lt4],
      canStart: true,
    });
    expect(retakeChoice(c.retake!.plan)).toBe("custom");

    as(ids.fay, "student");
    await ok(setRetakeOptIn(ids.asg.test, ids.lt.lt3, true));
    expect((await getCorrectionsSummary(first))!.needed).toBe(5);
    c = await card(ids.fay, "test");
    expect([...c.retake!.plan.selected].sort()).toEqual(idsOf(["lt2", "lt3", "lt4"]));
    expect(retakeChoice(c.retake!.plan)).toBe("custom");
    // Corrections only: no relearning or practice check for a target already at 80% (decision 29).
    await refused(startAttempt(ids.asg.test, null), /Finish your corrections on U3\.LT3 first/);

    await correct(ids.fay, first);
    const { attemptId } = await ok(startAttempt(ids.asg.test, null));
    expect(await served(attemptId)).toEqual({
      scope: idsOf(["lt2", "lt3", "lt4"]),
      targets: ["lt2", "lt3", "lt4"],
    });
  });

  it("Full test: every target in, corrections on every missed question first, then the whole test", async () => {
    const first = await readyForRetake(ids.gus);
    as(ids.gus, "student");
    expect(await ok(chooseRetakeScope(ids.asg.test, "full"))).toEqual({ choice: "full" });
    let c = await card(ids.gus, "test");
    expect(retakeChoice(c.retake!.plan)).toBe("full");
    expect([...c.retake!.plan.selected].sort()).toEqual(idsOf(["lt1", "lt2", "lt3", "lt4"]));
    // LT1 was 100%, so nothing to correct there; LT3's missed question is owed.
    expect((await getCorrectionsSummary(first))!.needed).toBe(5);
    await refused(startAttempt(ids.asg.test, null), /Finish your corrections on U3\.LT3 first/);

    // Custom starts again from the required targets.
    expect(await ok(chooseRetakeScope(ids.asg.test, "custom"))).toEqual({ choice: "custom" });
    c = await card(ids.gus, "test");
    expect([...c.retake!.plan.selected].sort()).toEqual(idsOf(["lt2", "lt4"]));
    expect((await getCorrectionsSummary(first))!.needed).toBe(4);

    await ok(chooseRetakeScope(ids.asg.test, "full"));
    await correct(ids.gus, first);
    const { attemptId } = await ok(startAttempt(ids.asg.test, null));
    expect(await served(attemptId)).toEqual({
      scope: idsOf(["lt1", "lt2", "lt3", "lt4"]),
      targets: ["lt1", "lt2", "lt3", "lt4"],
    });
    // The choice holds while the retake is open.
    expect(await chooseRetakeScope(ids.asg.test, "custom")).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});

describe("courses not on the path keep the v2 rules", () => {
  it("a course switched on after attempt 1: corrections lift to 80 under the cap", async () => {
    const first = await take(ids.dee, "bioQuiz", { bio1: 2 });
    expect(await getPathState(ids.asg.bioQuiz, ids.dee)).toBeNull();
    await correct(ids.dee, first);
    expect(await final(ids.dee, "bioQuiz")).toMatchObject({
      percent: 80,
      basis: "corrections_to_threshold",
    });
  });

  it("a CVTC course: no corrections and no path, even with a switch set", async () => {
    await take(ids.eve, "apQuiz", { ap1: 2 });
    expect(await getPathState(ids.asg.apQuiz, ids.eve)).toBeNull();
    const c = await card(ids.eve, "apQuiz");
    expect(c.corrections).toBeNull();
    expect(c.path).toBeNull();
    expect(await final(ids.eve, "apQuiz")).toMatchObject({ percent: 40, basis: "best_attempt" });
  });
});

describe("the score trail (R7)", () => {
  it("records each change to the counting score: 40 → 80 (path) → 100 (retake)", async () => {
    const trails = await loadScoreTrails([{ assignmentId: ids.asg.quiz, studentId: ids.ava }]);
    const steps = trails.get(trailKey(ids.asg.quiz, ids.ava))!;
    expect(steps.map((s) => [s.percent, s.label])).toEqual([
      [40, "attempt 1"],
      [80, "relearning path"],
      [100, "retake"],
    ]);
    const cell = await (async () => {
      const gb = (await getClassGradebook(ids.cls))!;
      return gb.rows
        .find((r) => r.student.id === ids.ava)!
        .cells.find((c) => c.assignmentId === ids.asg.quiz)!;
    })();
    expect(cell.trail?.map((s) => s.percent)).toEqual([40, 80, 100]);
    // The same trail in the results table and on the student's My results.
    const row = (await getGradebook(ids.asg.quiz)).find((r) => r.studentId === ids.ava)!;
    expect(row.trail?.map((s) => s.label)).toEqual(["attempt 1", "relearning path", "retake"]);
    const mine = await listStudentResults(ids.ava, await listStudentAssignments(ids.ava));
    expect(mine.find((r) => r.assignmentId === ids.asg.quiz)?.trail?.map((s) => s.percent)).toEqual(
      [40, 80, 100]
    );
  });

  it("seeds a starting point for scores from before R7, once", async () => {
    // A score with no history, as every score had before R7 shipped.
    await db
      .delete(schema.scoreHistory)
      .where(
        and(
          eq(schema.scoreHistory.assignmentId, ids.asg.bioQuiz),
          eq(schema.scoreHistory.studentId, ids.dee)
        )
      );
    expect(await seedScoreHistory()).toBeGreaterThan(0);
    expect(await seedScoreHistory()).toBe(0);
    const steps = (
      await loadScoreTrails([{ assignmentId: ids.asg.bioQuiz, studentId: ids.dee }])
    ).get(trailKey(ids.asg.bioQuiz, ids.dee))!;
    expect(steps.map((s) => [s.percent, s.label])).toEqual([
      [40, "attempt 1"],
      [80, "corrections"],
    ]);
  });
});
