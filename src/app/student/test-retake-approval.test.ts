/**
 * Ticket R4 (docs/retake-cycle-plan.md, Jon Oct 19 2026): a test's retake always waits for the
 * teacher. Done when: a student who finishes corrections and relearning can ask; the request shows
 * on the dashboard with the targets; nothing starts before Approve; after it the scoped retake
 * starts.
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
import { listRetakeRequests } from "@/lib/queries/dashboard";
import { createAssignments } from "../app/assign/actions";
import { unlockNextAttempt } from "../app/results/actions";
import { finishActivity } from "./practice/actions";
import { requestRetake, saveAnswer, startAttempt, submitAttempt } from "./actions";
import { saveCorrection, submitCorrections } from "./corrections/actions";

const ids = {
  teacher: "",
  student: "",
  course: "",
  lt: [] as string[],
  q: [] as { id: string; lt: number; right: string; wrong: string }[],
  assessment: "",
  assignment: "",
  attempt1: "",
  activity: "",
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
function fd(obj: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}

beforeAll(async () => {
  const [t, s] = await db
    .insert(schema.users)
    .values([
      { email: "t@x", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "s@x", passwordHash: "x", role: "student", firstName: "Maya", lastName: "L" },
    ])
    .returning();
  ids.teacher = t.id;
  ids.student = s.id;
  const [c] = await db.insert(schema.courses).values({ ownerId: t.id, name: "Bio" }).returning();
  ids.course = c.id;
  const lts = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: c.id, code: "LT1", title: "Atoms", sortOrder: 0 },
      { courseId: c.id, code: "LT2", title: "Bonds", sortOrder: 1 },
    ])
    .returning();
  ids.lt = lts.map((l) => l.id);
  const [bank] = await db
    .insert(schema.questionBanks)
    .values({ ownerId: t.id, courseId: c.id, name: "Bank" })
    .returning();
  for (const lt of [0, 0, 1, 1]) {
    const [q] = await db
      .insert(schema.questions)
      .values({
        bankId: bank.id,
        ownerId: t.id,
        type: "multiple_choice",
        stem: `LT${lt + 1} question`,
      })
      .returning();
    const [right, wrong] = await db
      .insert(schema.questionOptions)
      .values([
        { questionId: q.id, content: "Right", isCorrect: true, sortOrder: 0 },
        { questionId: q.id, content: "Wrong", isCorrect: false, sortOrder: 1 },
      ])
      .returning();
    await db
      .insert(schema.questionTargets)
      .values({ questionId: q.id, learningTargetId: ids.lt[lt] });
    ids.q.push({ id: q.id, lt, right: right.id, wrong: wrong.id });
  }
  const [a] = await db
    .insert(schema.assessments)
    .values({
      ownerId: t.id,
      courseId: c.id,
      type: "summative",
      title: "Unit 2 Test",
      isPublished: true,
    })
    .returning();
  ids.assessment = a.id;
  for (const lt of [0, 1]) {
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({
        assessmentId: a.id,
        title: `LT${lt + 1}`,
        sortOrder: lt,
        learningTargetId: ids.lt[lt],
      })
      .returning();
    await db
      .insert(schema.assessmentQuestions)
      .values(
        ids.q
          .filter((q) => q.lt === lt)
          .map((q, i) => ({ sectionId: sec.id, questionId: q.id, sortOrder: i }))
      );
  }
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: c.id, name: "P1" })
    .returning();
  await db.insert(schema.enrollments).values({ classId: cls.id, studentId: s.id });
  // A published reading for LT1, the relearning item.
  const [act] = await db
    .insert(schema.relearningActivities)
    .values({
      ownerId: t.id,
      courseId: c.id,
      kind: "reading",
      title: "Atoms, again",
      content: "Atoms are the smallest unit of an element.",
      isPublished: true,
    })
    .returning();
  await db
    .insert(schema.activityTargets)
    .values({ activityId: act.id, learningTargetId: ids.lt[0] });
  ids.activity = act.id;

  // Assigned through the real action with "Retakes need my OK" left unchecked.
  asUser(ids.teacher, "teacher");
  const { assignmentIds } = await ok(
    createAssignments(
      fd({
        assessmentId: a.id,
        classIds: [cls.id],
        reviewMode: "auto",
        retakeThreshold: "80",
        tier2Max: "2",
        optionalRetakes: "on",
        resultsReleased: "on",
        tzOffset: "300",
        attemptsAllowed: "",
        useTypeDefault: "on",
      })
    )
  );
  ids.assignment = assignmentIds[0];
});

describe("a test retake waits for the teacher (R4)", () => {
  it("the assignment needs the teacher's OK and has room for one retake", async () => {
    const asg = (await db.query.assignments.findFirst({
      where: eq(schema.assignments.id, ids.assignment),
    }))!;
    expect(asg).toMatchObject({ retakesNeedUnlock: true, attemptsAllowed: 2 });
  });

  it("Maya gets 50%: LT1 wrong, LT2 right, so LT1 must be retaken", async () => {
    asUser(ids.student, "student");
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    ids.attempt1 = attemptId;
    for (const q of ids.q)
      await ok(
        saveAnswer(attemptId, q.id, {
          kind: "choice",
          optionId: q.lt === 0 ? q.wrong : q.right,
        })
      );
    await ok(submitAttempt(attemptId));
    // Nothing to ask for yet: corrections, then relearning, come first.
    await fails(requestRetake(ids.assignment), 403);
  });

  it("after corrections and the reading she can ask; the request names LT1 and nothing starts", async () => {
    asUser(ids.student, "student");
    for (const q of ids.q.filter((x) => x.lt === 0))
      await ok(
        saveCorrection(ids.attempt1, q.id, {
          correctAnswer: "Right",
          explanation:
            "I mixed up atoms and molecules. An atom is the smallest unit of an element.",
        })
      );
    await ok(submitCorrections(ids.attempt1));
    await ok(finishActivity(ids.activity, { scrolledToEnd: true, confirmed: true }));
    // Not before the teacher says so, even with every step done.
    await fails(startAttempt(ids.assignment, null), 403);
    expect(await ok(requestRetake(ids.assignment))).toEqual({ attemptNumber: 2 });

    const requests = await listRetakeRequests(ids.teacher);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      firstName: "Maya",
      title: "Unit 2 Test",
      attemptNumber: 2,
      stale: null,
      blocker: null,
      retakeTargets: ["LT1"],
    });
    await fails(startAttempt(ids.assignment, null), 403);
  });

  it("once approved, the retake starts with LT1 only", async () => {
    asUser(ids.teacher, "teacher");
    await ok(unlockNextAttempt(ids.assignment, ids.student));
    asUser(ids.student, "student");
    const [card] = await listStudentAssignments(ids.student);
    expect(card.id).toBe(ids.assignment);
    const { attemptId } = await ok(startAttempt(ids.assignment, null));
    const a2 = (await db.query.attempts.findFirst({ where: eq(schema.attempts.id, attemptId) }))!;
    expect(a2.number).toBe(2);
    expect(a2.scope).toEqual([ids.lt[0]]);
    expect(a2.questionSet.every((q) => q.learningTargetId === ids.lt[0])).toBe(true);
  });
});
