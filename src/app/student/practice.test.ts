/**
 * Ticket 1.13 "Done when": a student with LT4 required completes a video and a
 * practice set, the gate unlocks, and the retake button turns on. Also the
 * rules around it: content only counts once published, pins narrow the gate,
 * teacher verification, instant feedback, and who may touch what.
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
import { listStudentAssignments } from "@/lib/queries/assignments";
import { getStudentPractice, listPracticeContent } from "@/lib/queries/practice";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { setAssignmentPin } from "@/app/app/assign/actions";
import {
  addPracticeQuestions,
  createActivity,
  createPracticeSet,
  setActivityPublished,
  setPracticeSetPublished,
  swapContent,
  updateActivity,
  updatePracticeSet,
  verifyCompletion,
} from "@/app/app/practice/actions";
import { saveAnswer, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";
import { answerPractice, finishActivity, startPractice } from "./practice/actions";

const ids = {
  teacher: "",
  teacherB: "",
  student: "",
  outsider: "",
  course: "",
  assignment: "",
  lt: [] as string[],
  q: {} as Record<string, { id: string; right: string; wrong: string }[]>,
  attempt1: "",
  video: "",
  link: "",
  set: "",
  draftSet: "",
};

const asUser = (userId: string, role: Session["role"]) => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};
function fd(obj: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

const WHY = {
  correctAnswer: "Right",
  explanation: "I mixed up the two cases. The right one matches the rule in the notes.",
};

beforeAll(async () => {
  const [t, tb, s, o] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      {
        email: "tb@t",
        passwordHash: "x",
        role: "teacher",
        firstName: "Other",
        lastName: "Teacher",
      },
      { email: "s@s", passwordHash: "x", role: "student", firstName: "Maya", lastName: "Rivera" },
      { email: "o@s", passwordHash: "x", role: "student", firstName: "Out", lastName: "Sider" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, teacherB: tb.id, student: s.id, outsider: o.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
  ids.course = course.id;
  const targets = await db
    .insert(schema.learningTargets)
    .values(
      [1, 2, 3, 4].map((n) => ({
        courseId: course.id,
        code: `LT${n}`,
        title: `Target ${n}`,
        sortOrder: n,
      }))
    )
    .returning();
  ids.lt = targets.map((x) => x.id);
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P3" })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: s.id });
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: course.id, name: "Bank" })
    .returning();
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: course.id,
      type: "summative",
      title: "Unit test",
      isPublished: true,
    })
    .returning();
  for (const [i, lt] of ids.lt.entries()) {
    const [pool] = await db
      .insert(schema.questionPools)
      .values({ ownerId: t.id, courseId: course.id, name: `Pool ${i + 1}` })
      .returning();
    await db.insert(schema.poolTargets).values({ poolId: pool.id, learningTargetId: lt });
    ids.q[lt] = [];
    for (let n = 0; n < 20; n++) {
      const [q] = await db
        .insert(schema.questions)
        .values({
          bankId: bank.id,
          ownerId: t.id,
          type: "multiple_choice",
          stem: `LT${i + 1} q${n}`,
          explanation: `Because LT${i + 1} says so.`,
          points: 1,
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
            feedback: "Not that one.",
          },
        ])
        .returning();
      await db.insert(schema.questionTargets).values({ questionId: q.id, learningTargetId: lt });
      await db.insert(schema.poolQuestions).values({ poolId: pool.id, questionId: q.id });
      ids.q[lt].push({ id: q.id, right: right.id, wrong: wrong.id });
    }
    const [section] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId: assessment.id,
        title: `LT${i + 1}`,
        learningTargetId: lt,
        sortOrder: i,
      })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values({ sectionId: section.id, poolId: pool.id, drawCount: 10, sortOrder: 0 });
  }
  const [asg] = await db
    .insert(schema.assignments)
    .values({
      ownerId: t.id,
      assessmentId: assessment.id,
      classId: cls.id,
      attemptsAllowed: 2,
      retakeThreshold: 80,
      reviewMode: "auto",
      optionalRetakes: true,
    })
    .returning();
  ids.assignment = asg.id;
});

async function answerAll(attemptId: string, wrongOn: Record<string, number>) {
  const attempt = (await db.query.attempts.findFirst({
    where: eq(schema.attempts.id, attemptId),
  }))!;
  const wrongLeft = { ...wrongOn };
  for (const s of attempt.questionSet) {
    const lt = s.learningTargetId!;
    const q = ids.q[lt].find((x) => x.id === s.questionId)!;
    const wrong = (wrongLeft[lt] ?? 0) > 0;
    if (wrong) wrongLeft[lt]--;
    await ok(saveAnswer(attemptId, q.id, { kind: "choice", optionId: wrong ? q.wrong : q.right }));
  }
}

const lt4 = () => ids.lt[3];
const gate = async () =>
  (await getRetakeStatus(ids.assignment, ids.student))!.targets.find((t) => t.id === lt4())!.gate;
const cardState = async () => (await listStudentAssignments(ids.student))[0].state;

describe("Ticket 1.13: practice sets and relearning activities as retake gates", () => {
  it("attempt 1 leaves LT4 required; with nothing published, corrections alone open the gate", async () => {
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    ids.attempt1 = attemptId;
    await answerAll(attemptId, { [lt4()]: 3 });
    await ok(submitAttempt(attemptId));
    expect(await gate()).toMatchObject({
      correctionsOk: false,
      activityOk: true,
      practiceOk: true,
    });
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.attemptId, attemptId));
    for (const r of responses.filter((r) => r.isCorrect === false))
      await ok(saveCorrection(attemptId, r.questionId, WHY));
    await ok(submitCorrections(attemptId));
    expect(await gate()).toMatchObject({ correctionsOk: true, unlocked: true });
    expect(await cardState()).toBe("retake_required");
  });

  it("teacher publishes a video and a practice set tagged LT4; the gate closes and the card says Relearning", async () => {
    asUser(ids.teacher, "teacher");
    const { activityId } = await ok(
      createActivity(fd({ title: "Osmosis in 4 minutes", kind: "video", courseId: ids.course }))
    );
    ids.video = activityId;
    // Not publishable without content and a target.
    await fails(setActivityPublished(activityId, true), 400);
    await fails(
      updateActivity(activityId, fd({ title: "Osmosis", url: "not a link", targetIds: [lt4()] })),
      400
    );
    await ok(
      updateActivity(
        activityId,
        fd({ title: "Osmosis", url: "https://youtu.be/dQw4w9WgXcQ", targetIds: [lt4()] })
      )
    );
    await ok(setActivityPublished(activityId, true));
    expect(await gate()).toMatchObject({ activityOk: false, practiceOk: true, unlocked: false });

    const { practiceSetId } = await ok(
      createPracticeSet(fd({ title: "LT4 practice", courseId: ids.course }))
    );
    ids.set = practiceSetId;
    await fails(setPracticeSetPublished(practiceSetId, true), 400); // no questions yet
    const three = ids.q[lt4()].slice(10, 13).map((q) => q.id);
    expect(await ok(addPracticeQuestions(practiceSetId, three))).toEqual({ added: 3 });
    await fails(setPracticeSetPublished(practiceSetId, true), 400); // no target yet
    await ok(
      updatePracticeSet(
        practiceSetId,
        fd({ title: "LT4 practice", source: "fixed", targetIds: [lt4()] })
      )
    );
    await ok(setPracticeSetPublished(practiceSetId, true));
    expect(await gate()).toMatchObject({ activityOk: false, practiceOk: false, unlocked: false });
    expect(await cardState()).toBe("relearning");

    // A draft set stays invisible to students.
    const draft = await ok(createPracticeSet(fd({ title: "Draft", courseId: ids.course })));
    ids.draftSet = draft.practiceSetId;

    const content = await listPracticeContent(ids.teacher);
    expect(content.sets.map((s) => s.title)).toEqual(["LT4 practice", "Draft"]);
    expect(content.activities[0]).toMatchObject({ title: "Osmosis", isPublished: true });
  });

  it("the student's Practice tab groups LT4's items under Needed before your retake", async () => {
    asUser(ids.student, "student");
    const assignments = await listStudentAssignments(ids.student);
    const practice = await getStudentPractice(ids.student, assignments);
    expect(practice.sets.map((s) => s.title)).toEqual(["LT4 practice"]); // draft hidden
    expect(practice.needed).toHaveLength(1);
    const target = practice.needed[0].targets[0];
    expect(target).toMatchObject({
      code: "LT4",
      correctionsOk: true,
      activityOk: false,
      practiceOk: false,
    });
    expect(target.activities.map((a) => a.title)).toEqual(["Osmosis"]);
    expect(target.sets.map((s) => s.title)).toEqual(["LT4 practice"]);
  });

  it("only enrolled students use published content; only the owner edits it", async () => {
    asUser(ids.outsider, "student");
    await fails(startPractice(ids.set), 403);
    await fails(finishActivity(ids.video, { watchPercent: 100 }), 403);
    asUser(ids.student, "student");
    await fails(startPractice(ids.draftSet), 404);
    asUser(ids.teacherB, "teacher");
    await fails(updateActivity(ids.video, fd({ title: "Mine now", url: "https://x.y" })), 403);
    await fails(setPracticeSetPublished(ids.set, false), 403);
    asUser(ids.teacher, "teacher");
    await fails(startPractice(ids.set), 403); // teachers don't take practice
  });

  it("a half-watched video is refused; 90% completes it and opens the activity gate", async () => {
    asUser(ids.student, "student");
    await fails(finishActivity(ids.video, { watchPercent: 50 }), 400);
    expect(await gate()).toMatchObject({ activityOk: false });
    expect(await ok(finishActivity(ids.video, { watchPercent: 92 }))).toEqual({
      completed: true,
      awaitingTeacher: false,
    });
    expect(await gate()).toMatchObject({ activityOk: true, practiceOk: false, unlocked: false });
  });

  it("the practice set gives instant feedback, completes when every question is answered, and opens the gate", async () => {
    asUser(ids.student, "student");
    const { attemptId, resumed } = await ok(startPractice(ids.set));
    expect(resumed).toBe(false);
    expect((await ok(startPractice(ids.set))).attemptId).toBe(attemptId); // resumes the open one
    const attempt = (await db.query.practiceAttempts.findFirst({
      where: eq(schema.practiceAttempts.id, attemptId),
    }))!;
    expect(attempt.questionSet).toHaveLength(3);
    expect(attempt.questionSet.every((q) => q.learningTargetId === lt4())).toBe(true);
    const [q1, q2, q3] = attempt.questionSet.map((s) =>
      ids.q[lt4()].find((x) => x.id === s.questionId)!
    );

    const first = await ok(
      answerPractice(attemptId, q1.id, { kind: "choice", optionId: q1.wrong })
    );
    expect(first.feedback).toMatchObject({
      isCorrect: false,
      pointsEarned: 0,
      correctAnswer: "Right",
      explanation: "Because LT4 says so.",
      optionFeedback: ["Not that one."],
    });
    expect(first.progress).toMatchObject({ answered: 1, total: 3, complete: false });
    // One answer per question: a second answer returns the first's feedback.
    const again = await ok(
      answerPractice(attemptId, q1.id, { kind: "choice", optionId: q1.right })
    );
    expect(again.feedback.isCorrect).toBe(false);
    await fails(
      answerPractice(attemptId, ids.q[lt4()][0].id, { kind: "choice", optionId: null }),
      400
    );

    expect(await gate()).toMatchObject({ practiceOk: false });
    await ok(answerPractice(attemptId, q2.id, { kind: "choice", optionId: q2.right }));
    const last = await ok(answerPractice(attemptId, q3.id, { kind: "choice", optionId: q3.right }));
    expect(last).toMatchObject({ completed: true, progress: { complete: true, percent: 66.7 } });
    await fails(answerPractice(attemptId, q3.id, { kind: "choice", optionId: q3.right }), 409);

    expect(await gate()).toMatchObject({
      correctionsOk: true,
      activityOk: true,
      practiceOk: true,
      unlocked: true,
    });
    expect(await cardState()).toBe("retake_required");
    const practice = await getStudentPractice(
      ids.student,
      await listStudentAssignments(ids.student)
    );
    expect(practice.needed).toEqual([]);
    expect(practice.sets[0]).toMatchObject({ state: "done", bestPercent: 66.7, attempts: 1 });

    // Done when: the retake starts, scoped to LT4.
    const retake = await ok(startAttempt(ids.assignment, null));
    const a2 = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, retake.attemptId),
    }))!;
    expect(a2.scope).toEqual([lt4()]);
    expect(a2.questionSet).toHaveLength(10);
    await answerAll(retake.attemptId, {});
    await ok(submitAttempt(retake.attemptId));
    expect(await cardState()).toBe("done");
  });

  it("pins narrow the gate to one item; teacher-verified links count only once verified", async () => {
    // A second student scenario on the same assignment would need another attempt; reuse the gate
    // rows directly: the gate recomputes from completions, so pin a not-yet-done link activity.
    asUser(ids.teacher, "teacher");
    const { activityId } = await ok(
      createActivity(fd({ title: "Khan article", kind: "link", courseId: ids.course }))
    );
    ids.link = activityId;
    await ok(
      updateActivity(
        activityId,
        fd({
          title: "Khan article",
          url: "https://www.khanacademy.org/osmosis",
          requiresTeacherVerification: "on",
          targetIds: [lt4()],
        })
      )
    );
    await ok(setActivityPublished(activityId, true));
    expect(await gate()).toMatchObject({ activityOk: true }); // the video still satisfies "any"
    await fails(
      setAssignmentPin(ids.assignment, {
        learningTargetId: lt4(),
        activityId: ids.draftSet, // not an activity
        practiceSetId: null,
      }),
      400
    );
    await ok(
      setAssignmentPin(ids.assignment, { learningTargetId: lt4(), activityId, practiceSetId: null })
    );
    expect(await gate()).toMatchObject({ activityOk: false });

    asUser(ids.student, "student");
    await fails(finishActivity(activityId, {}), 400);
    expect(await ok(finishActivity(activityId, { confirmed: true }))).toEqual({
      completed: true,
      awaitingTeacher: true,
    });
    expect(await gate()).toMatchObject({ activityOk: false });
    const practice = await getStudentPractice(
      ids.student,
      await listStudentAssignments(ids.student)
    );
    expect(practice.activities.find((a) => a.id === activityId)?.state).toBe("awaiting_teacher");

    asUser(ids.teacherB, "teacher");
    await fails(verifyCompletion(activityId, ids.student, true), 403);
    asUser(ids.teacher, "teacher");
    await ok(verifyCompletion(activityId, ids.student, true));
    expect(await gate()).toMatchObject({ activityOk: true });

    // Unpin: back to "any tagged item".
    await ok(
      setAssignmentPin(ids.assignment, {
        learningTargetId: lt4(),
        activityId: null,
        practiceSetId: null,
      })
    );
    expect(await db.$count(schema.assignmentPins)).toBe(0);
    expect(await gate()).toMatchObject({ activityOk: true });
  });

  it("guided notes need every prompt; a pool set draws fresh questions each attempt", async () => {
    asUser(ids.teacher, "teacher");
    const { activityId } = await ok(
      createActivity(fd({ title: "Notes", kind: "guided_notes", courseId: ids.course }))
    );
    await fails(
      updateActivity(activityId, fd({ title: "Notes", prompts: ["Only one"], targetIds: [lt4()] })),
      400
    );
    await ok(
      updateActivity(
        activityId,
        fd({
          title: "Notes",
          prompts: ["What is osmosis?", "Give an example."],
          targetIds: [lt4()],
        })
      )
    );
    await ok(setActivityPublished(activityId, true));
    const a = (await db.query.relearningActivities.findFirst({
      where: eq(schema.relearningActivities.id, activityId),
    }))!;
    const [p1, p2] = a.prompts!;
    asUser(ids.student, "student");
    await fails(finishActivity(activityId, { answers: { [p1.id]: "Water moves." } }), 400);
    await ok(
      finishActivity(activityId, { answers: { [p1.id]: "Water moves.", [p2.id]: "Raisins." } })
    );

    asUser(ids.teacher, "teacher");
    const pool = (await db.query.questionPools.findFirst({
      where: eq(schema.questionPools.name, "Pool 4"),
    }))!;
    const { practiceSetId } = await ok(
      createPracticeSet(fd({ title: "LT4 pool practice", courseId: ids.course }))
    );
    await ok(
      updatePracticeSet(
        practiceSetId,
        fd({
          title: "LT4 pool practice",
          source: "pool",
          poolId: pool.id,
          drawCount: "5",
          targetIds: [lt4()],
        })
      )
    );
    await ok(setPracticeSetPublished(practiceSetId, true));
    asUser(ids.student, "student");
    const first = await ok(startPractice(practiceSetId));
    const a1 = (await db.query.practiceAttempts.findFirst({
      where: eq(schema.practiceAttempts.id, first.attemptId),
    }))!;
    expect(a1.questionSet).toHaveLength(5);
    for (const s of a1.questionSet) {
      const q = ids.q[lt4()].find((x) => x.id === s.questionId)!;
      await ok(answerPractice(first.attemptId, q.id, { kind: "choice", optionId: q.right }));
    }
    const second = await ok(startPractice(practiceSetId));
    expect(second.attemptId).not.toBe(first.attemptId);
    const a2 = (await db.query.practiceAttempts.findFirst({
      where: eq(schema.practiceAttempts.id, second.attemptId),
    }))!;
    const seen = new Set(a1.questionSet.map((q) => q.questionId));
    expect(a2.questionSet.some((q) => seen.has(q.questionId))).toBe(false);
  });
});

describe("practice page order (Jon, Oct 1 2026)", () => {
  it("swapContent flips two visible neighbours; another teacher is refused", async () => {
    asUser(ids.teacher, "teacher");
    const before = await listPracticeContent(ids.teacher);
    const all = [...before.sets, ...before.activities].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
    );
    expect(all.length).toBeGreaterThan(1);
    // Every target carries its unit (null when the target has none) for the accordion.
    for (const item of all) for (const t of item.targets) expect(t).toHaveProperty("unit");
    const [first, second] = all;
    const ref = (i: (typeof all)[number]) => ({
      type:
        i.kind === "practice_set" ? ("practice_set" as const) : ("relearning_activity" as const),
      id: i.id,
    });
    await ok(swapContent(ref(first), ref(second)));
    const after = await listPracticeContent(ids.teacher);
    const again = [...after.sets, ...after.activities].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
    );
    expect(again[0].id).toBe(second.id);
    expect(again[1].id).toBe(first.id);
    asUser(ids.teacherB, "teacher");
    await expect(swapContent(ref(first), ref(second))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });
});
