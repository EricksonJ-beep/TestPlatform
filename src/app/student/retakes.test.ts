/**
 * Ticket 1.12: the PLAN.md §4 worked example end to end. A summative with
 * four targets × 10 points from pools; attempt 1 scores 37/40 with LT4 at 70%;
 * corrections on the three missed LT4 items unlock a targeted retake of ten
 * new LT4 questions; a 9 lifts the final to 39/40 and Tier 1.
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
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listFinalScores } from "@/lib/queries/attempts";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { getGradebook } from "@/lib/queries/results";
import { saveAnswer, setRetakeOptIn, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

const ids = {
  teacher: "",
  student: "",
  other: "",
  assignment: "",
  lt: [] as string[], // LT1..LT4
  // per target: question id → { right, wrong }
  q: {} as Record<string, { id: string; right: string; wrong: string }[]>,
  attempt1: "",
  attempt2: "",
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

const WHY = {
  correctAnswer: "Right",
  explanation: "I confused the two processes. The right one is the one that matches the diagram.",
};

beforeAll(async () => {
  const [t, s, o] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "s@s", passwordHash: "x", role: "student", firstName: "Maya", lastName: "Rivera" },
      { email: "o@s", passwordHash: "x", role: "student", firstName: "Out", lastName: "Sider" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, student: s.id, other: o.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Biology" })
    .returning();
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
  // Four sections, each "draw 10 from that target's pool of 20 one-point questions".
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
          points: 1,
        })
        .returning();
      const [right, wrong] = await db
        .insert(schema.questionOptions)
        .values([
          { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
          { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
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

/** Answer every served question: right, except `wrongPerTarget` of them on the given target. */
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

