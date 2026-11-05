/**
 * The Skyward export route (docs/relearning-revamp-plan.md, K1–K2, ticket R8), against the real
 * migrations: a two-target quiz gives two files in one zip (each target's counting percent, the
 * per-target score the path stores), a one-target quiz from before the path uses its counting score,
 * a test gives one file, `?file=i` and `n` download one renamed CSV, and only the owner gets them.
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

import { strFromU8, unzipSync } from "fflate";
import { db, schema } from "@/db";
import { parseCsv } from "@/lib/csv";
import { GET } from "./route";

const ids = { teacher: "", other: "", mixed: "", single: "", test: "" };
const asTeacher = (userId: string) => {
  state.session = { userId, role: "teacher", email: "t@t", firstName: "Jon", lastName: "E" };
};
const get = (assignmentId: string, query = "") =>
  GET(new Request(`http://localhost/api/results/${assignmentId}/skyward${query}`), {
    params: Promise.resolve({ assignmentId }),
  });

beforeAll(async () => {
  const [t, other, isaac, tim, damien] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      {
        email: "9001@example.test",
        passwordHash: "x",
        role: "student",
        firstName: "Ivy",
        lastName: "Anders",
      },
      {
        email: "tim@gmail.com",
        passwordHash: "x",
        role: "student",
        firstName: "Tim",
        lastName: "Bauer",
      },
      {
        email: "9002@example.test",
        passwordHash: "x",
        role: "student",
        firstName: "Dev",
        lastName: "Walsh",
      },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: other.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science" })
    .returning();
  const [lt1, lt2, lt3] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "U2.LT1", title: "Atoms", sortOrder: 1 },
      { courseId: course.id, code: "U2.LT2", title: "Ions", sortOrder: 2 },
      { courseId: course.id, code: "U2.LT3", title: "Isotopes", sortOrder: 3 },
    ])
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "PS 2nd" })
    .returning();
  await db
    .insert(schema.enrollments)
    .values([isaac, tim, damien].map((s) => ({ classId: cls.id, studentId: s.id })));
  async function assignment(type: "formative" | "summative", title: string, targets: string[]) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId: course.id, type, title, isPublished: true })
      .returning();
    for (const [i, lt] of targets.entries())
      await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: `S${i}`, sortOrder: i, learningTargetId: lt });
    const [asg] = await db
      .insert(schema.assignments)
      .values({ ownerId: t.id, classId: cls.id, assessmentId: a.id })
      .returning();
    return asg.id;
  }
  ids.mixed = await assignment("formative", "Ions quiz", [lt1.id, lt2.id]);
  ids.single = await assignment("formative", "Isotopes quiz", [lt3.id]);
  ids.test = await assignment("summative", "Unit 2 Test", [lt1.id, lt2.id, lt3.id]);
  const per = (p1: number, p2: number) => ({
    [lt1.id]: { pointsEarned: p1 / 20, pointsPossible: 5, percent: p1, fromAttemptId: t.id },
    [lt2.id]: { pointsEarned: p2 / 20, pointsPossible: 5, percent: p2, fromAttemptId: t.id },
  });
  const f = (assignmentId: string, studentId: string, percent: number, perTarget = {}) => ({
    assignmentId,
    studentId,
    percent,
    perTarget,
    totalEarned: percent / 10,
    totalPossible: 10,
  });
  await db.insert(schema.assignmentFinalScores).values([
    // Path quizzes store each target's counting percent (decision 25).
    f(ids.mixed, isaac.id, 90, per(80, 100)),
    f(ids.mixed, tim.id, 64.5, per(59.5, 69.5)),
    // A one-target quiz from before the path: its counting score (here a corrections lift to 80).
    f(ids.single, isaac.id, 80),
    f(ids.test, isaac.id, 87.5),
    f(ids.test, damien.id, 72.49),
  ]);
});

describe("GET /api/results/[id]/skyward", () => {
  it("zips one file per target for a quiz, each with the target's counting percent", async () => {
    asTeacher(ids.teacher);
    const res = await get(ids.mixed);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["F_LT1U2.csv", "F_LT2U2.csv"]);
    expect(parseCsv(strFromU8(files["F_LT1U2.csv"]))).toEqual([
      ["Last Name", "First Name", "ID", "Score"],
      ["Anders", "Ivy", "9001", "80"],
      ["Bauer", "Tim", "", "60"],
      ["Walsh", "Dev", "9002", ""],
    ]);
    expect(parseCsv(strFromU8(files["F_LT2U2.csv"]))[2]).toEqual(["Bauer", "Tim", "", "70"]);
  });

  it("downloads one renamed file with ?file= and n", async () => {
    asTeacher(ids.teacher);
    const res = await get(ids.mixed, "?file=1&n=F_LT1U2&n=My%20LT2:");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="MyLT2.csv"');
    expect(parseCsv(await res.text())[1]).toEqual(["Anders", "Ivy", "9001", "100"]);
  });

  it("sends a one-target quiz's counting score as one CSV", async () => {
    asTeacher(ids.teacher);
    const res = await get(ids.single);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="F_LT3U2.csv"');
    expect(parseCsv(await res.text())[1]).toEqual(["Anders", "Ivy", "9001", "80"]);
  });

  it("sends a test as one overall file, named like the S_LT columns", async () => {
    asTeacher(ids.teacher);
    const res = await get(ids.test);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="S_LT1,2,3U2.csv"');
    const rows = parseCsv(await res.text());
    expect(rows.slice(1, 4)).toEqual([
      ["Anders", "Ivy", "9001", "88"],
      ["Bauer", "Tim", "", ""],
      ["Walsh", "Dev", "9002", "72"],
    ]);
  });

  it("is the owner's only", async () => {
    asTeacher(ids.other);
    expect((await get(ids.mixed)).status).toBe(403);
    state.session = null;
    expect((await get(ids.mixed)).status).toBe(401);
  });
});
