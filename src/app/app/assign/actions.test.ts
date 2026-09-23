/**
 * Ticket 1.8: assignment actions, student visibility rules, accommodations, and
 * cross-access, against an in-memory Postgres with the real migrations.
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
import {
  getAssignmentRow,
  listStudentAssignments,
  listTeacherAssignments,
} from "@/lib/queries/assignments";
import { getClassDetail } from "@/lib/queries/classes";
import { setAccommodations } from "../classes/actions";
import {
  closeAssignmentNow,
  createAssignments,
  deleteAssignment,
  extendAssignment,
  updateAssignment,
} from "./actions";

const ids = {
  teacherA: "",
  teacherB: "",
  classA1: "",
  classA2: "",
  classB: "",
  student1: "",
  student2: "",
  outsider: "",
  published: "",
  draft: "",
  a1: "",
  a2: "",
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

const base = {
  reviewMode: "auto",
  retakeThreshold: "80",
  tier2Max: "2",
  optionalRetakes: "on",
  resultsReleased: "on",
  tzOffset: "300",
};

beforeAll(async () => {
  const [a, b, s1, s2, out] = await db
    .insert(schema.users)
    .values([
      { email: "a@t", passwordHash: "x", role: "teacher", firstName: "A", lastName: "Teacher" },
      { email: "b@t", passwordHash: "x", role: "teacher", firstName: "B", lastName: "Teacher" },
      { email: "s1@s", passwordHash: "x", role: "student", firstName: "S", lastName: "One" },
      { email: "s2@s", passwordHash: "x", role: "student", firstName: "S", lastName: "Two" },
      { email: "out@s", passwordHash: "x", role: "student", firstName: "Out", lastName: "Sider" },
    ])
    .returning();
  Object.assign(ids, {
    teacherA: a.id,
    teacherB: b.id,
    student1: s1.id,
    student2: s2.id,
    outsider: out.id,
  });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: a.id, name: "Biology" })
    .returning();
  const [c1, c2, cB] = await db
    .insert(schema.classes)
    .values([
      { ownerId: a.id, courseId: course.id, name: "Biology · Period 3" },
      { ownerId: a.id, courseId: course.id, name: "Biology · Period 5" },
      { ownerId: b.id, name: "B's class" },
    ])
    .returning();
  Object.assign(ids, { classA1: c1.id, classA2: c2.id, classB: cB.id });
  await db.insert(schema.enrollments).values([
    { classId: c1.id, studentId: s1.id },
    { classId: c1.id, studentId: s2.id },
    { classId: c2.id, studentId: s2.id },
  ]);
  const [pub, draft] = await db
    .insert(schema.assessments)
    .values([
      {
        ownerId: a.id,
        courseId: course.id,
        type: "summative",
        title: "Unit 3 test",
        isPublished: true,
        attemptLimit: 2,
      },
      {
        ownerId: a.id,
        courseId: course.id,
        type: "formative",
        title: "Draft quiz",
        isPublished: false,
      },
    ])
    .returning();
  ids.published = pub.id;
  ids.draft = draft.id;
});

describe("createAssignments", () => {
  it("assigns a published assessment to two classes with a window, code, limit, and type-default attempts", async () => {
    asUser(ids.teacherA, "teacher");
    const { assignmentIds } = await ok(
      createAssignments(
        fd({
          ...base,
          assessmentId: ids.published,
          classIds: [ids.classA1, ids.classA2],
          opensAt: "2026-09-22T08:00",
          closesAt: "2026-09-22T15:00",
          accessCode: "ab3-k9q",
          timeLimitMinutes: "20",
          attemptsAllowed: "",
          useTypeDefault: "on",
          retakeWaitHours: "24",
        })
      )
    );
    expect(assignmentIds).toHaveLength(2);
    [ids.a1, ids.a2] = assignmentIds;
    const row = (await getAssignmentRow(ids.a1))!;
    expect(row).toMatchObject({
      className: "Biology · Period 3",
      accessCode: "AB3-K9Q",
      timeLimitMinutes: 20,
      attemptsAllowed: 2,
      enrolled: 2,
      retakeWaitHours: 24,
    });
    expect(row.opensAt?.toISOString()).toBe("2026-09-22T13:00:00.000Z"); // 8:00 Central Daylight
    expect(row.closesAt?.toISOString()).toBe("2026-09-22T20:00:00.000Z");
    expect(await listTeacherAssignments(ids.teacherA)).toHaveLength(2);
    expect(await listTeacherAssignments(ids.teacherB)).toHaveLength(0);
  });

  it("refuses a draft assessment, another teacher's class or assessment, a bad window, and no class", async () => {
    asUser(ids.teacherA, "teacher");
    await fails(
      createAssignments(fd({ ...base, assessmentId: ids.draft, classIds: [ids.classA1] })),
      400
    );
    await fails(
      createAssignments(fd({ ...base, assessmentId: ids.published, classIds: [ids.classB] })),
      403
    );
    await fails(
      createAssignments(
        fd({
          ...base,
          assessmentId: ids.published,
          classIds: [ids.classA1],
          opensAt: "2026-09-22T15:00",
          closesAt: "2026-09-22T08:00",
        })
      ),
      400
    );
    await fails(createAssignments(fd({ ...base, assessmentId: ids.published, classIds: [] })), 400);
    asUser(ids.teacherB, "teacher");
    await fails(
      createAssignments(fd({ ...base, assessmentId: ids.published, classIds: [ids.classB] })),
      403
    );
    asUser(ids.student1, "student");
    await fails(
      createAssignments(fd({ ...base, assessmentId: ids.published, classIds: [ids.classA1] })),
      403
    );
  });
});

describe("student visibility", () => {
  it("an enrolled student sees the assignment inside its window; scheduled shows as upcoming; closed hides without work", async () => {
    const during = new Date("2026-09-22T14:00:00Z");
    const before = new Date("2026-09-22T12:00:00Z");
    const after = new Date("2026-09-22T21:00:00Z");
    const s1During = await listStudentAssignments(ids.student1, during);
    expect(s1During).toHaveLength(1);
    expect(s1During[0]).toMatchObject({
      id: ids.a1,
      state: "not_started",
      status: "open",
      needsCode: true,
      timeLimitMinutes: 20,
      attemptsUsed: 0,
    });
    expect(s1During[0]).not.toHaveProperty("accessCode");
    expect((await listStudentAssignments(ids.student1, before))[0]).toMatchObject({
      state: "upcoming",
    });
    expect(await listStudentAssignments(ids.student1, after)).toHaveLength(0);
    // student2 is in both classes and sees both assignments
    expect((await listStudentAssignments(ids.student2, during)).map((a) => a.id).sort()).toEqual(
      [ids.a1, ids.a2].sort()
    );
    // an outsider sees nothing
    expect(await listStudentAssignments(ids.outsider, during)).toHaveLength(0);
  });

  it("a closed assignment stays visible to a student who has an attempt in it", async () => {
    const after = new Date("2026-09-22T21:00:00Z");
    await db.insert(schema.attempts).values({
      assignmentId: ids.a1,
      studentId: ids.student1,
      number: 1,
      questionSet: [],
      status: "submitted",
      percent: 75,
    });
    const rows = await listStudentAssignments(ids.student1, after);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "closed", attemptsUsed: 1, bestPercent: 75 });
    expect(await listStudentAssignments(ids.student2, after)).toHaveLength(0);
  });
});

describe("edit, close, extend, delete", () => {
  it("owner edits; another teacher gets 403", async () => {
    asUser(ids.teacherB, "teacher");
    await fails(updateAssignment(ids.a2, fd({ ...base, timeLimitMinutes: "5" })), 403);
    await fails(closeAssignmentNow(ids.a2), 403);
    await fails(extendAssignment(ids.a2, 60), 403);
    await fails(deleteAssignment(ids.a2), 403);
    asUser(ids.teacherA, "teacher");
    await ok(
      updateAssignment(
        ids.a2,
        fd({
          ...base,
          timeLimitMinutes: "30",
          accessCode: "",
          attemptsAllowed: "3",
          retakeThreshold: "70",
        })
      )
    );
    expect(await getAssignmentRow(ids.a2)).toMatchObject({
      timeLimitMinutes: 30,
      accessCode: null,
      attemptsAllowed: 3,
      retakeThreshold: 70,
      opensAt: null,
      closesAt: null,
    });
  });

  it("close now closes; extend pushes the close later from now when already closed", async () => {
    asUser(ids.teacherA, "teacher");
    await ok(closeAssignmentNow(ids.a2));
    let row = (await getAssignmentRow(ids.a2))!;
    expect(row.status).toBe("closed");
    await ok(extendAssignment(ids.a2, 60));
    row = (await getAssignmentRow(ids.a2))!;
    expect(row.status).toBe("open");
    expect(row.closesAt!.getTime() - Date.now()).toBeGreaterThan(55 * 60_000);
    await fails(extendAssignment(ids.a2, 0), 400);
  });

  it("delete is refused once a student has started; otherwise removes it", async () => {
    asUser(ids.teacherA, "teacher");
    await fails(deleteAssignment(ids.a1), 409);
    await ok(deleteAssignment(ids.a2));
    expect(await getAssignmentRow(ids.a2)).toBeNull();
  });
});

describe("accommodations", () => {
  it("the class owner sets extra time and font scale on the enrollment; others cannot", async () => {
    asUser(ids.teacherA, "teacher");
    await ok(
      setAccommodations(ids.classA1, ids.student1, fd({ extraTimePercent: "50", fontScale: "125" }))
    );
    const detail = (await getClassDetail(ids.classA1))!;
    expect(detail.roster.find((r) => r.studentId === ids.student1)).toMatchObject({
      extraTimePercent: 50,
      fontScale: 125,
    });
    await fails(
      setAccommodations(
        ids.classA1,
        ids.student1,
        fd({ extraTimePercent: "500", fontScale: "125" })
      ),
      400
    );
    await fails(setAccommodations(ids.classA1, ids.outsider, fd({ extraTimePercent: "50" })), 404);
    asUser(ids.teacherB, "teacher");
    await fails(setAccommodations(ids.classA1, ids.student1, fd({ extraTimePercent: "50" })), 403);
    const e = await db.query.enrollments.findFirst({
      where: eq(schema.enrollments.studentId, ids.student2),
    });
    expect(e).toMatchObject({ extraTimePercent: 0, fontScale: 100 });
  });
});
