/**
 * Skyward updates (Jon, Nov 5 2026), end to end against the real migrations: a download from the
 * export page records what Skyward has; a later score change (the relearning path, a late quiz)
 * shows with its reason; "changes only" files hold just those rows; "Mark as entered" clears them;
 * "Start tracking as of a date" works out what Skyward had then from the score history. Owner only,
 * and a download only records from Bloom's own pages. Fictional students only.
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
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCsv } from "@/lib/csv";
import { countSkywardUpdates, getSkywardUpdates } from "@/lib/queries/skyward-updates";
import { needsYouCounts } from "@/lib/needs-you";
import { GET, POST } from "@/app/api/results/[assignmentId]/skyward/route";
import { markSkywardEntered, startTrackingSkyward } from "./actions";

const ids = {
  teacher: "",
  other: "",
  course: "",
  quiz: "",
  test: "",
  lt1: "",
  lt2: "",
  ava: "",
  ben: "",
  cal: "",
};
const day = (d: number) => new Date(Date.UTC(2026, 10, d, 18));
const as = (userId: string) => {
  state.session = { userId, role: "teacher", email: "t@t", firstName: "Jon", lastName: "E" };
};
const ctx = (assignmentId: string) => ({ params: Promise.resolve({ assignmentId }) });
function post(assignmentId: string, fields: Record<string, string>, origin = "http://localhost") {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return POST(
    new Request(`http://localhost/api/results/${assignmentId}/skyward`, {
      method: "POST",
      body,
      headers: { host: "localhost", origin },
    }),
    ctx(assignmentId)
  );
}
const marks = (assignmentId: string) =>
  db.select().from(schema.skywardMarks).where(eq(schema.skywardMarks.assignmentId, assignmentId));
const summary = async () =>
  (await getSkywardUpdates(ids.teacher)).groups.map((g) => ({
    title: g.assignment.title,
    files: g.files.map((f) => [
      f.label,
      f.changes.map((c) => `${c.firstName} ${c.from ?? "—"}→${c.to} ${c.reason}`),
    ]),
  }));

beforeAll(async () => {
  const [t, other, ava, ben, cal] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      {
        email: "ava@x.test",
        passwordHash: "x",
        role: "student",
        firstName: "Ava",
        lastName: "Adams",
        lunchCode: "1001",
      },
      {
        email: "ben@x.test",
        passwordHash: "x",
        role: "student",
        firstName: "Ben",
        lastName: "Brooks",
        lunchCode: "1002",
      },
      {
        email: "cal@x.test",
        passwordHash: "x",
        role: "student",
        firstName: "Cal",
        lastName: "Cruz",
        lunchCode: "1003",
      },
    ])
    .returning();
  Object.assign(ids, { teacher: t.id, other: other.id, ava: ava.id, ben: ben.id, cal: cal.id });
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: t.id, name: "Physical Science A" })
    .returning();
  ids.course = course.id;
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "U3.LT1", title: "Formulas", sortOrder: 1 },
      { courseId: course.id, code: "U3.LT2", title: "Bonds", sortOrder: 2 },
    ])
    .returning();
  Object.assign(ids, { lt1: lt1.id, lt2: lt2.id });
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: t.id, courseId: course.id, name: "PS 3rd" })
    .returning();
  await db
    .insert(schema.enrollments)
    .values([ava, ben, cal].map((s) => ({ classId: cls.id, studentId: s.id })));
  async function assignment(type: "formative" | "summative", title: string) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: t.id, courseId: course.id, type, title, isPublished: true })
      .returning();
    for (const [i, lt] of [lt1.id, lt2.id].entries())
      await db
        .insert(schema.assessmentSections)
        .values({ assessmentId: a.id, title: `S${i}`, sortOrder: i, learningTargetId: lt });
    const [asg] = await db
      .insert(schema.assignments)
      .values({ ownerId: t.id, classId: cls.id, assessmentId: a.id })
      .returning();
    return asg.id;
  }
  ids.quiz = await assignment("formative", "8.1 Quiz");
  ids.test = await assignment("summative", "Unit 3 Test");
  await db
    .insert(schema.assignmentFinalScores)
    .values([
      final(ids.quiz, ava.id, 65, per(40, 90)),
      final(ids.quiz, ben.id, 80, per(60, 100)),
      final(ids.test, ava.id, 95),
      final(ids.test, ben.id, 85),
    ]);
  await db.insert(schema.scoreHistory).values([
    { assignmentId: ids.quiz, studentId: ava.id, percent: 65, basis: "best_attempt", at: day(3) },
    { assignmentId: ids.quiz, studentId: ben.id, percent: 80, basis: "best_attempt", at: day(3) },
    // The test: Ava took it at 70 on the 3rd and retook it to 95 on the 10th.
    { assignmentId: ids.test, studentId: ava.id, percent: 70, basis: "best_attempt", at: day(3) },
    { assignmentId: ids.test, studentId: ava.id, percent: 95, basis: "retake", at: day(10) },
    { assignmentId: ids.test, studentId: ben.id, percent: 85, basis: "best_attempt", at: day(3) },
  ]);
});

function per(p1: number, p2: number) {
  return {
    [ids.lt1]: {
      pointsEarned: p1 / 20,
      pointsPossible: 5,
      percent: p1,
      fromAttemptId: ids.teacher,
    },
    [ids.lt2]: {
      pointsEarned: p2 / 20,
      pointsPossible: 5,
      percent: p2,
      fromAttemptId: ids.teacher,
    },
  };
}
function final(assignmentId: string, studentId: string, percent: number, perTarget = {}) {
  return {
    assignmentId,
    studentId,
    percent,
    perTarget,
    totalEarned: percent / 10,
    totalPossible: 10,
  };
}

describe("Skyward updates", () => {
  it("tracks nothing until a download from the export page; a link or another site records nothing", async () => {
    as(ids.teacher);
    expect(await getSkywardUpdates(ids.teacher)).toEqual({ tracking: false, groups: [] });
    // A plain link (GET) downloads but records nothing.
    const res = await GET(
      new Request(`http://localhost/api/results/${ids.quiz}/skyward`),
      ctx(ids.quiz)
    );
    expect(res.status).toBe(200);
    expect(await marks(ids.quiz)).toHaveLength(0);
    // A form on another site can't record an export in Jon's name.
    expect((await post(ids.quiz, {}, "https://evil.example")).status).toBe(403);
    expect(await marks(ids.quiz)).toHaveLength(0);
    // Another teacher can't download or mark it.
    as(ids.other);
    expect((await post(ids.quiz, {})).status).toBe(403);
    expect(await markSkywardEntered(ids.quiz, null)).toMatchObject({ ok: false, status: 403 });
  });

  it("the export page's download records what Skyward has, per target and student", async () => {
    as(ids.teacher);
    const res = await post(ids.quiz, {});
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const rows = await marks(ids.quiz);
    expect(
      rows
        .map((m) => [
          m.columnKey === ids.lt1 ? "lt1" : "lt2",
          m.studentId === ids.ava ? "ava" : "ben",
          m.score,
          m.source,
        ])
        .sort()
    ).toEqual([
      ["lt1", "ava", 40, "export"],
      ["lt1", "ben", 60, "export"],
      ["lt2", "ava", 90, "export"],
      ["lt2", "ben", 100, "export"],
    ]);
    expect(await getSkywardUpdates(ids.teacher)).toEqual({ tracking: true, groups: [] });
  });

  it("lists what changed since, with why; Needs you counts the grades as one row", async () => {
    // Ava's relearning path lifts U3.LT1 to 80; Cal takes the quiz late.
    await db
      .update(schema.assignmentFinalScores)
      .set({ percent: 85, perTarget: per(80, 90) })
      .where(
        and(
          eq(schema.assignmentFinalScores.assignmentId, ids.quiz),
          eq(schema.assignmentFinalScores.studentId, ids.ava)
        )
      );
    await db.insert(schema.assignmentFinalScores).values(final(ids.quiz, ids.cal, 70, per(60, 80)));
    await db.insert(schema.scoreHistory).values([
      {
        assignmentId: ids.quiz,
        studentId: ids.ava,
        percent: 85,
        basis: "relearning_path",
        at: new Date(),
      },
      {
        assignmentId: ids.quiz,
        studentId: ids.cal,
        percent: 70,
        basis: "best_attempt",
        at: new Date(),
      },
    ]);
    expect(await summary()).toEqual([
      {
        title: "8.1 Quiz",
        files: [
          ["U3.LT1", ["Ava 40→80 relearning path", "Cal —→60 new score"]],
          ["U3.LT2", ["Cal —→80 new score"]],
        ],
      },
    ]);
    expect(await countSkywardUpdates(ids.teacher)).toBe(3);
    expect(
      needsYouCounts({
        asked: [],
        requests: [],
        corrections: [],
        grading: [],
        activities: [],
        worksheetEmails: 0,
        skywardGrades: 3,
      })
    ).toMatchObject({ skyward: 3, total: 1 });
  });

  it("a changes-only file holds just those rows, and downloading it clears them", async () => {
    const res = await post(ids.quiz, { changes: "1", file: "0" });
    expect(res.headers.get("Content-Disposition")).toContain('filename="F_LT1U3.csv"');
    expect(parseCsv(await res.text())).toEqual([
      ["Last Name", "First Name", "ID", "Score"],
      ["Adams", "Ava", "1001", "80"],
      ["Cruz", "Cal", "1003", "60"],
    ]);
    expect(await summary()).toEqual([
      { title: "8.1 Quiz", files: [["U3.LT2", ["Cal —→80 new score"]]] },
    ]);
  });

  it("Mark as entered clears the rest: all caught up", async () => {
    expect(await markSkywardEntered(ids.quiz, ids.lt2)).toEqual({ ok: true, data: { marked: 1 } });
    expect(await getSkywardUpdates(ids.teacher)).toEqual({ tracking: true, groups: [] });
  });

  it("Start tracking as of a date works out what Skyward had then, so a retake after shows", async () => {
    expect(await startTrackingSkyward(ids.course, "2026-11-04")).toEqual({
      ok: true,
      // The quiz is already tracked; the test gets Ava at 70 (then) and Ben at 85 (unchanged).
      data: { assignments: 1, marks: 2 },
    });
    expect(await summary()).toEqual([
      { title: "Unit 3 Test", files: [["Whole test", ["Ava 70→95 retake"]]] },
    ]);
    // The zip of all changes for the test is its one file.
    const res = await post(ids.test, { changes: "1" });
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(parseCsv(await res.text())).toEqual([
      ["Last Name", "First Name", "ID", "Score"],
      ["Adams", "Ava", "1001", "95"],
    ]);
    expect(await countSkywardUpdates(ids.teacher)).toBe(0);
    expect(await startTrackingSkyward(ids.course, "not a date")).toMatchObject({ ok: false });
  });

  it("zips several changed files and skips files with no changes", async () => {
    // Two changes on different targets of the quiz, then the zip of changes only.
    await db
      .update(schema.assignmentFinalScores)
      .set({ percent: 95, perTarget: per(90, 100) })
      .where(
        and(
          eq(schema.assignmentFinalScores.assignmentId, ids.quiz),
          eq(schema.assignmentFinalScores.studentId, ids.ava)
        )
      );
    await db.insert(schema.scoreHistory).values({
      assignmentId: ids.quiz,
      studentId: ids.ava,
      percent: 95,
      basis: "retake",
      at: new Date(Date.now() + 1000),
    });
    const res = await post(ids.quiz, { changes: "1" });
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["F_LT1U3.csv", "F_LT2U3.csv"]);
    expect(parseCsv(strFromU8(files["F_LT2U3.csv"]))).toEqual([
      ["Last Name", "First Name", "ID", "Score"],
      ["Adams", "Ava", "1001", "100"],
    ]);
    expect(await countSkywardUpdates(ids.teacher)).toBe(0);
  });
});
