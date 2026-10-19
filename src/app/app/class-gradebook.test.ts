/**
 * The class gradebook loader (Jon, Oct 13 2026, docs/dashboard-plan.md build step 3): one shared
 * "who owes what" rule, so every cell's card state is exactly what that student's own card says,
 * the teacher's tag on top (precedence, closed tests, the inbox's moves), column footers, and a
 * batched read: a handful of queries whatever the class size, and no writes. In-memory Postgres
 * with the real migrations; the work is done through the real actions where there is one.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema, client } = await createTestDb();
  return { db, schema, dbDriver: "pg", testClient: client };
});

import { and, eq } from "drizzle-orm";
import * as dbModule from "@/db";
import { db, schema } from "@/db";
import { tagLabel } from "@/lib/class-gradebook";
import { finalizeAttempt } from "@/lib/attempts";
import { recomputeGatesForStudent } from "@/lib/gates";
import { listStudentAssignments, type StudentAssignment } from "@/lib/queries/assignments";
import { getClassGradebook, type ClassGradebook } from "@/lib/queries/class-gradebook";
import { getNeedsYou } from "@/lib/queries/dashboard";
import { getStudentPractice } from "@/lib/queries/practice";
import { buildStudentToDo } from "@/lib/student-home";
import { askToFinish, finishLater, requestRetake, startAttempt } from "../student/actions";
import { saveCorrection, submitCorrections } from "../student/corrections/actions";
import { approveCorrections } from "./results/corrections/actions";
import { unlockNextAttempt } from "./results/actions";

type Q = { id: string; right: string; wrong: string };
const ids = {
  teacher: "",
  cls: "",
  otherCls: "",
  outsider: "",
  students: {} as Record<string, string>,
  asg: {} as Record<string, string>,
  otherAsg: "",
  bioQ: [] as Q[],
  apQ: [] as Q[],
  testQ: [] as Q[],
  lt3Q: [] as Q[],
  essay: "",
  activity: "",
};
const NAMES = ["Ava", "Ben", "Cal", "Dee", "Eli", "Fay", "Gus", "Hal"] as const;
type Name = (typeof NAMES)[number];
const st = (n: Name) => ids.students[n];

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
const WHY = {
  correctAnswer: "Right",
  explanation:
    "I mixed the two terms up on the quiz. The right one is the one that matches the definition in our notes.",
};

/** Start as the student and answer: `right` says which questions (by index) get the right option. */
async function start(name: Name, asg: string) {
  as(st(name), "student");
  return (await ok(startAttempt(ids.asg[asg], null))).attemptId;
}
async function answer(attemptId: string, questions: Q[], right: (i: number) => boolean) {
  await db.insert(schema.responses).values(
    questions.map((q, i) => ({
      attemptId,
      questionId: q.id,
      answer: { kind: "choice" as const, optionId: right(i) ? q.right : q.wrong },
    }))
  );
}
async function take(name: Name, asg: string, questions: Q[], right: (i: number) => boolean) {
  const attemptId = await start(name, asg);
  await answer(attemptId, questions, right);
  await finalizeAttempt(attemptId);
  return attemptId;
}
/** Correct every missed question in scope and submit the set (approved at once in auto review). */
async function correct(name: Name, attemptId: string) {
  as(st(name), "student");
  const missed = await db
    .select({ questionId: schema.responses.questionId })
    .from(schema.responses)
    .where(and(eq(schema.responses.attemptId, attemptId), eq(schema.responses.autoScore, 0)));
  for (const r of missed) {
    const saved = await saveCorrection(attemptId, r.questionId, WHY);
    if (!saved.ok && saved.status !== 400) throw new Error(saved.error);
  }
  return ok(submitCorrections(attemptId));
}
async function approve(attemptId: string) {
  as(ids.teacher, "teacher");
  await ok(approveCorrections(attemptId));
}

