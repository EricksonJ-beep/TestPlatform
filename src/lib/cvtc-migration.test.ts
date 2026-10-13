/**
 * Migration 0027 (Jon, Oct 13 2026): CVTC rules come on for the course named
 * "Anatomy and Physiology" in the run that creates the column, and a re-run
 * (preview builds share the live database) never turns them back on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

const MIGRATION = readFileSync(join(process.cwd(), "drizzle/0027_course_cvtc_rules.sql"), "utf8");

describe("0027_course_cvtc_rules", () => {
  it("turns the rules on for Anatomy and Physiology only, and a re-run keeps Jon's later choice", async () => {
    const { client } = await createTestDb();
    const cvtc = async () =>
      (
        await client.query<{ name: string; cvtc_rules: boolean }>(
          "select name, cvtc_rules from courses order by name"
        )
      ).rows;
    await client.exec(`
      insert into users (id, email, password_hash, role, first_name, last_name)
        values ('00000000-0000-0000-0000-000000000001', 't@t', 'x', 'teacher', 'Jon', 'E');
      insert into courses (owner_id, name) values
        ('00000000-0000-0000-0000-000000000001', 'Anatomy and Physiology'),
        ('00000000-0000-0000-0000-000000000001', 'Biology A');
      alter table courses drop column cvtc_rules;
    `);
    // The first run, as on the live database: the column arrives and A&P turns on.
    await client.exec(MIGRATION);
    expect(await cvtc()).toEqual([
      { name: "Anatomy and Physiology", cvtc_rules: true },
      { name: "Biology A", cvtc_rules: false },
    ]);
    // Jon switches it off on the course page; running the migration again changes nothing.
    await client.exec("update courses set cvtc_rules = false");
    await client.exec(MIGRATION);
    expect((await cvtc()).every((c) => !c.cvtc_rules)).toBe(true);
  });
});
