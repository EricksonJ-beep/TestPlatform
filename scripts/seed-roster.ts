/**
 * Load expected student names into a class (so they can claim them with the
 * join code) and make sure the class has a code. Idempotent on names.
 *
 *   npx tsx --env-file=.env.local scripts/seed-roster.ts --class "Biology · 3rd Hour" imports/biology-3rd-hour-roster.csv
 *
 * CSV columns: last_name,first_name (a header row is expected).
 */
import { readFileSync } from "node:fs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { parseCsvRecords } from "../src/lib/csv";
import { ensureJoinCode } from "../src/lib/join";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const log = (msg: string) => console.log(`[roster] ${msg}`);

async function main() {
  const file = process.argv.slice(2).find((a) => a.endsWith(".csv"));
  const className = arg("--class");
  const ownerEmail = (arg("--owner") ?? process.env.SEED_TEACHER_EMAIL)?.toLowerCase();
  if (!file || !className || !ownerEmail)
    throw new Error("Usage: seed-roster.ts <file.csv> --class <name> [--owner <email>]");
  const owner = await db.query.users.findFirst({
    columns: { id: true },
    where: sql`lower(${schema.users.email}) = ${ownerEmail}`,
  });
  if (!owner) throw new Error(`No user ${ownerEmail}`);
  const cls = await db.query.classes.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(schema.classes.ownerId, owner.id),
      sql`lower(${schema.classes.name}) = ${className.toLowerCase()}`
    ),
  });
  if (!cls) throw new Error(`No class "${className}" owned by ${ownerEmail}`);

  const { records } = parseCsvRecords(readFileSync(file, "utf8"));
  const key = (f: string, l: string) => `${f.trim().toLowerCase()}|${l.trim().toLowerCase()}`;
  const existing = new Set(
    (
      await db
        .select({ f: schema.rosterNames.firstName, l: schema.rosterNames.lastName })
        .from(schema.rosterNames)
        .where(eq(schema.rosterNames.classId, cls.id))
    ).map((r) => key(r.f, r.l))
  );
  let added = 0;
  for (const r of records) {
    const firstName = (r.first_name ?? "").trim();
    const lastName = (r.last_name ?? "").trim();
    if (!firstName || !lastName || existing.has(key(firstName, lastName))) continue;
    await db.insert(schema.rosterNames).values({ classId: cls.id, firstName, lastName });
    existing.add(key(firstName, lastName));
    added++;
  }
  const code = await ensureJoinCode(cls.id);
  const pending = await db.$count(
    schema.rosterNames,
    and(eq(schema.rosterNames.classId, cls.id), isNull(schema.rosterNames.studentId))
  );
  log(`"${cls.name}": added ${added} names · ${pending} waiting to join · join code ${code}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
