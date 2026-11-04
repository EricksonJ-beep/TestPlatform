/**
 * Relearning revamp, ticket R1 (docs/relearning-revamp-plan.md): the new tables, run through the
 * real migrations. Checks the rules the database itself enforces (one relearning row per target,
 * the practice-check links, pass marks, cascades, updated_at) and that 0030 can run again on a
 * database that already has it, since preview builds share the live database.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const ids = {
  teacher: "",
  student: "",
  course: "",
  lt1: "",
  lt2: "",
  assignment: "",
};

/** Resolves with the violated constraint's name, so a test fails if a different rule fired. */
async function violation(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string; constraint?: string } };
    return `${err.cause?.constraint ?? ""} ${err.cause?.message ?? ""} ${err.message ?? ""}`;
  }
  throw new Error("expected the insert or update to be refused");
}

beforeAll(async () => {
  t = await createTestDb();
  const { db, schema } = t;
  const [teacher, student] = await db
    .insert(schema.users)
    .values([
      { email: "jon@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "E" },
      { email: "2977@s", passwordHash: "x", role: "student", firstName: "Ava", lastName: "P" },
    ])
    .returning();
  const [course] = await db
    .insert(schema.courses)
    .values({ ownerId: teacher.id, name: "Physical Science" })
    .returning();
  const [lt1, lt2] = await db
    .insert(schema.learningTargets)
    .values([
      { courseId: course.id, code: "U3.LT1", title: "Ionic bonds" },
      { courseId: course.id, code: "U3.LT2", title: "Covalent bonds" },
    ])
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({ ownerId: teacher.id, courseId: course.id, name: "PS · 2nd Hour" })
    .returning();
  const [assessment] = await db
    .insert(schema.assessments)
    .values({ ownerId: teacher.id, courseId: course.id, type: "formative", title: "Bonding quiz" })
    .returning();
  const [assignment] = await db
    .insert(schema.assignments)
    .values({ ownerId: teacher.id, assessmentId: assessment.id, classId: cls.id })
    .returning();
  Object.assign(ids, {
    teacher: teacher.id,
    student: student.id,
    course: course.id,
    lt1: lt1.id,
    lt2: lt2.id,
    assignment: assignment.id,
  });
});

describe("course switch and assignment pass mark", () => {
  it("starts every course on the old rules and every assignment at 4 of 5", async () => {
    const { db, schema } = t;
    const [course] = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, ids.course));
    expect(course.relearningPathFrom).toBeNull();
    const [asg] = await db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, ids.assignment));
    expect(asg.practicePass).toBe(4);
  });

  it("refuses a pass mark outside 1–5", async () => {
    const { db, schema } = t;
    for (const practicePass of [0, 6]) {
      const why = await violation(
        db
          .update(schema.assignments)
          .set({ practicePass })
          .where(eq(schema.assignments.id, ids.assignment))
      );
      expect(why).toContain("assignments_practice_pass_range");
    }
  });
});

describe("Read · Watch · Do options and their sections", () => {
  it("stores an option with core and extension sections, one option per mode per target", async () => {
    const { db, schema } = t;
    const [watch] = await db
      .insert(schema.relearningOptions)
      .values({
        ownerId: ids.teacher,
        learningTargetId: ids.lt1,
        mode: "watch",
        title: "Watch: ionic bonds",
      })
      .returning();
    expect(watch.isPublished).toBe(false);
    await db.insert(schema.relearningSections).values([
      {
        optionId: watch.id,
        part: "core",
        body: { type: "video", youtubeId: "abc123", startSeconds: 30, endSeconds: 210 },
        checks: [
          {
            id: "c1",
            kind: "multiple_choice",
            prompt: "Which particle moves in an ionic bond?",
            options: [
              { id: "a", text: "Electron" },
              { id: "b", text: "Proton" },
            ],
            answer: "a",
            atSeconds: 95,
          },
        ],
        estMinutes: 4,
      },
      {
        optionId: watch.id,
        part: "extension",
        sortOrder: 1,
        body: { type: "text", text: "More examples" },
        shortAnswerPrompt: "In one sentence, what was your mistake?",
      },
    ]);
    const sections = await db
      .select()
      .from(schema.relearningSections)
      .where(eq(schema.relearningSections.optionId, watch.id));
    expect(sections.map((s) => s.part).sort()).toEqual(["core", "extension"]);
    const core = sections.find((s) => s.part === "core")!;
    expect(core.body).toEqual({
      type: "video",
      youtubeId: "abc123",
      startSeconds: 30,
      endSeconds: 210,
    });
    expect(core.checks[0].answer).toBe("a");
    expect(sections.find((s) => s.part === "extension")!.estMinutes).toBe(3);

    const why = await violation(
      db.insert(schema.relearningOptions).values({
        ownerId: ids.teacher,
        learningTargetId: ids.lt1,
        mode: "watch",
        title: "A second Watch",
      })
    );
    expect(why).toContain("relearning_options_owner_target_mode_unique");
  });

  it("refuses a section estimate outside 1–30 minutes", async () => {
    const { db, schema } = t;
    const [read] = await db
      .insert(schema.relearningOptions)
      .values({ ownerId: ids.teacher, learningTargetId: ids.lt1, mode: "read", title: "Read" })
      .returning();
    const why = await violation(
      db.insert(schema.relearningSections).values({
        optionId: read.id,
        part: "core",
        body: { type: "text", text: "x" },
        estMinutes: 0,
      })
    );
    expect(why).toContain("relearning_sections_minutes_range");
  });
});