beforeAll(async () => {
  const users = await db
    .insert(schema.users)
    .values([
      {
        email: "t@t",
        passwordHash: "x",
        role: "teacher" as const,
        firstName: "Jon",
        lastName: "E",
      },
      ...[...NAMES, "Zed"].map((n, i) => ({
        email: `${n.toLowerCase()}@s`,
        passwordHash: "x",
        role: "student" as const,
        firstName: n,
        lastName: `${String.fromCharCode(65 + i)}${n.toLowerCase()}`,
      })),
    ])
    .returning();
  ids.teacher = users[0].id;
  NAMES.forEach((n, i) => (ids.students[n] = users[i + 1].id));
  ids.outsider = users.at(-1)!.id;
  const t = ids.teacher;

  const [bio, ap] = await db
    .insert(schema.courses)
    .values([
      { ownerId: t, name: "Biology" },
      { ownerId: t, name: "Anatomy and Physiology", cvtcRules: true },
    ])
    .returning();
  const [lt1, lt2, lt3] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: bio.id, code: "LT1", title: "Cells", sortOrder: 1 },
      { courseId: bio.id, code: "LT2", title: "Membranes", sortOrder: 2 },
      { courseId: bio.id, code: "LT3", title: "Mitosis", sortOrder: 3 },
    ])
    .returning();
  const [bioBank, apBank] = await db
    .insert(schema.questionBanks)
    .values([
      { ownerId: t, courseId: bio.id, name: "Bio bank" },
      { ownerId: t, courseId: ap.id, name: "A&P bank" },
    ])
    .returning();
  async function mc(bankId: string, stem: string, list: Q[], n: number) {
    for (let i = 0; i < n; i++) {
      const [q] = await db
        .insert(schema.questions)
        .values({ bankId, ownerId: t, type: "multiple_choice", stem: `${stem} ${i}`, points: 1 })
        .returning();
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
        ])
        .returning();
      list.push({ id: q.id, right: right.id, wrong: wrong.id });
    }
  }
  await mc(bioBank.id, "Bio", ids.bioQ, 5);
  await mc(bioBank.id, "Test", ids.testQ, 4);
  await mc(bioBank.id, "Mitosis", ids.lt3Q, 2);
  await mc(apBank.id, "Skin", ids.apQ, 5);
  const [essay] = await db
    .insert(schema.questions)
    .values({
      bankId: bioBank.id,
      ownerId: t,
      type: "short_answer",
      grading: "manual",
      stem: "Explain osmosis",
      points: 2,
    })
    .returning();
  ids.essay = essay.id;

  const [cls, otherCls] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t, courseId: bio.id, name: "Bio 2nd", period: "2", term: "Fall 2026" },
      { ownerId: t, courseId: bio.id, name: "Bio 6th", period: "6", term: "Fall 2026" },
    ])
    .returning();
  Object.assign(ids, { cls: cls.id, otherCls: otherCls.id });
  await db
    .insert(schema.enrollments)
    .values([
      ...NAMES.map((n) => ({ classId: cls.id, studentId: st(n) })),
      { classId: otherCls.id, studentId: ids.outsider },
    ]);

  /** An assessment with one section per entry: [target, questions]. */
  async function assess(
    courseId: string,
    type: "formative" | "summative",
    title: string,
    sections: [string | null, { id: string }[]][]
  ) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t, courseId, type, title, isPublished: true })
      .returning();
    for (const [i, [learningTargetId, questions]] of sections.entries()) {
      const [sec] = await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: `S${i}`, sortOrder: i, learningTargetId })
        .returning();
      await db
        .insert(schema.assessmentQuestions)
        .values(questions.map((q, j) => ({ sectionId: sec.id, questionId: q.id, sortOrder: j })));
    }
    return a.id;
  }
  const quizA = await assess(bio.id, "formative", "Cell quiz", [[null, ids.bioQ]]);
  const day = 86_400_000;
  const at = (days: number) => new Date(Date.now() + days * day);
  type Settings = Omit<typeof schema.assignments.$inferInsert, "ownerId" | "classId">;
  const rows: [string, Settings][] = [
    ["quiz", { assessmentId: quizA, attemptsAllowed: 3, opensAt: at(-6) }],
    [
      "okQuiz",
      {
        assessmentId: await assess(bio.id, "formative", "Osmosis quiz", [[null, ids.bioQ]]),
        attemptsAllowed: 3,
        retakesNeedUnlock: true,
        retakeWaitHours: 24,
        opensAt: at(-5),
      },
    ],
    [
      "test",
      {
        assessmentId: await assess(bio.id, "summative", "Unit 3 test", [
          [lt1.id, ids.testQ.slice(0, 2)],
          [lt2.id, ids.testQ.slice(2)],
        ]),
        attemptsAllowed: 2,
        reviewMode: "teacher_approved",
        opensAt: at(-4),
      },
    ],
    [
      "closedQuiz",
      {
        assessmentId: await assess(bio.id, "formative", "Mitosis quiz", [[null, ids.bioQ]]),
        attemptsAllowed: 3,
        opensAt: at(-9),
      },
    ],
    [
      "closedTest",
      {
        assessmentId: await assess(bio.id, "summative", "Unit 2 test", [[lt3.id, ids.lt3Q]]),
        attemptsAllowed: 2,
        opensAt: at(-8),
      },
    ],
    [
      "apQuiz",
      {
        // An A&P quiz on this period: its course's CVTC rules go with it.
        assessmentId: await assess(ap.id, "formative", "Skin quiz", [[null, ids.apQ]]),
        attemptsAllowed: 3,
        opensAt: at(-3),
      },
    ],
    [
      "essayQuiz",
      {
        assessmentId: await assess(bio.id, "formative", "Lab write-up", [[null, [essay]]]),
        attemptsAllowed: 3,
        opensAt: at(-2),
      },
    ],
    [
      "later",
      {
        assessmentId: await assess(bio.id, "formative", "Unit 4 quiz", [[null, ids.bioQ]]),
        opensAt: at(2),
      },
    ],
  ];
  const created = await db
    .insert(schema.assignments)
    .values(rows.map(([, v]) => ({ ownerId: t, classId: cls.id, ...v })))
    .returning();
  rows.forEach(([key], i) => (ids.asg[key] = created[i].id));
  const [other] = await db
    .insert(schema.assignments)
    .values({ ownerId: t, classId: otherCls.id, assessmentId: quizA, attemptsAllowed: 3 })
    .returning();
  ids.otherAsg = other.id;

  // Relearning content: an activity on LT1 that needs the teacher's check-off, practice on LT2.
  const [act] = await db
    .insert(schema.relearningActivities)
    .values({
      ownerId: t,
      courseId: bio.id,
      kind: "link",
      title: "Cell model",
      url: "https://example.com",
      requiresTeacherVerification: true,
      isPublished: true,
    })
    .returning();
  ids.activity = act.id;
  await db.insert(schema.activityTargets).values({ activityId: act.id, learningTargetId: lt1.id });
  const [set] = await db
    .insert(schema.practiceSets)
    .values({ ownerId: t, courseId: bio.id, title: "Membrane practice", isPublished: true })
    .returning();
  await db
    .insert(schema.practiceSetTargets)
    .values({ practiceSetId: set.id, learningTargetId: lt2.id });

  const all = () => true;
  const firstN = (n: number) => (i: number) => i < n;

  // Cell quiz (capped formative, auto review).
  await take("Ava", "quiz", ids.bioQ, firstN(4)); // 80%: corrections → 100%
  const benQuiz = await take("Ben", "quiz", ids.bioQ, firstN(2)); // 40%: one draft saved
  as(st("Ben"), "student");
  const benMissed = ids.bioQ[4].id;
  await ok(saveCorrection(benQuiz, benMissed, WHY));
  await take("Fay", "quiz", ids.bioQ, all);
  await correct("Gus", await take("Gus", "quiz", ids.bioQ, firstN(2))); // lifted to 80
  const calLive = await start("Cal", "quiz");
  await answer(calLive, ids.bioQ.slice(0, 2), all);
  await db
    .update(schema.attempts)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.attempts.id, calLive));
  const deeLive = await start("Dee", "quiz");
  await ok(finishLater(deeLive));
  await ok(askToFinish(deeLive));
  const eliLive = await start("Eli", "quiz");
  await db
    .update(schema.attempts)
    .set({ lastActiveAt: new Date(Date.now() - 15 * 60_000) })
    .where(eq(schema.attempts.id, eliLive)); // idle: paused, though nothing has written it yet

  // Osmosis quiz ("Retakes need my OK", a day's wait). Corrections come before asking, exactly as
  // without the setting (Jon, Oct 14 2026, decision 4): Ben hasn't done his.
  await correct("Ava", await take("Ava", "okQuiz", ids.bioQ, firstN(3)));
  as(st("Ava"), "student");
  await ok(requestRetake(ids.asg.okQuiz));
  await take("Ben", "okQuiz", ids.bioQ, firstN(3));
  await correct("Cal", await take("Cal", "okQuiz", ids.bioQ, firstN(3)));
  as(ids.teacher, "teacher");
  await ok(unlockNextAttempt(ids.asg.okQuiz, st("Cal")));
  await correct("Dee", await take("Dee", "okQuiz", ids.bioQ, firstN(3)));

  // Unit 3 test (summative, teacher-approved corrections). LT1 = questions 0-1, LT2 = 2-3.
  const lt1Wrong = (i: number) => i >= 2;
  const lt2Wrong = (i: number) => i < 2;
  await take("Ava", "test", ids.testQ, all);
  await take("Ben", "test", ids.testQ, lt1Wrong);
  await correct("Cal", await take("Cal", "test", ids.testQ, lt1Wrong)); // waits for approval
  const deeTest = await take("Dee", "test", ids.testQ, lt1Wrong);
  await correct("Dee", deeTest);
  await approve(deeTest);
  const eliTest = await take("Eli", "test", ids.testQ, lt2Wrong);
  await correct("Eli", eliTest);
  await approve(eliTest);
  const gusTest = await take("Gus", "test", ids.testQ, lt1Wrong);
  await correct("Gus", gusTest);
  await approve(gusTest);
  // Dee's activity is checked off; Gus's waits for the teacher.
  await db.insert(schema.activityCompletions).values([
    { studentId: st("Dee"), activityId: act.id, teacherVerified: true },
    { studentId: st("Gus"), activityId: act.id },
  ]);
  await recomputeGatesForStudent(st("Dee"));
  await recomputeGatesForStudent(st("Gus"));
  // Ava moved up a tier this week.
  await db
    .update(schema.assignmentFinalScores)
    .set({ previousTier: 2, tierChangedAt: new Date() })
    .where(
      and(
        eq(schema.assignmentFinalScores.assignmentId, ids.asg.test),
        eq(schema.assignmentFinalScores.studentId, st("Ava"))
      )
    );

  // Mitosis quiz and Unit 2 test, taken while open and then closed.
  await take("Ava", "closedQuiz", ids.bioQ, firstN(2));
  await take("Ben", "closedQuiz", ids.bioQ, all);
  await correct("Cal", await take("Cal", "closedQuiz", ids.bioQ, firstN(3)));
  await correct("Ava", await take("Ava", "closedTest", ids.lt3Q, () => false));

  // Skin quiz (CVTC course): no corrections, the retake is the way up.
  await take("Ava", "apQuiz", ids.apQ, firstN(2));

  // Lab write-up: Ben's written answer waits for a score.
  const benEssay = await start("Ben", "essayQuiz");
  await db.insert(schema.responses).values({
    attemptId: benEssay,
    questionId: essay.id,
    answer: { kind: "text", text: "Water moves to the salty side." },
  });
  await finalizeAttempt(benEssay);

  // The other period: Zed's attempt never shows here.
  as(ids.outsider, "student");
  await ok(startAttempt(ids.otherAsg, null));

  const closed = new Date(Date.now() - 3_600_000);
  for (const key of ["closedQuiz", "closedTest"])
    await db
      .update(schema.assignments)
      .set({ closesAt: closed })
      .where(eq(schema.assignments.id, ids.asg[key]));
});

