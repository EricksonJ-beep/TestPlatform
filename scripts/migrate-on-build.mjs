/**
 * Runs `drizzle-kit migrate`, then applies any new content packs, before `next build`
 * when a database is configured, so a deploy carries its own schema changes and quizzes (Jon, Oct 1 2026: the dashboard
 * went down when a merge shipped code for a table that had not been created).
 * With no DATABASE_URL (a plain local build, CI) it does nothing.
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL?.trim()) {
  console.log("migrate-on-build: DATABASE_URL not set, skipping migrations.");
  process.exit(0);
}

console.log("migrate-on-build: applying drizzle/ migrations…");
const r = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

// The relearning walkthrough (Jon, Nov 5 2026): its practice course and class, before the packs
// that fill them. Does nothing once they exist.
console.log("migrate-on-build: walkthrough course…");
spawnSync("npx", ["tsx", "scripts/walkthrough-setup.ts"], { stdio: "inherit", shell: true });

// Content packs (Jon, Oct 2 2026): quizzes shipped in content/packs/ apply once, after migrations.
console.log("migrate-on-build: applying content packs…");
spawnSync("npx", ["tsx", "scripts/apply-packs.ts"], { stdio: "inherit", shell: true });

// CVTC rules (Jon, Oct 13 2026): scores lifted by corrections before a course turned the rules on.
// Production deploys only: the script skips itself on a preview build (live database, main's code).
console.log("migrate-on-build: settling CVTC scores…");
spawnSync("npx", ["tsx", "scripts/cvtc-leftovers.ts"], { stdio: "inherit", shell: true });

// Summatives from content packs (Jon, Oct 20 2026): one section per learning target, and the
// attempts already taken get their targets, so corrections and retakes appear. Production only.
console.log("migrate-on-build: splitting pack summatives by target…");
spawnSync("npx", ["tsx", "scripts/summative-targets.ts"], { stdio: "inherit", shell: true });

// Score history (Nov 4 2026, R7): the scores from before it get their starting point. Production only.
console.log("migrate-on-build: seeding score history…");
spawnSync("npx", ["tsx", "scripts/score-history-seed.ts"], { stdio: "inherit", shell: true });
process.exit(0);