describe("PLAN.md §4 worked example", () => {
  it("attempt 1: 37/40 with LT4 at 70% → LT4 required, others optional, gates closed by corrections", async () => {
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    ids.attempt1 = attemptId;
    const a1 = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(a1.questionSet).toHaveLength(40);
    expect(a1.scope).toBeNull();
    await answerAll(attemptId, { [ids.lt[3]]: 3 });
    const r = await ok(submitAttempt(attemptId));
    expect(r).toMatchObject({ totalEarned: 37, totalPossible: 40 });

    const status = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(status.plan.required).toEqual([ids.lt[3]]);
    expect(status.plan.optional).toEqual([ids.lt[0], ids.lt[1], ids.lt[2]]);
    expect(status.targets.find((t) => t.id === ids.lt[3])).toMatchObject({
      code: "LT4",
      percent: 70,
      required: true,
      gate: { correctionsOk: false, activityOk: true, practiceOk: true, unlocked: false },
    });
    expect(status.targets.find((t) => t.id === ids.lt[0])!.gate).toMatchObject({
      correctionsOk: true, // nothing missed on LT1
      unlocked: false, // not required, not opted in
    });
    expect(status.plan).toMatchObject({ canStart: false, blocker: "gates" });
    const [final] = await listFinalScores(ids.assignment);
    expect(final).toMatchObject({ totalEarned: 37, tier: 2, targetsBelowThreshold: 1 });

    const [card] = await listStudentAssignments(ids.student);
    expect(card.state).toBe("corrections_needed");
    expect(card.corrections).toMatchObject({ needed: 3 });
    await fails(startAttempt(ids.assignment, null), 403);
  });

  it("corrections on the three missed LT4 items open the LT4 gate; the card says Retake required", async () => {
    asUser(ids.student, "student");
    const attempt = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, ids.attempt1),
    }))!;
    const responses = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.attemptId, ids.attempt1));
    const missed = responses.filter((r) => r.isCorrect === false).map((r) => r.questionId);
    expect(missed).toHaveLength(3);
    for (const q of missed) await ok(saveCorrection(ids.attempt1, q, WHY));
    expect((await ok(submitCorrections(ids.attempt1))).state).toBe("approved");
    expect(attempt.number).toBe(1);

    const status = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(status.targets.find((t) => t.id === ids.lt[3])!.gate).toMatchObject({
      correctionsOk: true,
      unlocked: true,
    });
    expect(status.plan).toMatchObject({ selected: [ids.lt[3]], canStart: true });
    const [card] = await listStudentAssignments(ids.student);
    expect(card.state).toBe("retake_required");
  });

  it("opting into a proficient target adds it to the scope; required targets and outsiders are refused", async () => {
    asUser(ids.other, "student");
    await fails(setRetakeOptIn(ids.assignment, ids.lt[0], true), 403);
    asUser(ids.teacher, "teacher");
    await fails(setRetakeOptIn(ids.assignment, ids.lt[0], true), 403);
    asUser(ids.student, "student");
    await fails(setRetakeOptIn(ids.assignment, ids.lt[3], true), 409); // already required
    await ok(setRetakeOptIn(ids.assignment, ids.lt[0], true));
    let status = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(status.plan.selected).toEqual([ids.lt[3], ids.lt[0]]);
    expect(status.targets.find((t) => t.id === ids.lt[0])!.gate.unlocked).toBe(true); // nothing missed → corrections ok
    await ok(setRetakeOptIn(ids.assignment, ids.lt[0], false));
    status = (await getRetakeStatus(ids.assignment, ids.student))!;
    expect(status.plan.selected).toEqual([ids.lt[3]]);

    // With optional retakes off, opting in is refused.
    await db
      .update(schema.assignments)
      .set({ optionalRetakes: false })
      .where(eq(schema.assignments.id, ids.assignment));
    await fails(setRetakeOptIn(ids.assignment, ids.lt[0], true), 403);
    await db
      .update(schema.assignments)
      .set({ optionalRetakes: true })
      .where(eq(schema.assignments.id, ids.assignment));
  });

  it("the retake serves ten new LT4 questions only; 9/10 lifts the final to 39/40 and Tier 1", async () => {
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    ids.attempt2 = attemptId;
    const a1 = (await db.query.attempts.findFirst({
      where: eq(schema.attempts.id, ids.attempt1),
    }))!;
    const a2 = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(a2.number).toBe(2);
    expect(a2.scope).toEqual([ids.lt[3]]);
    expect(a2.questionSet).toHaveLength(10);
    expect(a2.questionSet.every((s) => s.learningTargetId === ids.lt[3])).toBe(true);
    const seen = new Set(a1.questionSet.map((s) => s.questionId));
    expect(a2.questionSet.some((s) => seen.has(s.questionId))).toBe(false);

    await answerAll(attemptId, { [ids.lt[3]]: 1 });
    const r = await ok(submitAttempt(attemptId));
    expect(r).toMatchObject({ totalEarned: 9, totalPossible: 10 });
    const [final] = await listFinalScores(ids.assignment);
    expect(final).toMatchObject({
      totalEarned: 39,
      totalPossible: 40,
      tier: 1,
      targetsBelowThreshold: 0,
    });
    const finalRow = (await db.query.assignmentFinalScores.findFirst({
      where: and(
        eq(schema.assignmentFinalScores.assignmentId, ids.assignment),
        eq(schema.assignmentFinalScores.studentId, ids.student)
      ),
    }))!;
    expect(finalRow.perTarget[ids.lt[3]]).toMatchObject({
      pointsEarned: 9,
      percent: 90,
      fromAttemptId: attemptId,
    });
    expect(finalRow.perTarget[ids.lt[0]]).toMatchObject({
      pointsEarned: 10,
      fromAttemptId: ids.attempt1,
    });

    const [card] = await listStudentAssignments(ids.student);
    expect(card.state).toBe("done"); // attempts exhausted, all targets proficient
    expect(card.retake!.plan).toMatchObject({ required: [], blocker: "no_attempts" });
    await fails(startAttempt(ids.assignment, null), 403);

    const gb = await getGradebook(ids.assignment);
    expect(gb[0].attempts[1]).toMatchObject({ number: 2, scopeCodes: ["LT4"] });
    expect(gb[0].final).toMatchObject({ totalEarned: 39, tier: 1 });
  });

  it("a student with every target proficient gets Retake available and must pick a target to start", async () => {
    // Second summative assignment, same class: one perfect attempt.
    const [asg] = await db
      .insert(schema.assignments)
      .values({
        ownerId: ids.teacher,
        assessmentId: (await db.query.assignments.findFirst({
          where: eq(schema.assignments.id, ids.assignment),
        }))!.assessmentId,
        classId: (await db.query.assignments.findFirst({
          where: eq(schema.assignments.id, ids.assignment),
        }))!.classId,
        attemptsAllowed: 2,
        retakeThreshold: 80,
      })
      .returning();
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(asg.id, null));
    await answerAll(attemptId, {});
    await ok(submitAttempt(attemptId));
    const card = (await listStudentAssignments(ids.student)).find((a) => a.id === asg.id)!;
    expect(card.state).toBe("retake_available");
    const blocked = await startAttempt(asg.id, null);
    expect(blocked).toMatchObject({ ok: false, status: 403 });
    expect(blocked.ok ? "" : blocked.error).toMatch(/Choose a target/);
    await ok(setRetakeOptIn(asg.id, ids.lt[1], true));
    const { attemptId: retake } = await ok(startAttempt(asg.id, null));
    const a2 = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, retake) }))!;
    expect(a2.scope).toEqual([ids.lt[1]]);
    expect(a2.questionSet).toHaveLength(10);
  });
});