const cellOf = (gb: ClassGradebook, name: Name, key: string) => {
  const row = gb.rows.find((r) => r.student.id === st(name))!;
  return row.cells.find((c) => c.assignmentId === ids.asg[key])!;
};

describe("getClassGradebook", () => {
  it("gives every cell the state the student's own card shows (one shared rule)", async () => {
    const gb = (await getClassGradebook(ids.cls))!;
    let open = 0;
    for (const row of gb.rows) {
      const cards = new Map(
        (await listStudentAssignments(row.student.id)).map((c) => [c.id, c] as const)
      );
      for (const cell of row.cells) {
        const card: StudentAssignment | undefined = cards.get(cell.assignmentId);
        const column = gb.columns.find((c) => c.assignmentId === cell.assignmentId)!;
        // A closed test the student never started isn't on their home at all.
        if (!card) {
          expect([column.status, cell.card, cell.attemptsUsed]).toEqual(["closed", "closed", 0]);
          continue;
        }
        if (column.status === "open") open++;
        const where = `${row.student.firstName} · ${column.title}`;
        expect(cell.card, where).toBe(card.state);
        expect(cell.rule, where).toBe(card.correctionsRule);
        expect(cell.retakeBy, where).toEqual(card.retakeBy);
        expect(cell.score?.percent ?? null, where).toBe(card.final?.percent ?? null);
        const sum = (c: typeof cell.corrections) =>
          c && {
            state: c.state,
            needed: c.needed,
            done: c.done,
            started: c.started,
            approved: c.approved,
            returned: c.returned,
            attemptId: c.attemptId,
          };
        expect(sum(cell.corrections), where).toEqual(sum(card.corrections));
        expect(cell.retake?.plan ?? null, where).toEqual(card.retake?.plan ?? null);
        expect(cell.retake?.targets ?? null, where).toEqual(card.retake?.targets ?? null);
      }
    }
    expect(open).toBe(8 * 5); // five open tests; the other three are scheduled or closed
  });

  it("gives each student panel the to-do the student's own home lists for this class (Oct 14 2026)", async () => {
    // The student's side first: reading it can write missing gate rows, which the gradebook
    // then reads as stored.
    const own = new Map<string, ReturnType<typeof buildStudentToDo>>();
    // Every assignment in `ids.asg` is on this class (the other period's is `otherAsg`).
    const inClass = new Set(Object.values(ids.asg));
    for (const name of NAMES) {
      const assignments = await listStudentAssignments(st(name));
      const { activities } = await getStudentPractice(st(name), assignments);
      own.set(
        st(name),
        buildStudentToDo({
          assignments: assignments.filter((a) => inClass.has(a.id)),
          activities: activities.filter((a) => a.courseName === "Biology"),
        })
      );
    }
    const gb = (await getClassGradebook(ids.cls))!;
    for (const row of gb.rows)
      expect(row.studentToDo, row.student.firstName).toEqual(own.get(row.student.id));
    const list = (name: Name) => gb.rows.find((r) => r.student.id === st(name))!.studentToDo;
    const kinds = (rows: { kind: string; title: string }[]) => rows.map((r) => [r.kind, r.title]);
    // Ben: his corrections on the Cell quiz (one saved), the Osmosis quiz's, then his relearning
    // on the Unit 3 test; his written answer waits for a grade.
    expect(kinds(list("Ben").todo)).toContainEqual(["corrections", "Cell quiz"]);
    expect(list("Ben").todo.find((r) => r.title === "Cell quiz")?.progress?.label).toBe(
      "1 of 3 started, not turned in yet"
    );
    expect(kinds(list("Ben").waiting)).toEqual([["awaiting_grade", "Lab write-up"]]);
    // Gus's activity waits for the teacher's check-off on both sides.
    expect(kinds(list("Gus").waiting)).toContainEqual(["activity_check", "Cell model"]);
    // Dee's paused test is still hers to finish, in class.
    expect(list("Dee").todo[0]).toMatchObject({
      kind: "keep_going",
      title: "Cell quiz",
      why: "Paused. Finish it in class.",
    });
  });

  it("tags each cell for the teacher, the first that applies winning", async () => {
    const gb = (await getClassGradebook(ids.cls))!;
    const fmt = { time: () => "2:15", date: () => "Oct 15" };
    const labels = Object.fromEntries(
      gb.columns.map((col) => [
        col.title,
        Object.fromEntries(
          gb.rows.map((r) => [
            r.student.firstName,
            tagLabel(r.cells.find((c) => c.assignmentId === col.assignmentId)!.tag, fmt),
          ])
        ),
      ])
    );
    expect(labels["Cell quiz"]).toEqual({
      Ava: "Corrections → 100%",
      Ben: "Corrections needed 1/3", // one saved, as his own row says (review, Oct 14 2026)
      Cal: "Taking it 2/5",
      Dee: "Asked to finish",
      Eli: "Paused",
      Fay: "Done",
      Gus: "Can retake",
      Hal: "Not started",
    });
    expect(labels["Osmosis quiz"]).toMatchObject({
      Ava: "Retake request",
      Ben: "Corrections needed 0/2", // was "Ready, needs your OK" before decision 4
      Cal: "Unlocked · after 2:15",
      Dee: "Ready, needs your OK",
      Eli: "Not started",
    });
    expect(labels["Unit 3 test"]).toEqual({
      Ava: "Can retake", // every target proficient; optional retakes are on
      Ben: "Corrections needed 0/2",
      Cal: "Check corrections",
      Dee: "Retake needed (LT1)",
      Eli: "Relearning (needs: relearning item)",
      Fay: "Not started",
      Gus: "Check off activity",
      Hal: "Not started",
    });
    // Closed: corrections still show; the retake states say closed; never started is Missing.
    expect(labels["Mitosis quiz"]).toMatchObject({
      Ava: "Corrections needed 0/3",
      Ben: "Done",
      Cal: "Done",
      Dee: "Missing",
      Hal: "Missing",
    });
    // R1 (Jon, Oct 14 2026): her own card keeps the corrections too (it used to read "closed").
    expect(cellOf(gb, "Ava", "closedQuiz")).toMatchObject({ card: "corrections_needed" });
    expect(cellOf(gb, "Ben", "closedQuiz")).toMatchObject({ card: "closed", cycle: "done" });
    expect(labels["Unit 2 test"]).toMatchObject({
      Ava: "Retake needed (LT3) · closed",
      Ben: "Missing",
    });
    expect(cellOf(gb, "Ava", "closedTest").tag).toMatchObject({ closed: true, tone: "muted" });
    expect(labels["Skin quiz"]).toMatchObject({ Ava: "Can retake", Ben: "Not started" });
    expect(cellOf(gb, "Ava", "apQuiz")).toMatchObject({ rule: "none", corrections: null });
    expect(labels["Lab write-up"]).toMatchObject({ Ben: "To grade (1)", Ava: "Not started" });
    // Ben's own card waits for the grade (Jon, Oct 14 2026); the teacher's cell says To grade.
    expect(cellOf(gb, "Ben", "essayQuiz")).toMatchObject({ card: "awaiting_grade" });
    expect(new Set(Object.values(labels["Unit 4 quiz"]))).toEqual(new Set(["Opens Oct 15"]));
  });

  it("offers no retake unlock at or above the line under the cap, as startAttempt refuses one (decision 2)", async () => {
    // Osmosis quiz is capped (the default) with "Retakes need my OK": lift attempt 1 over 80.
    const firsts = await db
      .select({ id: schema.attempts.id, studentId: schema.attempts.studentId })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.assignmentId, ids.asg.okQuiz), eq(schema.attempts.number, 1)));
    const calTry = firsts.find((f) => f.studentId === st("Cal"))!.id;
    const calMissed = await db
      .select({ questionId: schema.responses.questionId })
      .from(schema.responses)
      .where(and(eq(schema.responses.attemptId, calTry), eq(schema.responses.autoScore, 0)));
    for (const f of firsts)
      await db.update(schema.attempts).set({ percent: 85 }).where(eq(schema.attempts.id, f.id));
    // Cal has nothing to correct: 100%, so his card is Done with the try 2 unlock still there.
    await db.update(schema.attempts).set({ percent: 100 }).where(eq(schema.attempts.id, calTry));
    await db
      .update(schema.responses)
      .set({ autoScore: 1 })
      .where(eq(schema.responses.attemptId, calTry));
    try {
      const gb = (await getClassGradebook(ids.cls))!;
      const fmt = { time: () => "2:15", date: () => "Oct 15" };
      const [ava, ben, cal] = (["Ava", "Ben", "Cal"] as const).map((n) => cellOf(gb, n, "okQuiz"));
      for (const c of [ava, ben, cal]) expect(c.rule).toBe("to_full");
      // Nothing asked for or unlocked: no "Unlock try 2" for a try that can never start.
      expect(ben.unlock).toBeNull();
      expect(tagLabel(ben.tag, fmt)).toBe("Corrections → 100%");
      // A request already made still gets an answer (the panel adds the inbox's note).
      expect(ava.unlock).toMatchObject({ attemptNumber: 2, state: "requested" });
      expect(tagLabel(ava.tag, fmt)).toBe("Retake request");
      const inboxRow = (await getNeedsYou(ids.teacher)).requests.find(
        (r) => r.assignmentId === ids.asg.okQuiz && r.studentId === st("Ava")
      );
      expect(inboxRow).toMatchObject({ stale: null, blocker: { reason: "no_retake" } });
      // An unlock already given can be taken back, and the tag names the real blocker, not the wait.
      expect(cal.unlock).toMatchObject({ attemptNumber: 2, state: "unlocked" });
      expect(cal.tag.blocker).toEqual({ reason: "no_retake" });
      expect(tagLabel(cal.tag, fmt)).toBe("Unlocked · no retake at their score");
      // With the wait gone too, the student's start is refused for exactly that reason.
      await db
        .update(schema.assignments)
        .set({ retakeWaitHours: 0 })
        .where(eq(schema.assignments.id, ids.asg.okQuiz));
      as(st("Cal"), "student");
      const refused = await startAttempt(ids.asg.okQuiz, null);
      expect(refused).toMatchObject({ ok: false, status: 403 });
      expect(!refused.ok && refused.error).toMatch(/retake/);
    } finally {
      await db
        .update(schema.assignments)
        .set({ retakeWaitHours: 24 })
        .where(eq(schema.assignments.id, ids.asg.okQuiz));
      for (const f of firsts)
        await db.update(schema.attempts).set({ percent: 60 }).where(eq(schema.attempts.id, f.id));
      for (const m of calMissed)
        await db
          .update(schema.responses)
          .set({ autoScore: 0 })
          .where(
            and(
              eq(schema.responses.attemptId, calTry),
              eq(schema.responses.questionId, m.questionId)
            )
          );
    }
  });

  it("never reads a test whose time ran out (and was left open) as Taking it", async () => {
    const calLive = cellOf((await getClassGradebook(ids.cls))!, "Cal", "quiz").openAttemptId!;
    const [before] = await db
      .select({ dueAt: schema.attempts.dueAt, lastActiveAt: schema.attempts.lastActiveAt })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, calLive));
    // A 20-minute clock that ran out a minute after the last save: out of time, not idle-paused.
    const lastSave = new Date(Date.now() - 2 * 60_000);
    await db
      .update(schema.attempts)
      .set({ lastActiveAt: lastSave, dueAt: new Date(lastSave.getTime() + 60_000) })
      .where(eq(schema.attempts.id, calLive));
    try {
      const nextDay = new Date(Date.now() + 86_400_000);
      const gb = (await getClassGradebook(ids.cls, nextDay))!;
      const cal = cellOf(gb, "Cal", "quiz");
      expect(tagLabel(cal.tag)).toBe("Time's up · not submitted");
      expect(cal.attempts.find((a) => a.id === calLive)).toMatchObject({
        paused: false,
        outOfTime: true,
      });
    } finally {
      await db.update(schema.attempts).set(before).where(eq(schema.attempts.id, calLive));
    }
  });

  it("pauses an open test on the student's home exactly as the panel does (currentPause, review Oct 14 2026)", async () => {
    const calLive = cellOf((await getClassGradebook(ids.cls))!, "Cal", "quiz").openAttemptId!;
    const [before] = await db
      .select({ dueAt: schema.attempts.dueAt, lastActiveAt: schema.attempts.lastActiveAt })
      .from(schema.attempts)
      .where(eq(schema.attempts.id, calLive));
    const [quiz] = await db
      .select({ closesAt: schema.assignments.closesAt })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, ids.asg.quiz));
    const keepGoing = async (now: Date) => {
      const home = (await listStudentAssignments(st("Cal"), now)).find(
        (a) => a.id === ids.asg.quiz
      )!;
      const row = cellOf((await getClassGradebook(ids.cls, now))!, "Cal", "quiz");
      const panel = (await getClassGradebook(ids.cls, now))!.rows
        .find((r) => r.student.id === st("Cal"))!
        .studentToDo.todo.find((r) => r.kind === "keep_going" && r.assignmentId === ids.asg.quiz);
      return {
        home: home.paused,
        cell: row.attempts.find((x) => x.id === calLive)?.paused,
        panel: panel?.why,
      };
    };
    try {
      // The window closed a minute ago while Cal was still in the test (no heartbeat since).
      const now = new Date();
      await db
        .update(schema.attempts)
        .set({ lastActiveAt: new Date(now.getTime() - 2 * 60_000), dueAt: null })
        .where(eq(schema.attempts.id, calLive));
      await db
        .update(schema.assignments)
        .set({ closesAt: new Date(now.getTime() - 60_000) })
        .where(eq(schema.assignments.id, ids.asg.quiz));
      expect(await keepGoing(now)).toEqual({
        home: true,
        cell: true,
        panel: "Paused. Finish it in class.",
      });
      await db
        .update(schema.assignments)
        .set({ closesAt: quiz.closesAt })
        .where(eq(schema.assignments.id, ids.asg.quiz));
      // A 20-minute clock that ran out before the 10 idle minutes did: out of time, not paused.
      const lastSave = new Date(now.getTime() - 15 * 60_000);
      await db
        .update(schema.attempts)
        .set({ lastActiveAt: lastSave, dueAt: new Date(lastSave.getTime() + 60_000) })
        .where(eq(schema.attempts.id, calLive));
      expect(await keepGoing(now)).toEqual({
        home: false,
        cell: false,
        panel: "You started this. Pick up where you left off.",
      });
    } finally {
      await db.update(schema.attempts).set(before).where(eq(schema.attempts.id, calLive));
      await db
        .update(schema.assignments)
        .set({ closesAt: quiz.closesAt })
        .where(eq(schema.assignments.id, ids.asg.quiz));
    }
  });

  it("marks exactly the teacher's moves the Needs you inbox lists for this class", async () => {
    const gb = (await getClassGradebook(ids.cls))!;
    const inbox = await getNeedsYou(ids.teacher);
    const mine = new Set(gb.columns.map((c) => c.assignmentId));
    const pair = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;
    const fromInbox = new Set([
      ...inbox.asked.map((r) => pair(r.assignmentId, r.studentId)),
      ...inbox.requests.filter((r) => !r.stale).map((r) => pair(r.assignmentId, r.studentId)),
      ...inbox.corrections.map((r) => pair(r.assignmentId, r.studentId)),
      pair(ids.asg.test, st("Gus")), // the activity row names the student, and it serves this test
      pair(ids.asg.essayQuiz, st("Ben")), // the grading row names the test; Ben's are the answers
    ]);
    const moves = new Set(
      gb.rows.flatMap((r) =>
        r.cells.filter((c) => c.tag.needsYou).map((c) => pair(c.assignmentId, c.studentId))
      )
    );
    expect(moves).toEqual(new Set([...fromInbox].filter((p) => mine.has(p.split(":")[0]))));
    expect(inbox.activities.map((a) => a.studentId)).toEqual([st("Gus")]);
    expect(inbox.grading.map((g) => g.assignmentId)).toEqual([ids.asg.essayQuiz]);
  });

  it("has the class's columns newest first, with footers, and only its own students", async () => {
    const gb = (await getClassGradebook(ids.cls))!;
    expect(gb.class).toMatchObject({ name: "Bio 2nd", period: "2", courseName: "Biology" });
    expect(gb.columns.map((c) => c.title)).toEqual([
      "Unit 4 quiz",
      "Lab write-up",
      "Skin quiz",
      "Unit 3 test",
      "Osmosis quiz",
      "Cell quiz",
      "Unit 2 test",
      "Mitosis quiz",
    ]);
    expect(gb.columns.map((c) => c.assignmentId)).not.toContain(ids.otherAsg);
    expect(gb.rows.map((r) => r.student.firstName)).toEqual([...NAMES]);
    const col = (key: string) => gb.columns.find((c) => c.assignmentId === ids.asg[key])!;
    expect(col("quiz")).toMatchObject({ status: "open", correctionsCap: true, cvtcRules: false });
    expect(col("quiz").footer).toEqual({
      done: 4,
      enrolled: 8,
      average: 75, // 80, 40, 100, and Gus's 40 lifted to 80
      tiers: null,
      movedUpThisWeek: 0,
    });
    expect(col("test").footer).toMatchObject({
      done: 6,
      enrolled: 8,
      tiers: { 1: 1, 2: 5, 3: 0 },
      movedUpThisWeek: 1,
    });
    expect(col("test").footer.average).toBeCloseTo(350 / 6);
    expect(col("apQuiz")).toMatchObject({ correctionsCap: false, cvtcRules: true });
    expect(cellOf(gb, "Ava", "test")).toMatchObject({
      score: { percent: 100, tier: 1, basis: "per_target" },
      movedUpThisWeek: true,
    });
    expect(cellOf(gb, "Dee", "quiz")).toMatchObject({
      attemptsUsed: 1,
      attempts: [{ number: 1, status: "in_progress", paused: true }],
    });
    expect(cellOf(gb, "Dee", "quiz").openAttemptId).toBe(cellOf(gb, "Dee", "quiz").attempts[0].id);
    expect(await getClassGradebook("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("reads in a handful of queries whatever the class size, and writes nothing", async () => {
    const client = (dbModule as unknown as { testClient: PGlite }).testClient;
    const spy = vi.spyOn(client, "query");
    try {
      await getClassGradebook(ids.cls);
      const sqls = spy.mock.calls.map((c) => String(c[0]).trim().toLowerCase());
      expect(sqls.length).toBeLessThanOrEqual(12);
      expect(sqls.every((q) => q.startsWith("select"))).toBe(true);
      // Never the whole served question set of every attempt: only what corrections scope reads.
      const results = await Promise.all(spy.mock.results.map((r) => r.value));
      const fields = results.flatMap((r: { fields?: { name: string }[] }) =>
        (r.fields ?? []).map((f) => f.name)
      );
      expect(fields.length).toBeGreaterThan(0);
      expect(fields).not.toContain("question_set");
    } finally {
      spy.mockRestore();
    }
    // Eli's idle test is read as paused but never written as paused.
    const eli = await db.query.attempts.findFirst({
      where: and(
        eq(schema.attempts.assignmentId, ids.asg.quiz),
        eq(schema.attempts.studentId, st("Eli"))
      ),
    });
    expect(eli).toMatchObject({ status: "in_progress", pausedAt: null });
  });
});
