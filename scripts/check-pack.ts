/**
 * Check a content pack's questions.csv before it ships: every row parses with
 * the real importer, and the mix is reported (types, difficulty bands, Bloom
 * levels, hints) with duplicate stems flagged. A pack's Read · Watch · Do options (`relearning`,
 * R4) are checked too; a pack with only those needs no questions.csv.
 *
 *   npx tsx scripts/check-pack.ts content/packs/<name>
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { difficultyBand } from "../src/lib/assessments/serve";
import { parseCsvRecords } from "../src/lib/csv";
import { parseQuestionRecords } from "../src/lib/import/question-csv";
import { relearningIssues, type PackRelearning } from "../src/lib/relearning-pack";

const dir = process.argv[2];
if (!dir) throw new Error("Pass the pack folder.");
const def = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8")) as {
  relearning?: PackRelearning[];
};
let relearningProblems = 0;
for (const r of def.relearning ?? []) {
  const issues = relearningIssues(r);
  relearningProblems += issues.length;
  for (const i of issues) console.log(i);
  console.log(
    `relearning ${r.target} ${r.mode}: ${r.sections.length} sections, ${r.sections.reduce((n, x) => n + (x.minutes ?? 3), 0)} min, ${r.sections.reduce((n, x) => n + (x.checks?.length ?? 0), 0)} checks`
  );
}
if (!existsSync(join(dir, "questions.csv"))) process.exit(relearningProblems ? 1 : 0);
const { records } = parseCsvRecords(readFileSync(join(dir, "questions.csv"), "utf8"));
const rows = parseQuestionRecords(records);
const tally = (f: (r: (typeof rows)[number]) => string) => {
  const m: Record<string, number> = {};
  for (const r of rows) m[f(r)] = (m[f(r)] ?? 0) + 1;
  return m;
};
let problems = 0;
for (const r of rows)
  for (const i of r.issues) {
    if (i.level === "error") problems++;
    console.log(`line ${r.line} ${i.level}: ${i.field ?? ""} ${i.message}`);
  }
const seen = new Map<string, number>();
for (const r of rows) {
  const k = r.stem.toLowerCase().replace(/\s+/g, " ").trim();
  if (seen.has(k)) {
    problems++;
    console.log(`line ${r.line} duplicate stem of line ${seen.get(k)}`);
  } else seen.set(k, r.line);
}
const noHint = rows.filter((r) => !r.hint).map((r) => r.line);
console.log(
  JSON.stringify(
    {
      rows: rows.length,
      targets: tally((r) => r.learningTarget),
      types: tally((r) => r.type),
      bands: tally((r) => difficultyBand(r.difficulty)),
      bloom: tally((r) => r.bloom ?? "none"),
      missingHint: noHint,
      missingExplanation: rows.filter((r) => !r.explanation).map((r) => r.line),
      errors: problems,
    },
    null,
    2
  )
);
process.exit(problems || relearningProblems ? 1 : 0);
