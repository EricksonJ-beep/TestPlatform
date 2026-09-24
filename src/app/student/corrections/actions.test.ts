/**
 * Ticket 1.11: corrections on a graded attempt. A student drafts and submits;
 * the review gate approves on the spot (auto) or parks the set in the
 * teacher's queue; approve / return; the card state and the retake lock
 * follow. In-memory Postgres with the real migrations.
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
import { createAttempt, finalizeAttempt } from "@/lib/attempts";
import { listStudentAssignments } from "@/lib/queries/assignments";
import {
  countCorrectionsAwaiting,
  getCorrectionsForm,
  getCorrectionsSummary,
  listCorrectionsQueue,
} from "@/lib/queries/corrections";
import { getDashboardCounts } from "@/lib/queries/dashboard";
import { getAttemptReview, getGradebook } from "@/lib/queries/results";
import { approveCorrections, returnCorrections } from "@/app/app/results/corrections/actions";
import { startAttempt } from "../actions";
import { saveCorrection, submitCorrections } from "./actions";

const ids = {
  teacher: "",
  other: "",
  s1: "",
  s2: "",
  cls: "",
  lt1: "",
  lt2: "",
  formative: "", // assignment, teacher_approved review
  summative: "", // assignment, auto review, threshold 80
  q: [] as { id: string; right: string; wrong: string }[], // 4 MC: q0,q1 on LT1; q2,q3 on LT2
  fill: "", // LT2 fill-blank
  fAttempt: "",
  sAttempt: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

const GOOD = {
  correctAnswer: "Right",
  explanation:
    "I mixed up the two terms on the test. The right one is the one that matches the definition we wrote in our notes.",
};

async function answerAndSubmit(attemptId: string, answers: Record<string, unknown>) {
  for (const [questionId, answer] of Object.entries(answers)) {
    await db.insert(schema.responses).values({ attemptId, questionId, answer });
  }
  await finalizeAttempt(attemptId);
}

beforeAll(async () => {
  const [t, o, s1, s2] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
      { email: "s1@s", passwordHash: "x", role: "student", firstName: "Maya", lastName: "Rivera" },
      { email: "s2@s", passwordHash: "x", role: "student", firstName: "Dylan", lastName: "K" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: o.id, s1: s1.id, s2: s2.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "LT1", title: "One", sortOrder: 1 },
      { courseId: course.id, code: "LT2", title: "Two", sortOrder: 2 },
    ])
    .returning();
  ids.lt1 = lt1.id;
  ids.lt2 = lt2.id;
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P3" })
    .returning();
  ids.cls = cls.id;
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: s1.id },
    { classId: cls.id, studentId: s2.id },
  ]);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  for (let i = 0; i < 4; i++) {
    const [q] = await db
      .insert(schema.questions)
      .values({
        bankId: bank.id,
        ownerId: t.id,
        type: "multiple_choice",
        stem: `MC ${i}`,
        points: 2,
        explanation: `The right answer to number ${i} is the option that matches the definition in the notes.`,
      })
      .returning();
    const [right, wrong] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        {
          questionId: q.id,
          content: "Wrong",
          isCorrect: false,
          sortOrder: 1,
          feedback: i === 0 ? "Look at the second word in the stem again." : null,
        },
      ])
      .returning();
    ids.q.push({ id: q.id, right: right.id, wrong: wrong.id });
  }
  const [fill] = await db
    .insert(schema.questions)
    .values({
      bankId: bank.id,
      ownerId: t.id,
      type: "fill_blank",
      stem: "Powerhouse?",
      points: 1,
      gradingConfig: { acceptedAnswers: ["mitochondria"] },
    })
    .returning();
  ids.fill = fill.id;

  // Formative: all five questions fixed, teacher-approved review, 3 attempts.
  const [f] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "formative",
      title: "Quiz",
      isPublished: true,
    })
    .returning();
  const [fs] = await db
    .insert(schema.assessmentSections)
    .values({ assessmentId: f.id, title: "All", sortOrder: 0 })
    .returning();
  await db
    .insert(schema.assessmentQuestions)
    .values([
      ...ids.q.map((q, i) => ({ sectionId: fs.id, questionId: q.id, sortOrder: i })),
      { sectionId: fs.id, questionId: fill.id, sortOrder: 4 },
    ]);
  const [fa] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      assessmentId: f.id,
      classId: cls.id,
      attemptsAllowed: 3,
      reviewMode: "teacher_approved",
    })
    .returning();
  ids.formative = fa.id;

  // Summative: LT1 section (q0,q1) and LT2 section (q2,q3,fill), auto review.
  const [s] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "summative",
      title: "Test",
      isPublished: true,
    })
    .returning();
  const [sec1, sec2] = await db
    .insert(schema.assessmentSections)
    .values([
      { assessmentId: s.id, title: "LT1", learningTargetId: lt1.id, sortOrder: 0 },
      { assessmentId: s.id, title: "LT2", learningTargetId: lt2.id, sortOrder: 1 },
    ])
    .returning();
  await db.insert(schema.assessmentQuestions).values([
    { sectionId: sec1.id, questionId: ids.q[0].id, sortOrder: 0 },
    { sectionId: sec1.id, questionId: ids.q[1].id, sortOrder: 1 },
    { sectionId: sec2.id, questionId: ids.q[2].id, sortOrder: 0 },
    { sectionId: sec2.id, questionId: ids.q[3].id, sortOrder: 1 },
    { sectionId: sec2.id, questionId: fill.id, sortOrder: 2 },
  ]);
  const [sa] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      assessmentId: s.id,
      classId: cls.id,
      attemptsAllowed: 2,
      reviewMode: "auto",
      retakeThreshold: 80,
    })
    .returning();
  ids.summative = sa.id;

  // S1 takes the formative: misses q1 and q3 (and the fill-blank), gets q0 and q2.
  const fAttempt = await createAttempt({ assignmentId: fa.id, studentId: s1.id });
  ids.fAttempt = fAttempt.attemptId;
  await answerAndSubmit(fAttempt.attemptId, {
    [ids.q[0].id]: { kind: "choice", optionId: ids.q[0].right },
    [ids.q[1].id]: { kind: "choice", optionId: ids.q[1].wrong },
    [ids.q[2].id]: { kind: "choice", optionId: ids.q[2].right },
    [ids.q[3].id]: { kind: "choice", optionId: ids.q[3].wrong },
    [fill.id]: { kind: "text", text: "nucleus" },
  });
});

describe("scope and the student form", () => {
  it("formative: every missed question, with the answer marked wrong, a hint, and no key", async () => {
    const form = (await getCorrectionsForm(ids.fAttempt))!;
    expect(form.items.map((i) => i.questionId)).toEqual([ids.q[1].id, ids.q[3].id, ids.fill]);
    expect(form.summary).toMatchObject({ state: "needed", needed: 3, remaining: 3 });
    expect(form.editable).toBe(true);
    const q1 = form.items[0];
    expect(q1.chosenOptionIds).toEqual([ids.q[1].wrong]);
    expect(q1.studentAnswerText).toBe("Wrong");
    expect(q1.hint).toBe("Not the correct option."); // grader note; q1's wrong option has no feedback
    expect(form.items[2].studentAnswerText).toBe("nucleus");
    expect(JSON.stringify(form)).not.toMatch(/isCorrect|acceptedAnswers|matches the definition/);
  });

  it("summative: only missed questions inside targets below the threshold", async () => {
    // S2: LT1 perfect (100%), LT2 misses q3 + fill → 2/5 = 40% → below 80.
    const a = await createAttempt({ assignmentId: ids.summative, studentId: ids.s2 });
    ids.sAttempt = a.attemptId;
    await answerAndSubmit(a.attemptId, {
      [ids.q[0].id]: { kind: "choice", optionId: ids.q[0].right },
      [ids.q[1].id]: { kind: "choice", optionId: ids.q[1].right },
      [ids.q[2].id]: { kind: "choice", optionId: ids.q[2].right },
      [ids.q[3].id]: { kind: "choice", optionId: ids.q[3].wrong },
      [ids.fill]: { kind: "text", text: "" },
    });
    const form = (await getCorrectionsForm(a.attemptId))!;
    expect(form.items.map((i) => i.questionId)).toEqual([ids.q[3].id, ids.fill]);
    expect(form.items[0].target).toMatchObject({ code: "LT2", percent: 40 });
  });
});

describe("saveCorrection (autosave)", () => {
  it("only the attempt's student, only on needed questions; drafts save with live issues", async () => {
    asUser(ids.s2, "student");
    await fails(saveCorrection(ids.fAttempt, ids.q[1].id, GOOD), 403);
    asUser(ids.teacher, "teacher");
    await fails(saveCorrection(ids.fAttempt, ids.q[1].id, GOOD), 403);
    asUser(ids.s1, "student");
    await fails(saveCorrection(ids.fAttempt, ids.q[0].id, GOOD), 400); // q0 was right

    const partial = await ok(
      saveCorrection(ids.fAttempt, ids.q[1].id, { correctAnswer: "Right", explanation: "Because." })
    );
    expect(partial.issues).toEqual(["why_short"]);
    const copied = await ok(
      saveCorrection(ids.fAttempt, ids.q[1].id, {
        correctAnswer: "Right",
        explanation:
          "The right answer to number 1 is the option that matches the definition in the notes. That is why.",
      })
    );
    expect(copied.issues).toEqual(["why_copied"]);
    const good = await ok(saveCorrection(ids.fAttempt, ids.q[1].id, GOOD));
    expect(good.issues).toEqual([]);
    const summary = (await getCorrectionsSummary(ids.fAttempt))!;
    expect(summary).toMatchObject({ state: "needed", remaining: 3 }); // drafts don't count as done
  });

  it("the card says Corrections needed and the retake is locked", async () => {
    asUser(ids.s1, "student");
    const card = (await listStudentAssignments(ids.s1)).find((a) => a.id === ids.formative)!;
    expect(card.state).toBe("corrections_needed");
    expect(card.corrections).toMatchObject({ attemptId: ids.fAttempt, remaining: 3 });
    const blocked = await startAttempt(ids.formative, null);
    expect(blocked).toMatchObject({ ok: false, status: 403 });
    expect(blocked.ok ? "" : blocked.error).toMatch(/Finish your corrections/);
  });
});

describe("submitCorrections and the review gate", () => {
  it("refuses until every needed correction is complete, naming the questions", async () => {
    asUser(ids.s1, "student");
    const r = await submitCorrections(ids.fAttempt);
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) {
      expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual([ids.q[3].id, ids.fill].sort());
    }
  });

  it("teacher-approved mode: submit parks the set in the queue; edits lock; the card flips", async () => {
    asUser(ids.s1, "student");
    await ok(saveCorrection(ids.fAttempt, ids.q[3].id, GOOD));
    await ok(saveCorrection(ids.fAttempt, ids.fill, { ...GOOD, correctAnswer: "mitochondria" }));
    const r = await ok(submitCorrections(ids.fAttempt));
    expect(r.state).toBe("submitted");
    await fails(saveCorrection(ids.fAttempt, ids.q[3].id, GOOD), 409);
    await fails(submitCorrections(ids.fAttempt), 409); // already submitted

    const card = (await listStudentAssignments(ids.s1)).find((a) => a.id === ids.formative)!;
    expect(card.state).toBe("corrections_submitted");
    const blocked = await startAttempt(ids.formative, null);
    expect(blocked.ok ? "" : blocked.error).toMatch(/waiting for your teacher/);

    expect(await countCorrectionsAwaiting(ids.teacher)).toBe(1);
    expect(await countCorrectionsAwaiting(ids.other)).toBe(0);
    expect((await getDashboardCounts(ids.teacher)).correctionsAwaiting).toBe(1);
    const queue = await listCorrectionsQueue(ids.teacher);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      attemptId: ids.fAttempt,
      studentName: "Maya Rivera",
      assignmentTitle: "Quiz",
      aiFlag: false,
    });
    expect(queue[0].corrections.map((c) => c.order)).toEqual([2, 4, 5]);
    expect(queue[0].corrections[0]).toMatchObject({
      studentAnswerText: "Wrong",
      keyText: "Right",
      correctAnswer: "Right",
    });
    expect(await listCorrectionsQueue(ids.other)).toEqual([]);
  });

  it("only the owning teacher can return; the note reaches the student; the set is editable again", async () => {
    asUser(ids.other, "teacher");
    await fails(returnCorrections(ids.fAttempt, "Nope"), 403);
    asUser(ids.s1, "student");
    await fails(returnCorrections(ids.fAttempt, "Nope"), 403);
    asUser(ids.teacher, "teacher");
    await fails(returnCorrections(ids.fAttempt, "   "), 400);
    const r = await ok(returnCorrections(ids.fAttempt, "Say why in your own words on #4."));
    expect(r.count).toBe(3);

    const form = (await getCorrectionsForm(ids.fAttempt))!;
    expect(form.summary).toMatchObject({
      state: "returned",
      reviewerNote: "Say why in your own words on #4.",
    });
    expect(form.editable).toBe(true);
    asUser(ids.s1, "student");
    const card = (await listStudentAssignments(ids.s1)).find((a) => a.id === ids.formative)!;
    expect(card.state).toBe("corrections_returned");
    expect(await listCorrectionsQueue(ids.teacher)).toEqual([]);

    // Revise one and resubmit: the whole set goes back to submitted with the note cleared.
    await ok(
      saveCorrection(ids.fAttempt, ids.q[3].id, {
        ...GOOD,
        explanation: "I chose the wrong word. The right one is the one we defined on Monday.",
      })
    );
    await ok(submitCorrections(ids.fAttempt));
    expect((await getCorrectionsSummary(ids.fAttempt))!).toMatchObject({
      state: "submitted",
      reviewerNote: null,
    });
  });

  it("approve: every row approved, gradebook and review show it, the card is done, the retake unlocks", async () => {
    asUser(ids.other, "teacher");
    await fails(approveCorrections(ids.fAttempt), 403);
    asUser(ids.teacher, "teacher");
    const r = await ok(approveCorrections(ids.fAttempt));
    expect(r.count).toBe(3);
    await fails(approveCorrections(ids.fAttempt), 409); // nothing waiting

    const rows = await db
      .select()
      .from(schema.corrections)
      .where(eq(schema.corrections.attemptId, ids.fAttempt));
    expect(rows.every((c) => c.status === "approved" && c.reviewerId === ids.teacher)).toBe(true);
    const gb = await getGradebook(ids.formative);
    expect(gb.find((s) => s.studentId === ids.s1)!.attempts[0].corrections).toMatchObject({
      total: 3,
      approved: 3,
      state: "approved",
    });
    const review = (await getAttemptReview(ids.fAttempt))!;
    expect(review.items.find((i) => i.questionId === ids.q[1].id)!.correction).toMatchObject({
      status: "approved",
      correctAnswer: "Right",
    });

    asUser(ids.s1, "student");
    const card = (await listStudentAssignments(ids.s1)).find((a) => a.id === ids.formative)!;
    expect(card.state).toBe("done");
    expect(card.corrections).toMatchObject({ state: "approved" });
    const next = await ok(startAttempt(ids.formative, null));
    expect(next.resumed).toBe(false);
  });

  it("auto mode: submit approves on the spot and the retake opens", async () => {
    asUser(ids.s2, "student");
    await ok(saveCorrection(ids.sAttempt, ids.q[3].id, GOOD));
    await ok(saveCorrection(ids.sAttempt, ids.fill, { ...GOOD, correctAnswer: "mitochondria" }));
    const r = await ok(submitCorrections(ids.sAttempt));
    expect(r.state).toBe("approved");
    expect(await countCorrectionsAwaiting(ids.teacher)).toBe(0);
    const summary = (await getCorrectionsSummary(ids.sAttempt))!;
    expect(summary).toMatchObject({ state: "approved", approved: 2 });
    const form = (await getCorrectionsForm(ids.sAttempt))!;
    expect(form.editable).toBe(false);
  });
});
