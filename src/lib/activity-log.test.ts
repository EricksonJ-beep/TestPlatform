/**
 * Activity log (Jon, Oct 1 2026): milestone writes, plain-language lines,
 * and the teacher-scoped reads.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { db, schema } from "@/db";
import {
  describeActivity,
  listClassActivity,
  listRecentActivity,
  logActivity,
} from "./activity-log";
import { getClassDetail } from "@/lib/queries/classes";

const ids = {
  teacherA: "",
  teacherB: "",
  maya: "",
  ava: "",
  classA: "",
  classB: "",
  assignment: "",
};

beforeAll(async () => {
  const [a, b, maya, ava] = await db
    .insert(schema.users)
    .values([
      { email: "a@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "b@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
      {
        email: null,
        username: "maya.rivera",
        passwordHash: "x",
        role: "student",
        firstName: "Maya",
        lastName: "Rivera",
      },
      {
        email: "ava@s",
        passwordHash: "x",
        role: "student",
        firstName: "Ava",
        lastName: "Peterson",
      },
    ])
    .returning();
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: a.id, name: "A&P" })
    .returning();
  const [classA, classB] = await db
    .insert(schema.classes)
    .values([
      { ownerId: a.id, courseId: course.id, name: "Anatomy · 5th Hour" },
      { ownerId: b.id, name: "Other" },
    ])
    .returning();
  await db.insert(schema.enrollments).values([
    { classId: classA.id, studentId: maya.id },
    { classId: classB.id, studentId: ava.id },
  ]);
  const [assessment] = await db
    .insert(schema.assessments)
    .values({
      ownerId: a.id,
      courseId: course.id,
      type: "formative",
      title: "Lab Quiz: Skin",
      isPublished: true,
    })
    .returning();
  const [asg] = await db
    .insert(schema.assignments)
    .values({ ownerId: a.id, assessmentId: assessment.id, classId: classA.id })
    .returning();
  Object.assign(ids, {
    teacherA: a.id,
    teacherB: b.id,
    maya: maya.id,
    ava: ava.id,
    classA: classA.id,
    classB: classB.id,
    assignment: asg.id,
  });
});

describe("activity log", () => {
  it("records milestones and reads them back per class and per teacher, newest first", async () => {
    await logActivity({ userId: ids.maya, kind: "login" });
    await logActivity({
      userId: ids.maya,
      kind: "attempt_started",
      assignmentId: ids.assignment,
      detail: { attemptNumber: 1 },
    });
    await logActivity({
      userId: ids.maya,
      kind: "attempt_submitted",
      assignmentId: ids.assignment,
      detail: { attemptNumber: 1, percent: 80 },
    });
    await logActivity({ userId: ids.ava, kind: "login" }); // other teacher's student
    const cls = await listClassActivity(ids.classA);
    expect(cls.map((r) => r.kind)).toEqual(["attempt_submitted", "attempt_started", "login"]);
    expect(cls[0]).toMatchObject({ firstName: "Maya", assignmentTitle: "Lab Quiz: Skin" });
    expect(await listClassActivity(ids.classA, { studentId: ids.ava })).toEqual([]);
    const mine = await listRecentActivity(ids.teacherA);
    expect(mine.every((r) => r.userId === ids.maya)).toBe(true);
    expect(mine).toHaveLength(3);
    const theirs = await listRecentActivity(ids.teacherB);
    expect(theirs.map((r) => r.userId)).toEqual([ids.ava]);
    // Roster "last seen" picks up the newest event.
    const detail = (await getClassDetail(ids.classA))!;
    const maya = detail.roster.find((r) => r.studentId === ids.maya)!;
    expect(maya.lastSeenAt).toBeInstanceOf(Date);
    expect(maya.lastLoginAt).toBeNull();
  });
  it("describes each kind in plain language", () => {
    const base = { assignmentTitle: "Lab Quiz: Skin", detail: {} };
    expect(describeActivity({ ...base, kind: "login" })).toBe("Logged in");
    expect(
      describeActivity({ ...base, kind: "attempt_started", detail: { attemptNumber: 2 } })
    ).toBe("Started attempt 2 on Lab Quiz: Skin");
    expect(
      describeActivity({
        ...base,
        kind: "attempt_submitted",
        detail: { attemptNumber: 2, percent: 79.6 },
      })
    ).toBe("Submitted attempt 2 on Lab Quiz: Skin · 80%");
    expect(
      describeActivity({ ...base, kind: "attempt_submitted", detail: { percent: null } })
    ).toBe("Submitted attempt on Lab Quiz: Skin");
    expect(
      describeActivity({ ...base, kind: "corrections_submitted", detail: { approved: true } })
    ).toBe("Submitted corrections on Lab Quiz: Skin (auto-approved)");
    expect(
      describeActivity({
        kind: "practice_completed",
        assignmentTitle: null,
        detail: { title: "LT4 practice" },
      })
    ).toBe("Finished practice set LT4 practice");
    expect(
      describeActivity({
        kind: "class_joined",
        assignmentTitle: null,
        detail: { className: "Anatomy" },
      })
    ).toBe("Joined Anatomy");
    expect(
      describeActivity({ ...base, kind: "retake_requested", detail: { attemptNumber: 3 } })
    ).toBe("Asked for attempt 3 on Lab Quiz: Skin");
  });
  it("never throws on a bad write", async () => {
    await expect(logActivity({ userId: "not-a-uuid", kind: "login" })).resolves.toBeUndefined();
  });
});