describe("relearning rows (one per target, a quiz bundle shared)", () => {
  it("stitches a quiz's targets into one bundle and relearns each target once", async () => {
    const { db, schema } = t;
    const bundleId = crypto.randomUUID();
    const rows = await db
      .insert(schema.relearningPaths)
      .values([
        {
          assignmentId: ids.assignment,
          studentId: ids.student,
          learningTargetId: ids.lt1,
          bundleId,
          mode: "read",
        },
        {
          assignmentId: ids.assignment,
          studentId: ids.student,
          learningTargetId: ids.lt2,
          bundleId,
          mode: "read",
          added: true,
        },
      ])
      .returning();
    expect(rows.map((r) => r.bundleId)).toEqual([bundleId, bundleId]);
    expect(rows[0].progress).toEqual({});
    expect(rows[0].servedSectionIds).toEqual([]);

    const why = await violation(
      db.insert(schema.relearningPaths).values({
        assignmentId: ids.assignment,
        studentId: ids.student,
        learningTargetId: ids.lt1,
        bundleId: crypto.randomUUID(),
        mode: "do",
      })
    );
    expect(why).toContain("relearning_paths_target_unique");
  });

  it("needs a mode unless the teacher checked the step off", async () => {
    const { db, schema } = t;
    const [other] = await db
      .insert(schema.learningTargets)
      .values({ courseId: ids.course, code: "U3.LT3", title: "Metallic bonds" })
      .returning();
    const base = {
      assignmentId: ids.assignment,
      studentId: ids.student,
      learningTargetId: other.id,
      bundleId: crypto.randomUUID(),
    };
    const why = await violation(db.insert(schema.relearningPaths).values(base));
    expect(why).toContain("relearning_paths_mode_or_checked_off");
    const [checked] = await db
      .insert(schema.relearningPaths)
      .values({ ...base, checkedOffBy: ids.teacher, finishedAt: new Date() })
      .returning();
    expect(checked.mode).toBeNull();
  });

  it("keeps updated_at current", async () => {
    const { db, schema } = t;
    const [row] = await db
      .select()
      .from(schema.relearningPaths)
      .where(eq(schema.relearningPaths.learningTargetId, ids.lt1));
    const old = new Date("2026-01-01T00:00:00Z");
    await db
      .update(schema.relearningPaths)
      .set({ updatedAt: old })
      .where(eq(schema.relearningPaths.id, row.id));
    // The trigger overwrites any updated_at an update sets, so the old date never sticks.
    const [after] = await db
      .select()
      .from(schema.relearningPaths)
      .where(eq(schema.relearningPaths.id, row.id));
    expect(after.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });
});

describe("practice checks and rounds", () => {
  it("links a path check to its bundle and an attempt check to the attempt it unlocks", async () => {
    const { db, schema } = t;
    const base = {
      assignmentId: ids.assignment,
      studentId: ids.student,
      targetIds: [ids.lt1, ids.lt2],
      passMark: 4,
    };
    const bundle = crypto.randomUUID();

    expect(
      await violation(db.insert(schema.practiceChecks).values({ ...base, purpose: "path" }))
    ).toContain("practice_checks_purpose_link");
    expect(
      await violation(
        db
          .insert(schema.practiceChecks)
          .values({ ...base, purpose: "attempt", relearningBundleId: bundle })
      )
    ).toContain("practice_checks_purpose_link");
    expect(
      await violation(
        db
          .insert(schema.practiceChecks)
          .values({ ...base, purpose: "path", relearningBundleId: bundle, passMark: 6 })
      )
    ).toContain("practice_checks_pass_mark_range");

    const [pathCheck] = await db
      .insert(schema.practiceChecks)
      .values({ ...base, purpose: "path", relearningBundleId: bundle })
      .returning();
    expect(
      await violation(
        db
          .insert(schema.practiceChecks)
          .values({ ...base, purpose: "path", relearningBundleId: bundle })
      )
    ).toContain("practice_checks_path_unique");

    await db
      .insert(schema.practiceChecks)
      .values({ ...base, targetIds: [ids.lt1], purpose: "attempt", unlocksAttemptNumber: 3 });
    expect(
      await violation(
        db
          .insert(schema.practiceChecks)
          .values({ ...base, targetIds: [ids.lt1], purpose: "attempt", unlocksAttemptNumber: 3 })
      )
    ).toContain("practice_checks_attempt_unique");

    const [round] = await db
      .insert(schema.practiceCheckRounds)
      .values({
        checkId: pathCheck.id,
        number: 1,
        questionSet: [
          {
            questionId: crypto.randomUUID(),
            learningTargetId: ids.lt1,
            band: "easy",
            order: 0,
            points: 1,
          },
        ],
      })
      .returning();
    expect(round.answers).toEqual({});
    expect(round.score).toBeNull();
    expect(
      await violation(
        db
          .insert(schema.practiceCheckRounds)
          .values({ checkId: pathCheck.id, number: 1, questionSet: [] })
      )
    ).toContain("practice_check_rounds_unique");
    expect(
      await violation(
        db
          .insert(schema.practiceCheckRounds)
          .values({ checkId: pathCheck.id, number: 0, questionSet: [] })
      )
    ).toContain("practice_check_rounds_number_positive");
  });
});

describe("video flags and cascades", () => {
  it("flags a video once per student, and removing an option clears what hung off it", async () => {
    const { db, schema } = t;
    const [doOption] = await db
      .insert(schema.relearningOptions)
      .values({ ownerId: ids.teacher, learningTargetId: ids.lt2, mode: "do", title: "Do" })
      .returning();
    const [section] = await db
      .insert(schema.relearningSections)
      .values({
        optionId: doOption.id,
        part: "core",
        body: { type: "video", youtubeId: "blocked1" },
      })
      .returning();
    await db.insert(schema.relearningVideoFlags).values({
      sectionId: section.id,
      studentId: ids.student,
      assignmentId: ids.assignment,
      errorCode: "150",
    });
    expect(
      await violation(
        db
          .insert(schema.relearningVideoFlags)
          .values({ sectionId: section.id, studentId: ids.student })
      )
    ).toContain("relearning_video_flags_unique");

    await db
      .update(schema.relearningPaths)
      .set({ optionId: doOption.id, mode: "do" })
      .where(eq(schema.relearningPaths.learningTargetId, ids.lt2));
    await db.delete(schema.relearningOptions).where(eq(schema.relearningOptions.id, doOption.id));

    const [path] = await db
      .select()
      .from(schema.relearningPaths)
      .where(eq(schema.relearningPaths.learningTargetId, ids.lt2));
    expect(path.optionId).toBeNull();
    expect(path.mode).toBe("do");
    expect(
      await db
        .select()
        .from(schema.relearningSections)
        .where(eq(schema.relearningSections.optionId, doOption.id))
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.relearningVideoFlags)
        .where(eq(schema.relearningVideoFlags.sectionId, section.id))
    ).toEqual([]);
  });
});

describe("0030, 0031 and 0032 are re-runnable", () => {
  it("runs again on a database that already has it, keeping the data", async () => {
    const { client, db, schema } = t;
    const before = await db.select().from(schema.relearningPaths);
    for (const file of [
      "0030_relearning_revamp.sql",
      "0031_score_history.sql",
      "0032_kept_score.sql",
    ]) {
      const sql = readFileSync(`drizzle/${file}`, "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await client.exec(statement);
      }
    }
    const after = await db.select().from(schema.relearningPaths);
    expect(after.length).toBe(before.length);
    expect(after.length).toBeGreaterThan(0);
  });
});
