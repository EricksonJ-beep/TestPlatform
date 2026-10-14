/**
 * The student home rebuild's rules (Jon, Oct 14 2026; docs/student-home-plan.md build step 1).
 * Viola's two closed capped quizzes (40% and 50%, no corrections) said "Nothing needs your
 * attention" while the teacher's gradebook showed corrections owed. R1: a closed test keeps its
 * corrections states on the student's card. R2: "Retakes need my OK" no longer makes corrections
 * optional; asking waits for them. R3: before a quiz retake, every missed learning target is
 * practised to 80% (a built practice of 5+ questions on it, or a teacher's set tagged to it),
 * finished after the quiz; a target with no practice content doesn't block. The student card,
 * startAttempt, requestRetake, the class gradebook and the Needs you inbox all agree. In-memory
 * Postgres with the real migrations; the work is done through the real actions.
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
import { finalizeAttempt } from "@/lib/attempts";
import { tagLabel } from "@/lib/class-gradebook";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getClassGradebook } from "@/lib/queries/class-gradebook";
import { listRetakeRequests } from "@/lib/queries/dashboard";
import { getStudentPractice } from "@/lib/queries/practice";
import { listStudentResults } from "@/lib/queries/student-results";
import { buildStudentToDo } from "@/lib/student-home";
import { unlockNextAttempt } from "../app/results/actions";
import { requestRetake, startAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";
import {
  answerPractice,
  revealPractice,
  startBuiltPractice,
  startPractice,
} from "./practice/actions";

type Q = { id: string; right: string; wrong: string };
const ids = {
  teacher: "",
  viola: "",
  wes: "",
  xan: "",
  bio: "",
  ap: "",
  cls: "",
  lt: {} as Record<"lt1" | "lt2" | "lt3" | "ap1", string>,
  asg: {} as Record<"lt1Quiz" | "carbs" | "okQuiz" | "apQuiz", string>,
  quizQ: {} as Record<"lt1" | "lt2" | "lt3" | "ap1", Q[]>,
  practiceQ: new Map<string, Q>(),
  set: "",
  attempts: {} as Record<string, string>,
};
const FMT = { time: () => "2:15", date: () => "Oct 15" };
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed the two terms up on the quiz. The right one is the one that matches the definition in our notes.",
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
  text: RegExp
) => {
  const r = await p;
  expect(r).toMatchObject({ ok: false, status });
  if (!r.ok) expect(r.error).toMatch(text);
};
const card = async (studentId: string, key: keyof typeof ids.asg) =>
  (await listStudentAssignments(studentId)).find((a) => a.id === ids.asg[key])!;
const cell = async (studentId: string, key: keyof typeof ids.asg) => {
  const gb = (await getClassGradebook(ids.cls))!;
  return gb.rows
    .find((r) => r.student.id === studentId)!
    .cells.find((c) => c.assignmentId === ids.asg[key])!;
};
const label = async (studentId: string, key: keyof typeof ids.asg) =>
  tagLabel((await cell(studentId, key)).tag, FMT);
const setClosed = (key: keyof typeof ids.asg, closed: boolean) =>
  db
    .update(schema.assignments)
    .set({ closesAt: closed ? new Date(Date.now() - 3_600_000) : null })
    .where(eq(schema.assignments.id, ids.asg[key]));

/** Take a quiz: `right` says, per learning target, how many of its questions get the right option. */
async function take(
  studentId: string,
  key: keyof typeof ids.asg,
  right: Partial<Record<keyof typeof ids.quizQ, number>>
) {
  as(studentId, "student");
  const { attemptId } = await ok(startAttempt(ids.asg[key], null));
  const rows = Object.entries(right).flatMap(([lt, n]) =>
    ids.quizQ[lt as keyof typeof ids.quizQ].map((q, i) => ({
      attemptId,
      questionId: q.id,
      answer: { kind: "choice" as const, optionId: i < n! ? q.right : q.wrong },
    }))
  );
  await db.insert(schema.responses).values(rows);
  await finalizeAttempt(attemptId);
  return attemptId;
}
/** Correct every missed question and submit (approved at once: auto review). */
async function correct(studentId: string, attemptId: string) {
  as(studentId, "student");
  const missed = await db
    .select({ questionId: schema.responses.questionId })
    .from(schema.responses)
    .where(and(eq(schema.responses.attemptId, attemptId), eq(schema.responses.autoScore, 0)));
  for (const r of missed) await ok(saveCorrection(attemptId, r.questionId, WHY));
  expect((await ok(submitCorrections(attemptId))).state).toBe("approved");
}
/** Finish a practice: the first `right` served questions checked right, the rest revealed. */
async function finishPractice(studentId: string, attemptId: string, right: number) {
  as(studentId, "student");
  const attempt = (await db.query.practiceAttempts.findFirst({
    where: eq(schema.practiceAttempts.id, attemptId),
  }))!;
  for (const [i, s] of attempt.questionSet.entries()) {
    if (i < right) {
      const q = ids.practiceQ.get(s.questionId)!;
      await ok(answerPractice(attemptId, s.questionId, { kind: "choice", optionId: q.right }));
    } else await ok(revealPractice(attemptId, s.questionId));
  }
  const done = (await db.query.practiceAttempts.findFirst({
    where: eq(schema.practiceAttempts.id, attemptId),
  }))!;
  expect(done.completedAt).toBeInstanceOf(Date);
  return done;
}
/** Build my practice on one target (5 questions, the smallest size). */
async function build(studentId: string, courseId: string, targetId: string, right: number) {
  as(studentId, "student");
  const { attemptId } = await ok(startBuiltPractice({ courseId, targetIds: [targetId], count: 5 }));
  return finishPractice(studentId, attemptId, right);
}

