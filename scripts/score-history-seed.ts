/**
 * Score history (ticket R7): give the counting scores from before R7 their starting point
 * (`seedScoreHistory`). Runs after migrations on every production deploy
 * (scripts/migrate-on-build.mjs; preview builds skip it, as they share the live database) and finds
 * nothing once done; safe to run by hand: `npx tsx --env-file=.env.local scripts/score-history-seed.ts`.
 */
import { settlesOnThisDeploy } from "../src/lib/cvtc";
import { seedScoreHistory } from "../src/lib/score-history";

if (!settlesOnThisDeploy(process.env.VERCEL_ENV)) {
  console.log(
    `[history] skipped on a ${process.env.VERCEL_ENV} build: it shares the live database`
  );
  process.exit(0);
}

seedScoreHistory()
  .then((n) => {
    console.log(`[history] ${n ? `seeded ${n} score history rows` : "nothing to seed"}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[history] failed:", e);
    process.exit(0); // never blocks a deploy; the next deploy seeds what's left
  });
