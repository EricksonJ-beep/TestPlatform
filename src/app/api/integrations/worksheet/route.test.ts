/**
 * Ticket 1.14: the worksheet webhook end to end. A submit creates an
 * unregistered worksheet and an event (idempotent on script, email, at);
 * registering it turns matched submits into a completed practice set and an
 * activity completion that open the retake gates; the section → target map
 * credits per target; an unmatched email can be linked to a student.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
import { recomputeGates } from "@/lib/gates";
import { getStudentPractice } from "@/lib/queries/practice";
import { getWorksheetDetail, listWorksheets } from "@/lib/queries/worksheets";
import {
  linkEmailToStudent,
  registerWorksheet,
  updateWorksheet,
} from "@/app/app/practice/worksheets/actions";
import { POST } from "./route";

const SECRET = "test-secret-123";
const SCRIPT = "1ScriptIdAbcdefghijklmnopqrstuvwxyz0123456789";
const ids = {
  teacher: "",
  teacherB: "",
  maya: "",
  bob: "",
  course: "",
  lt1: "",
  lt2: "",
  assignment: "",
  worksheet: "",
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

async function post(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-bloom-secret"] = secret;
  const req = new Request("http://x/api/integrations/worksheet", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = await POST(req, undefined);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const submit = (over: Record<string, unknown>) => ({
  scriptId: SCRIPT,
  worksheet: "Unit 1 Practice",
  email: "maya.rivera@cadott.k12.wi.us",
  at: "2026-09-29T14:00:00.000Z",
  event: "submit",
  score: 80,
  sectionScores: { "Part A: LT1": 100, "Part B: LT2": 60 },
  cardsCorrect: 8,
  totalCards: 10,
  totalChecks: 21,
  ...over,
});
const gate = async (studentId: string, lt: string) =>
  (await recomputeGates(ids.assignment, studentId)).find((g) => g.learningTargetId === lt)!;

beforeAll(async () => {
  process.env.BLOOM_WORKSHEET_SECRET = SECRET;
  const [t, tb, maya, bob] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "tb@t", passwordHash: "x", role: "teacher", firstName: "Other", lastName: "Teacher" },
      {
        email: "maya.rivera@cadott.k12.wi.us",
        passwordHash: "x",
        role: "student",
        firstName: "Maya",
        lastName: "Rivera",
      },
      { username: "bob.lee", passwordHash: "x", role: "student", firstName: "Bob", lastName: "Lee" },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, teacherB: tb.id, maya: maya.id, bob: bob.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science" })
    .returning();
  ids.course = course.id;
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "LT1", title: "Measure", sortOrder: 1 },
      { courseId: course.id, code: "LT2", title: "Convert", sortOrder: 2 },
    ])
    .returning();
  ids.lt1 = lt1.id;
  ids.lt2 = lt2.id;
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "P1" })
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: cls.id, studentId: maya.id },
    { classId: cls.id, studentId: bob.id },
  ]);
  // A summative both students scored 50% on for both targets, so both targets are required.
  const [assessment] = await db
    .insert(schema.assessments)
    .values({ ownerId: t.id, courseId: course.id, type: "summative", title: "Unit 1 Test", isPublished: true })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: t.id, assessmentId: assessment.id, classId: cls.id, attemptsAllowed: 2, retakeThreshold: 80 })
    .returning();
  ids.assignment = asg.id;
  const perTarget = (from: string) => ({
    [lt1.id]: { percent: 50, pointsEarned: 5, pointsPossible: 10, fromAttemptId: from },
    [lt2.id]: { percent: 50, pointsEarned: 5, pointsPossible: 10, fromAttemptId: from },
  });
  await db.insert(schema.assignmentFinalScores).values([
    { assignmentId: asg.id, studentId: maya.id, perTarget: perTarget("a1"), totalEarned: 10, totalPossible: 20, percent: 50, tier: 3, targetsBelowThreshold: 2 },
    { assignmentId: asg.id, studentId: bob.id, perTarget: perTarget("a2"), totalEarned: 10, totalPossible: 20, percent: 50, tier: 3, targetsBelowThreshold: 2 },
  ]);
});
afterAll(() => {
  delete process.env.BLOOM_WORKSHEET_SECRET;
});

describe("POST /api/integrations/worksheet", () => {
  it("refuses a missing or wrong secret, and a bad payload", async () => {
    expect((await post(submit({}), null)).status).toBe(401);
    expect((await post(submit({}), "nope")).status).toBe(401);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ scriptId: SCRIPT, email: "x", at: "2026-09-29T14:00:00Z" })).status).toBe(400);
    const saved = process.env.BLOOM_WORKSHEET_SECRET;
    delete process.env.BLOOM_WORKSHEET_SECRET;
    expect((await post(submit({}))).status).toBe(503);
    process.env.BLOOM_WORKSHEET_SECRET = saved;
  });

  it("a first submit creates an unregistered worksheet and stores the event once", async () => {
    const r = await post(submit({}));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, matched: true, registered: false, completed: false, duplicate: false });
    ids.worksheet = r.json.worksheetId as string;
    const again = await post(submit({}));
    expect(again.json).toMatchObject({ duplicate: true });
    const ws = (await db.query.worksheets.findFirst({ where: eq(schema.worksheets.id, ids.worksheet) }))!;
    expect(ws).toMatchObject({ scriptId: SCRIPT, title: "Unit 1 Practice", registered: false, ownerId: null });
    expect(await db.$count(schema.worksheetEvents, eq(schema.worksheetEvents.worksheetId, ids.worksheet))).toBe(1);

    // An unknown email is kept, not dropped.
    const bob = await post(submit({ email: "bob.lee@cadott.k12.wi.us", at: "2026-09-29T14:05:00Z", sectionScores: { "Part A: LT1": 100, "Part B: LT2": 0 } }));
    expect(bob.json).toMatchObject({ matched: false });
    asUser(ids.teacher, "teacher");
    const list = await listWorksheets(ids.teacher);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ registered: false, submits: 2, students: 1, unmatched: 1 });
  });

  it("registering the worksheet applies the submit already received and opens both gates", async () => {
    asUser(ids.teacher, "teacher");
    expect(await gate(ids.maya, ids.lt1)).toMatchObject({ activityOk: true, practiceOk: true }); // nothing published yet
    const r = await ok(
      registerWorksheet(fd({ ref: SCRIPT, courseId: ids.course, countsAs: "both", targetIds: [ids.lt1, ids.lt2] }))
    );
    expect(r).toMatchObject({ worksheetId: ids.worksheet, applied: 1 });
    const set = (await db.query.practiceSets.findFirst({ where: eq(schema.practiceSets.worksheetId, ids.worksheet) }))!;
    const act = (await db.query.relearningActivities.findFirst({ where: eq(schema.relearningActivities.worksheetId, ids.worksheet) }))!;
    expect(set).toMatchObject({ title: "Unit 1 Practice", isPublished: true, ownerId: ids.teacher });
    expect(act).toMatchObject({ kind: "worksheet", isPublished: true });
    const attempts = await db.query.practiceAttempts.findMany({ where: eq(schema.practiceAttempts.practiceSetId, set.id) });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ studentId: ids.maya, score: 8, maxScore: 10, percent: 80 });
    expect(attempts[0].completedAt).not.toBeNull();
    expect(await db.$count(schema.activityCompletions, eq(schema.activityCompletions.activityId, act.id))).toBe(1);
    expect(await gate(ids.maya, ids.lt1)).toMatchObject({ activityOk: true, practiceOk: true, unlockedAt: expect.any(Date) });
    // Bob has no completion, and now that content exists his gates are closed.
    expect(await gate(ids.bob, ids.lt1)).toMatchObject({ activityOk: false, practiceOk: false });

    // The student sees it as a done worksheet-backed set with the link to open.
    const practice = await getStudentPractice(ids.maya, []);
    expect(practice.sets[0]).toMatchObject({ title: "Unit 1 Practice", state: "done", bestPercent: 80 });
    // Another teacher cannot edit it.
    asUser(ids.teacherB, "teacher");
    await fails(updateWorksheet(ids.worksheet, fd({ title: "Mine", countsAs: "practice", targetIds: [ids.lt1] })), 403);
  });

  it("a new submit completes immediately; a section map credits per target", async () => {
    asUser(ids.teacher, "teacher");
    await ok(
      updateWorksheet(
        ids.worksheet,
        fd({
          title: "Unit 1 Practice",
          countsAs: "both",
          studentUrl: "https://script.google.com/a/macros/cadott.k12.wi.us/s/AKfycbxDEPLOY/exec",
          targetIds: [ids.lt1, ids.lt2],
          "map:Part A: LT1": ids.lt1,
          "map:Part B: LT2": ids.lt2,
        })
      )
    );
    const detail = (await getWorksheetDetail(ids.worksheet))!;
    expect(detail.sectionTargetMap).toEqual({ "Part A: LT1": ids.lt1, "Part B: LT2": ids.lt2 });
    expect(detail.sectionTitles.sort()).toEqual(["Part A: LT1", "Part B: LT2"]);
    expect(detail.unmatchedEmails).toEqual([expect.objectContaining({ email: "bob.lee@cadott.k12.wi.us", submits: 1 })]);

    // Bob gets an email: his stored submit (LT1 100, LT2 0) now counts, but only for LT1.
    await fails(linkEmailToStudent("bob.lee@cadott.k12.wi.us", ids.maya), 409); // Maya already has a different email
    const linked = await ok(linkEmailToStudent("bob.lee@cadott.k12.wi.us", ids.bob));
    expect(linked).toEqual({ matched: 1, applied: 1 });
    expect(await gate(ids.bob, ids.lt1)).toMatchObject({ activityOk: true, practiceOk: true });
    expect(await gate(ids.bob, ids.lt2)).toMatchObject({ activityOk: false, practiceOk: false });

    // A later submit that finishes Part B credits LT2 too, straight from the webhook.
    const r = await post(submit({ email: "bob.lee@cadott.k12.wi.us", at: "2026-09-29T15:00:00Z", sectionScores: { "Part A: LT1": 100, "Part B: LT2": 70 } }));
    expect(r.json).toMatchObject({ matched: true, registered: true, completed: true });
    expect(await gate(ids.bob, ids.lt2)).toMatchObject({ activityOk: true, practiceOk: true });
    const after = (await getWorksheetDetail(ids.worksheet))!;
    expect(after.unmatchedEmails).toEqual([]);
    expect(after.students).toBe(2);
  });

  it("a worksheet registered by its student link adopts the script id on the first webhook", async () => {
    asUser(ids.teacher, "teacher");
    const url = "https://script.google.com/a/macros/cadott.k12.wi.us/s/AKfycbxSECOND/exec";
    const { worksheetId } = await ok(
      registerWorksheet(fd({ ref: `${url}?usp=sharing`, title: "Unit 2 Practice", courseId: ids.course, countsAs: "practice", targetIds: [ids.lt2] }))
    );
    let ws = (await db.query.worksheets.findFirst({ where: eq(schema.worksheets.id, worksheetId) }))!;
    expect(ws.scriptId.startsWith("pending:")).toBe(true);
    const r = await post(submit({ scriptId: "SecondScriptId0123456789abcdefghijk", worksheet: "Unit 2 Practice", url, at: "2026-09-29T16:00:00Z", sectionScores: null }));
    expect(r.json).toMatchObject({ worksheetId, registered: true, completed: true });
    ws = (await db.query.worksheets.findFirst({ where: eq(schema.worksheets.id, worksheetId) }))!;
    expect(ws.scriptId).toBe("SecondScriptId0123456789abcdefghijk");
    const set = (await db.query.practiceSets.findFirst({ where: eq(schema.practiceSets.worksheetId, worksheetId) }))!;
    expect(
      await db.$count(
        schema.practiceAttempts,
        and(eq(schema.practiceAttempts.practiceSetId, set.id), eq(schema.practiceAttempts.studentId, ids.maya))
      )
    ).toBe(1);
    // Registering by the bare script id is refused if another teacher owns it.
    asUser(ids.teacherB, "teacher");
    await fails(registerWorksheet(fd({ ref: SCRIPT, courseId: ids.course, countsAs: "practice", targetIds: [ids.lt1] })), 403);
  });
});