beforeAll(async () => {
  const [t, viola, wes, xan] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "v@s", passwordHash: "x", role: "student", firstName: "Viola", lastName: "V" },
      { email: "w@s", passwordHash: "x", role: "student", firstName: "Wes", lastName: "W" },
      { email: "x@s", passwordHash: "x", role: "student", firstName: "Xan", lastName: "X" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, viola: viola.id, wes: wes.id, xan: xan.id });
  const [bio, ap] = await db
    .insert(schema.courses)
    .values([
      { ownerId: t.id, name: "Biology" },
      { ownerId: t.id, name: "Anatomy and Physiology", cvtcRules: true },
    ])
    .returning();
  Object.assign(ids, { bio: bio.id, ap: ap.id });
  const [unit] = await db
    .insert(schema.units)
    .values({ courseId: bio.id, name: "Unit 2", sortOrder: 2 })
    .returning();
  const [lt1, lt2, lt3, ap1] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: bio.id, unitId: unit.id, code: "U2.LT1", title: "Carbon", sortOrder: 1 },
      { courseId: bio.id, unitId: unit.id, code: "U2.LT2", title: "Sugars", sortOrder: 2 },
      { courseId: bio.id, unitId: unit.id, code: "U2.LT3", title: "Starch", sortOrder: 3 },
      { courseId: ap.id, code: "AP.LT1", title: "Tissues", sortOrder: 1 },
    ])
    .returning();
  ids.lt = { lt1: lt1.id, lt2: lt2.id, lt3: lt3.id, ap1: ap1.id };

  const [quizBank, practiceBank, apQuizBank, apPracticeBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t.id, courseId: bio.id, name: "U2 Quiz" },
      { ownerId: t.id, courseId: bio.id, name: "U2 Practice", openPractice: true },
      { ownerId: t.id, courseId: ap.id, name: "Tissue Quiz" },
      { ownerId: t.id, courseId: ap.id, name: "Tissue Practice", openPractice: true },
    ])
    .returning();
  async function mc(bankId: string, targetId: string, n: number, into: Q[] = []) {
    for (let i = 0; i < n; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({ bankId, ownerId: t.id, type: "multiple_choice", stem: `Q ${i}`, points: 1 })
        .returning();
      await db
        .insert(schema.questionTargets)
        .values({ questionId: q.id, learningTargetId: targetId });
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      const item = { id: q.id, right: right.id, wrong: wrong.id };
      into.push(item);
      ids.practiceQ.set(q.id, item);
    }
    return into;
  }
  ids.quizQ = { lt1: [], lt2: [], lt3: [], ap1: [] };
  for (const k of ["lt1", "lt2", "lt3"] as const) await mc(quizBank.id, ids.lt[k], 5, ids.quizQ[k]);
  await mc(apQuizBank.id, ap1.id, 5, ids.quizQ.ap1);
  // Practice content: open-practice questions on LT1 and LT2 (none on LT3), and AP.LT1.
  await mc(practiceBank.id, lt1.id, 6);
  const lt2Practice = await mc(practiceBank.id, lt2.id, 6);
  await mc(apPracticeBank.id, ap1.id, 5);
  // A teacher's practice set tagged to LT2, two questions: any size counts.
  const [set] = await db
    .insert(schema.practiceSets)
    .values({ ownerId: t.id, courseId: bio.id, title: "Sugar check", isPublished: true })
    .returning();
  ids.set = set.id;
  await db
    .insert(schema.practiceSetTargets)
    .values({ practiceSetId: set.id, learningTargetId: lt2.id });
  await db
    .insert(schema.practiceSetQuestions)
    .values(
      lt2Practice
        .slice(0, 2)
        .map((q, i) => ({ practiceSetId: set.id, questionId: q.id, sortOrder: i }))
    );

  const [cls, apCls] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t.id, courseId: bio.id, name: "Bio 4th", period: "4" },
      { ownerId: t.id, courseId: ap.id, name: "A&P 5th", period: "5" },
    ])
    .returning();
  ids.cls = cls.id;
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: viola.id },
    { classId: cls.id, studentId: wes.id },
    { classId: cls.id, studentId: xan.id },
    { classId: apCls.id, studentId: wes.id },
  ]);

  async function quiz(courseId: string, title: string, sections: [string, Q[]][]) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId, type: "formative", title, isPublished: true })
      .returning();
    for (const [i, [targetId, qs]] of sections.entries()) {
      const [sec] = await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: `S${i}`, sortOrder: i, learningTargetId: targetId })
        .returning();
      await db
        .insert(schema.assessmentQuestions)
        .values(qs.map((q, j) => ({ sectionId: sec.id, questionId: q.id, sortOrder: j })));
    }
    return a.id;
  }
  const opensAt = new Date(Date.now() - 3 * 86_400_000);
  const [lt1Quiz, carbs, okQuiz, apQuiz] = await db
    .insert(schema.assignments)
    .values([
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz(bio.id, "Unit 2 LT1 Quiz", [[lt1.id, ids.quizQ.lt1]]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz(bio.id, "Unit 2 Quiz: Carbohydrates", [
          [lt2.id, ids.quizQ.lt2],
          [lt3.id, ids.quizQ.lt3],
        ]),
        attemptsAllowed: 3,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: cls.id,
        assessmentId: await quiz(bio.id, "Unit 2 Sugar check-in", [[lt2.id, ids.quizQ.lt2]]),
        attemptsAllowed: 3,
        retakesNeedUnlock: true,
        opensAt,
      },
      {
        ownerId: t.id,
        classId: apCls.id,
        assessmentId: await quiz(ap.id, "Tissue quiz", [[ap1.id, ids.quizQ.ap1]]),
        attemptsAllowed: 3,
        opensAt,
      },
    ])
    .returning();
  ids.asg = { lt1Quiz: lt1Quiz.id, carbs: carbs.id, okQuiz: okQuiz.id, apQuiz: apQuiz.id };

  // Viola: 40% and 50% (LT2 2/5, LT3 3/5), no corrections; then both quizzes close.
  ids.attempts.violaLt1 = await take(viola.id, "lt1Quiz", { lt1: 2 });
  ids.attempts.violaCarbs = await take(viola.id, "carbs", { lt2: 2, lt3: 3 });
  await setClosed("lt1Quiz", true);
  await setClosed("carbs", true);
});

