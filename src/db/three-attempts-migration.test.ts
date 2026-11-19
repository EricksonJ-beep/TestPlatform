/**
 * Migration 0040 (Jon, Nov 19 2026): Jon's Biology and Physical Science tests and quizzes that
 * allow fewer than three attempts go to three; everything else is left alone.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "@/test/db";

it("raises only Jon's Biology and Physical Science assignments below three attempts", async () => {
  const { db, schema } = await createTestDb();
  const [jon, other] = await db
    .insert(schema.users)
    .values([
      {
        email: "EricksonJ@cadott.k12.wi.us",
        passwordHash: "x",
        role: "teacher",
        firstName: "J",
        lastName: "E",
      },
      { email: "other@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
    ])
    .returning();
  const course = async (ownerId: string, name: string) =>
    (await db.insert(schema.courses).values({ ownerId, name }).returning())[0];
  const ps = await course(jon.id, "Physical Science A");
  const bio = await course(jon.id, "Biology B");
  const ap = await course(jon.id, "Anatomy and Physiology");
  const theirs = await course(other.id, "Physical Science A");
  const cases: [
    string,
    typeof ps,
    "practice" | "formative" | "summative",
    number | null,
    number | null,
  ][] = [
    ["ps test at 1", ps, "summative", 1, 3],
    ["bio quiz at 2", bio, "formative", 2, 3],
    ["ps test at 5", ps, "summative", 5, 5],
    ["ps test unlimited", ps, "summative", null, null],
    ["ps practice at 1", ps, "practice", 1, 1],
    ["anatomy practical at 1", ap, "summative", 1, 1],
    ["colleague test at 1", theirs, "summative", 1, 1],
  ];
  for (const [title, c, type, attempts] of cases) {
    const [a] = await db
      .insert(schema.assessments)
      .values({ ownerId: c.ownerId, courseId: c.id, title, type, attemptLimit: attempts })
      .returning();
    const [cls] = await db
      .insert(schema.classes)
      .values({ ownerId: c.ownerId, courseId: c.id, name: title })
      .returning();
    await db.insert(schema.assignments).values({
      ownerId: c.ownerId,
      assessmentId: a.id,
      classId: cls.id,
      attemptsAllowed: attempts,
    });
  }
  const file = readFileSync("drizzle/0040_three_attempts.sql", "utf8");
  for (let run = 0; run < 2; run++)
    for (const statement of file.split("--> statement-breakpoint"))
      await db.execute(sql.raw(statement));

  for (const [title, , , , expected] of cases) {
    const a = (await db.query.assessments.findFirst({
      where: eq(schema.assessments.title, title),
    }))!;
    const asg = (await db.query.assignments.findFirst({
      where: eq(schema.assignments.assessmentId, a.id),
    }))!;
    expect([title, a.attemptLimit, asg.attemptsAllowed]).toEqual([title, expected, expected]);
  }
});
