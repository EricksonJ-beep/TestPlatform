/**
 * Unit tests by learning target (Jon, Oct 19 2026, docs/retake-cycle-plan.md R1): every summative
 * still in one untargeted section moves into one section per target, when nobody has started it.
 * Tests with attempts are listed and left alone. Runs after content packs on every production
 * deploy (scripts/migrate-on-build.mjs; preview builds skip it, as they share the live database)
 * and finds nothing once settled; safe to run by hand:
 * `npx tsx --env-file=.env.local scripts/section-tests.ts`.
 */
import { settlesOnThisDeploy } from "../src/lib/cvtc";
import { resectionAllTests } from "../src/lib/test-sections";

if (!settlesOnThisDeploy(process.env.VERCEL_ENV)) {
  console.log(
    `[sections] skipped on a ${process.env.VERCEL_ENV} build: it shares the live database`
  );
  process.exit(0);
}

resectionAllTests()
  .then((rows) => {
    if (rows.length === 0) console.log("[sections] every test is already by learning target");
    for (const r of rows)
      console.log(
        r.outcome.status === "resectioned"
          ? `[sections] "${r.title}": ${r.outcome.sections} sections` +
              (r.outcome.untargeted ? `, ${r.outcome.untargeted} question(s) in Other` : "")
          : `[sections] "${r.title}": left as is (${r.outcome.reason})`
      );
    process.exit(0);
  })
  .catch((e) => {
    console.error("[sections] failed:", e);
    process.exit(0); // never blocks a deploy
  });