/** Every gradebook cell's card is exactly what the student's own home says (one shared rule). */
async function expectGradebookAgrees() {
  const gb = (await getClassGradebook(ids.cls))!;
  for (const row of gb.rows) {
    const cards = new Map((await listStudentAssignments(row.student.id)).map((c) => [c.id, c]));
    for (const c of row.cells) {
      const own = cards.get(c.assignmentId);
      const where = `${row.student.firstName} · ${c.assignmentId}`;
      if (!own) {
        expect([c.card, c.attemptsUsed], where).toEqual(["closed", 0]);
        continue;
      }
      expect(c.card, where).toBe(own.state);
      expect(c.cycle, where).toBe(own.cycle);
      expect(c.rule, where).toBe(own.correctionsRule);
      expect(c.quizPractice, where).toEqual(own.quizPractice);
    }
  }
}

describe("R1: Viola's closed quizzes keep their corrections", () => {
  it("both cards read Corrections needed, and the gradebook says the same", async () => {
    for (const key of ["lt1Quiz", "carbs"] as const)
      expect(await card(ids.viola, key)).toMatchObject({
        status: "closed",
        state: "corrections_needed",
        cycle: "corrections_needed",
        correctionsRule: "gate",
        corrections: { state: "needed" },
      });
    expect(await label(ids.viola, "lt1Quiz")).toBe("Corrections needed 0/3");
    expect(await label(ids.viola, "carbs")).toBe("Corrections needed 0/5");
    await expectGradebookAgrees();
    // Her home (build step 3): both are counted To do rows, in the rule's words, and the open
    // check-in she hasn't started counts too (decision 3).
    const list = buildStudentToDo({ assignments: await listStudentAssignments(ids.viola) });
    expect(list.headline).toBe("You have 3 things to do.");
    expect(list.todo.map((r) => [r.kind, r.title, r.why, r.progress?.label])).toEqual(
      expect.arrayContaining([
        [
          "corrections",
          "Unit 2 LT1 Quiz",
          "Correct 3 missed questions to raise your score from 40% to 80%.",
          "0 of 3 done",
        ],
        [
          "corrections",
          "Unit 2 Quiz: Carbohydrates",
          "Correct 5 missed questions to raise your score from 50% to 80%.",
          "0 of 5 done",
        ],
      ])
    );
    expect(list.todo.map((r) => r.kind)).toEqual(["corrections", "corrections", "start"]);
    // My results says the same, and a quiz's target chips carry their codes (not "?").
    const results = await listStudentResults(ids.viola, await listStudentAssignments(ids.viola));
    expect(results.find((r) => r.assignmentId === ids.asg.carbs)).toMatchObject({
      correctionsRule: "gate",
      correctionsWhy: "Correct 5 missed questions to raise your score from 50% to 80%.",
      targets: [
        { id: ids.lt.lt2, code: "U2.LT2", title: "Sugars", percent: 40 },
        { id: ids.lt.lt3, code: "U2.LT3", title: "Starch", percent: 60 },
      ],
    });
  });
});

