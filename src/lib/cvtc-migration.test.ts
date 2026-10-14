/**
 * Migration 0027 (Jon, Oct 13 2026): CVTC rules come on for Jon's course named
 * "Anatomy and Physiology" (never another teacher's of the same name) in the run
 * that creates the column, and a re-run (preview builds share the live database)
 * never turns them back on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

const MIGRATION = readFileSync(join(process.cwd(), "drizzle/0027_course_cvtc_rules.sql"), "utf8");

describe("0027_course_cvtc_rules", () => {
  it("turns the rules on for Jon's Anatomy and Physiology only, and a re-run keeps his later choice", async () => {
    const { client } = await createTestDb();
    const cvtc = async () =>
      (
        await client.query<{ name: string; owner: string; cvtc_rules: boolean }>(
          "select c.name, u.first_name as owner, c.cvtc_rules from courses c join users u on u.id = c.owner_id order by c.name, u.first_name"
        )
      ).rows;
    await client.exec(`
      insert into users (id, email, password_hash, role, first_name, last_name) values
        ('00000000-0000-0000-0000-000000000001', 'EricksonJ@cadott.k12.wi.us', 'x', 'teacher', 'Jon', 'E'),
        ('00000000-0000-0000-0000-000000000002', 'colleague@cadott.k12.wi.us', 'x', 'teacher', 'Col', 'L');
      insert into courses (owner_id, name) values
        ('00000000-0000-0000-0000-000000000001', 'Anatomy and Physiology'),
        ('00000000-0000-0000-0000-000000000001', 'Biology A'),
        ('00000000-0000-0000-0000-000000000002', 'Anatomy and Physiology ');
      alter table courses drop column cvtc_rules;
    `);
    // The first run, as on the live database: the column arrives and Jon's A&P turns on; his
    // colleague's course of the same name stays as it was.
    await client.exec(MIGRATION);
    expect(await cvtc()).toEqual([
      { name: "Anatomy and Physiology", owner: "Jon", cvtc_rules: true },
      { name: "Anatomy and Physiology ", owner: "Col", cvtc_rules: false },
      { name: "Biology A", owner: "Jon", cvtc_rules: false },
    ]);
    // Jon switches it off on the course page; running the migration again changes nothing.
    await client.exec("update courses set cvtc_rules = false");
    await client.exec(MIGRATION);
    expect((await cvtc()).every((c) => !c.cvtc_rules)).toBe(true);
  });
});
