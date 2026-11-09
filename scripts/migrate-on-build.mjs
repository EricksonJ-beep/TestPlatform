/**
 * Runs `drizzle-kit migrate`, then applies any new content packs, before `next build`
 * when a database is configured, so a deploy carries its own schema changes and quizzes (Jon, Oct 1 2026: the dashboard
 * went down when a merge shipped code for a table that had not been created).
 * With no DATABASE_URL (a plain local build, CI) it does nothing.
 *
 * Hardening plan H2.1 (Nov 9 2026): the build log says which database is being changed and by
 * what kind of build, a preview can be told to leave it alone (MIGRATE_ON_PREVIEW=0, see
 * migrate-decision.mjs), and a step that fails is reported at the end instead of passing silently.
 */
import { spawnSync } from "node:child_process";
import { databaseHost, migrateDecision } from "./migrate-decision.mjs";

const decision = migrateDecision(process.env);
if (!decision.run) {
  console.log(`migrate-on-build: skipping migrations and packs (${decision.reason}).`);
  process.exit(0);
}
const host = databaseHost(process.env.DATABASE_URL);
console.log(`migrate-on-build: ${decision.reason}, database ${host}.`);
if (decision.sharedPreview)
  console.log(
    "migrate-on-build: NOTE this is not a production build. If this database is the live one, " +
      "its schema changes now, before the pull request is merged. Set MIGRATE_ON_PREVIEW=0 to stop that."
  );

console.log("migrate-on-build: applying drizzle/ migrations…");
const r = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

/** Data steps after the schema. A failure doesn't stop the deploy (the fix may be in it); it is listed at the end. */
const failed = [];
const step = (label, script) => {
  console.log(`migrate-on-build: ${label}…`);
  const s = spawnSync("npx", ["tsx", script], { stdio: "inherit", shell: true });
  if (s.status !== 0) failed.push(`${script} (exit ${s.status ?? "none"})`);
};

// The relearning walkthrough (Jon, Nov 5 2026): its practice course and class, before the packs
// that fill them. Does nothing once they exist.
step("walkthrough course", "scripts/walkthrough-setup.ts");

// Content packs (Jon, Oct 2 2026): quizzes shipped in content/packs/ apply once, after migrations.
step("applying content packs", "scripts/apply-packs.ts");

// CVTC rules (Jon, Oct 13 2026): scores lifted by corrections before a course turned the rules on.
// Production deploys only: the script skips itself on a preview build (live database, main's code).
step("settling CVTC scores", "scripts/cvtc-leftovers.ts");

// Summatives from content packs (Jon, Oct 20 2026): one section per learning target, and the
// attempts already taken get their targets, so corrections and retakes appear. Production only.
step("splitting pack summatives by target", "scripts/summative-targets.ts");

// Score history (Nov 4 2026, R7): the scores from before it get their starting point. Production only.
step("seeding score history", "scripts/score-history-seed.ts");

if (failed.length) {
  console.error(
    `\nmigrate-on-build: WARNING ${failed.length} step(s) failed and were skipped:\n  ` +
      failed.join("\n  ") +
      "\nThe schema is up to date and the build continues; read the output above for each one.\n"
  );
}
process.exit(0);