describe("R3: practice on every missed target before a quiz retake", () => {
  it("after corrections: relearning with practice owed on the missed targets; LT3 has no practice content, so it doesn't block", async () => {
    await correct(ids.viola, ids.attempts.violaLt1);
    await correct(ids.viola, ids.attempts.violaCarbs);
    const lt1 = await card(ids.viola, "lt1Quiz");
    expect(lt1).toMatchObject({
      state: "closed", // R1 keeps only corrections over a close
      cycle: "relearning",
      final: { percent: 80, basis: "corrections_to_threshold" },
      quizPractice: [{ targetId: ids.lt.lt1, code: "U2.LT1", scored: 40, best: null, done: false }],
    });
    expect((await card(ids.viola, "carbs")).quizPractice).toEqual([
      {
        targetId: ids.lt.lt2,
        code: "U2.LT2",
        title: "Sugars",
        scored: 40,
        best: null,
        done: false,
      },
    ]);
    expect(await label(ids.viola, "lt1Quiz")).toBe("Relearning (needs: practice U2.LT1) · closed");
    expect(await label(ids.viola, "carbs")).toBe("Relearning (needs: practice U2.LT2) · closed");
    await expectGradebookAgrees();
    // Her home: corrections done lifted both to 80%, so practising toward asking for an optional
    // retake is a higher score, not a counted to-do (only the check-in is left); Build my practice
    // opens on each target.
    const home = buildStudentToDo({
      assignments: await listStudentAssignments(ids.viola),
      buildableTargetIds: new Set([ids.lt.lt1, ids.lt.lt2]),
    });
    expect(home.todo.map((r) => [r.kind, r.title])).toEqual([["start", "Unit 2 Sugar check-in"]]);
    expect(home.higher.map((r) => [r.kind, r.why, r.action])).toEqual(
      expect.arrayContaining([
        [
          "practice",
          "Practice U2.LT1: score 80% before you can ask to retake (you scored 40%).",
          expect.objectContaining({ href: `/student/practice/build?target=${ids.lt.lt1}` }),
        ],
        [
          "practice",
          "Practice U2.LT2: score 80% before you can ask to retake (you scored 40%).",
          expect.objectContaining({ href: `/student/practice/build?target=${ids.lt.lt2}` }),
        ],
      ])
    );
    // "Needed before your retake" on the Practice tab lists tests open to the student only.
    as(ids.viola, "student");
    expect(
      (await getStudentPractice(ids.viola, await listStudentAssignments(ids.viola))).quizNeeded
    ).toEqual([]);

    // Reopened, the card reads Relearning and startAttempt refuses, naming the target.
    await setClosed("lt1Quiz", false);
    try {
      expect((await card(ids.viola, "lt1Quiz")).state).toBe("relearning");
      expect(await label(ids.viola, "lt1Quiz")).toBe("Relearning (needs: practice U2.LT1)");
      // Open again: practice is a counted To do row, and the Practice tab lists the target.
      const open = buildStudentToDo({ assignments: await listStudentAssignments(ids.viola) });
      expect(open.headline).toBe("You have 2 things to do.");
      expect(open.todo.map((r) => [r.kind, r.why])).toEqual([
        ["practice", "Practice U2.LT1: score 80% to unlock your retake (you scored 40%)."],
        ["start", "Open now."],
      ]);
      const practice = await getStudentPractice(ids.viola, await listStudentAssignments(ids.viola));
      expect(practice.quizNeeded).toMatchObject([
        {
          assignmentId: ids.asg.lt1Quiz,
          targets: [{ id: ids.lt.lt1, code: "U2.LT1", scored: 40, best: null, sets: [] }],
        },
      ]);
      as(ids.viola, "student");
      await refused(startAttempt(ids.asg.lt1Quiz, null), 403, /^Practice U2\.LT1 first: score 80%/);
      await expectGradebookAgrees();
    } finally {
      await setClosed("lt1Quiz", true);
    }
  });

  it("a built practice counts at 80%+ with 5 questions on the target, finished after the quiz", async () => {
    // Finished before the quiz was submitted: doesn't count, even at 100%.
    const early = await build(ids.viola, ids.bio, ids.lt.lt1, 5);
    await db
      .update(schema.practiceAttempts)
      .set({ completedAt: new Date(Date.now() - 5 * 86_400_000) })
      .where(eq(schema.practiceAttempts.id, early.id));
    expect((await card(ids.viola, "lt1Quiz")).quizPractice[0]).toMatchObject({
      best: null,
      done: false,
    });
    // 60%: not yet, but it shows as the best so far.
    expect((await build(ids.viola, ids.bio, ids.lt.lt1, 3)).percent).toBe(60);
    expect((await card(ids.viola, "lt1Quiz")).quizPractice[0]).toMatchObject({
      best: 60,
      done: false,
    });
    expect((await card(ids.viola, "lt1Quiz")).cycle).toBe("relearning");
    // 80%: done. The closed quiz's retake is ready, so Viola may ask for it (R6): optional, since
    // corrections already lifted the quiz to 80%.
    expect((await build(ids.viola, ids.bio, ids.lt.lt1, 4)).percent).toBe(80);
    expect(await card(ids.viola, "lt1Quiz")).toMatchObject({
      state: "ask_to_retake",
      askCounts: false,
      cycle: "retake_available",
      quizPractice: [{ code: "U2.LT1", best: 80, done: true }],
    });
    expect(await label(ids.viola, "lt1Quiz")).toBe("Done");
    await setClosed("lt1Quiz", false);
    try {
      expect((await card(ids.viola, "lt1Quiz")).state).toBe("retake_available");
      expect(await label(ids.viola, "lt1Quiz")).toBe("Can retake");
      await expectGradebookAgrees();
    } finally {
      await setClosed("lt1Quiz", true);
    }
  });

  it("a teacher's practice set tagged to the target counts at any size", async () => {
    as(ids.viola, "student");
    const { attemptId } = await ok(startPractice(ids.set));
    const done = await finishPractice(ids.viola, attemptId, 2);
    expect(done.questionSet).toHaveLength(2);
    expect(await card(ids.viola, "carbs")).toMatchObject({
      cycle: "retake_available",
      quizPractice: [{ code: "U2.LT2", best: 100, done: true }],
    });
    await expectGradebookAgrees();
  });

  it("applies in a CVTC course too: no corrections there, practice still comes first", async () => {
    await take(ids.wes, "apQuiz", { ap1: 2 });
    expect(await card(ids.wes, "apQuiz")).toMatchObject({
      state: "relearning",
      correctionsRule: "none",
      corrections: null,
      quizPractice: [{ code: "AP.LT1", scored: 40, done: false }],
    });
    as(ids.wes, "student");
    await refused(startAttempt(ids.asg.apQuiz, null), 403, /Practice AP\.LT1 first/);
    // The A&P bank holds exactly 5 questions on the target: a 5-question build at 100%.
    await build(ids.wes, ids.ap, ids.lt.ap1, 5);
    expect((await card(ids.wes, "apQuiz")).state).toBe("retake_available");
    as(ids.wes, "student");
    expect((await ok(startAttempt(ids.asg.apQuiz, null))).resumed).toBe(false);
  });
});

