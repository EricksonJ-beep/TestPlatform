/**
 * Import an Appendix A question CSV from the command line, using the same
 * parser and planner as the in-app wizard. Dry run by default; --commit writes.
 *
 *   npx tsx --env-file=.env.local scripts/import-csv.ts imports/file.csv \
 *     --course "Anatomy and Physiology" --bank "CVTC · Unit 1 practice test" [--owner you@school.org] [--commit]
 *
 * The bank is created on the course (owned by --owner / SEED_TEACHER_EMAIL) when it doesn't exist.
 */
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { parseCsvRecords } from "../src/lib/csv";
import { missingHeaders, parseQuestionRecords } from "../src/lib/import/question-csv";
import { commitImport, planImport } from "../src/lib/import/question-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const log = (msg: string) => console.log(`[import] ${msg}`);

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  const courseName = arg("--course");
  const bankName = arg("--bank");
  const ownerEmail = (arg("--owner") ?? process.env.SEED_TEACHER_EMAIL)?.toLowerCase();
  const commit = process.argv.includes("--commit");
  if (!file || !courseName || !bankName || !ownerEmail)
    throw new Error(
      "Usage: import-csv.ts <file.csv> --course <name> --bank <name> [--owner <email>] [--commit]"
    );

  const owner = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(schema.users.email, ownerEmail),
  });
  if (!owner) throw new Error(`No user ${ownerEmail}`);
  const course = await db.query.courses.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(schema.courses.ownerId, owner.id),
      sql`lower(${schema.courses.name}) = ${courseName.toLowerCase()}`
    ),
  });
  if (!course) throw new Error(`No course "${courseName}" owned by ${ownerEmail}`);
  let bank = await db.query.questionBanks.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.questionBanks.ownerId, owner.id),
      eq(schema.questionBanks.courseId, course.id),
      sql`lower(${schema.questionBanks.name}) = ${bankName.toLowerCase()}`
    ),
  });
  if (!bank) {
    if (!commit) log(`bank "${bankName}" would be created on "${course.name}"`);
    else {
      [bank] = await db
        .insert(schema.questionBanks)
        .values({ ownerId: owner.id, courseId: course.id, name: bankName })
        .returning({ id: schema.questionBanks.id });
      log(`created bank "${bankName}" on "${course.name}"`);
    }
  }

  const { headers, records } = parseCsvRecords(readFileSync(file, "utf8"));
  const missing = missingHeaders(headers);
  if (missing.length) throw new Error(`Missing headers: ${missing.join(", ")}`);
  const rows = parseQuestionRecords(records);

  if (!bank) {
    // Dry run without a bank: report row-level parse status only.
    const bad = rows.filter((r) => r.status === "error");
    log(`${rows.length} rows parsed · ${bad.length} with errors`);
    for (const r of bad) log(`  line ${r.line}: ${r.issues.map((i) => i.message).join("; ")}`);
    return;
  }

  const plan = await planImport(bank.id, rows);
  log(
    `plan: ${plan.counts.insert} insert · ${plan.counts.update} update · ${plan.counts.skip} skip · ${plan.counts.error} errors`
  );
  for (const w of ["targets", "pools", "units", "stimuli", "standards"] as const)
    if (plan.willCreate[w].length) log(`  will create ${w}: ${plan.willCreate[w].join(", ")}`);
  for (const r of plan.rows)
    for (const i of r.issues)
      if (i.level !== "info") log(`  line ${r.line} ${i.level}: ${i.message}`);
  if (!commit) {
    log("dry run; add --commit to write");
    return;
  }
  const result = await commitImport(bank.id, rows);
  const n = result.counts;
  log(`done: ${n.inserted} inserted · ${n.updated} updated · ${n.skipped} skipped`);
  for (const r of result.rows) if (r.error) log(`  line ${r.line}: ${r.error}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