describe('R2: with "Retakes need my OK", corrections (and practice) come before asking', () => {
  it("below 80: corrections owed, the request is refused until they're clear, then until practice is done", async () => {
    const attemptId = await take(ids.wes, "okQuiz", { lt2: 3 }); // 60%
    expect(await card(ids.wes, "okQuiz")).toMatchObject({
      state: "corrections_needed",
      correctionsRule: "gate",
      retakeRequested: false,
    });
    as(ids.wes, "student");
    await refused(
      requestRetake(ids.asg.okQuiz),
      403,
      /^Finish your corrections on attempt 1 first\.$/
    );
    await refused(startAttempt(ids.asg.okQuiz, null), 403, /unlock/);
    await correct(ids.wes, attemptId);
    expect((await card(ids.wes, "okQuiz")).state).toBe("relearning");
    as(ids.wes, "student");
    await refused(requestRetake(ids.asg.okQuiz), 403, /^Practice U2\.LT2 first/);
    await build(ids.wes, ids.bio, ids.lt.lt2, 4);
    expect((await card(ids.wes, "okQuiz")).state).toBe("awaiting_unlock");
    as(ids.wes, "student");
    expect(await ok(requestRetake(ids.asg.okQuiz))).toEqual({ attemptNumber: 2 });
    expect(await card(ids.wes, "okQuiz")).toMatchObject({
      state: "awaiting_unlock",
      retakeRequested: true,
    });
    expect(await label(ids.wes, "okQuiz")).toBe("Retake request");
    const row = (await listRetakeRequests(ids.teacher)).find((r) => r.studentId === ids.wes)!;
    expect(row).toMatchObject({ stale: null, blocker: null });
    await expectGradebookAgrees();
  });

  it("the inbox names a request's unfinished corrections, then its practice", async () => {
    // A request made before Oct 14 2026, when corrections were optional with the setting on.
    const attemptId = await take(ids.xan, "okQuiz", { lt2: 2 });
    await db.insert(schema.attemptUnlocks).values({
      assignmentId: ids.asg.okQuiz,
      studentId: ids.xan,
      attemptNumber: 2,
      requestedAt: new Date(),
    });
    const inbox = async () =>
      (await listRetakeRequests(ids.teacher)).find((r) => r.studentId === ids.xan)!;
    expect(await inbox()).toMatchObject({ stale: null, blocker: { reason: "corrections" } });
    await correct(ids.xan, attemptId);
    expect(await inbox()).toMatchObject({
      stale: null,
      blocker: { reason: "practice", codes: ["U2.LT2"] },
    });
    // Approved anyway: the student still owes their part, and the card and the cell say so.
    as(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.asg.okQuiz, ids.xan));
    expect((await card(ids.xan, "okQuiz")).state).toBe("relearning");
    expect(await label(ids.xan, "okQuiz")).toBe("Relearning (needs: practice U2.LT2)");
    expect((await cell(ids.xan, "okQuiz")).unlock).toMatchObject({ state: "unlocked" });
    as(ids.xan, "student");
    await refused(startAttempt(ids.asg.okQuiz, null), 403, /^Practice U2\.LT2 first/);
    await expectGradebookAgrees();
  });
});
