/**
 * Summatives from content packs (Jon, Oct 20 2026): split a test built as one untargeted section
 * into one section per learning target, and give the attempts already taken their targets, so
 * per-target scores, corrections, and the retake plan appear (`src/lib/target-sections.ts`). Runs
 * after migrations on every production deploy (scripts/migrate-on-build.mjs; preview builds skip
 * it, as they share the live database) and finds nothing once done; safe to run by hand:
 * `npx tsx --env-file=.env.local scripts/summative-targets.ts`.
 */
import { settlesOnThisDeploy } from "../src/lib/cvtc";
import { retargetSummativeAttempts, splitUntargetedSummatives } from "../src/lib/target-sections";

if (!settlesOnThisDeploy(process.env.VERCEL_ENV)) {
  console.log(
    `[targets] skipped on a ${process.env.VERCEL_ENV} build: it shares the live database`
  );
  process.exit(0);
}

async function main() {
  const split = await splitUntargetedSummatives();
  const attempts = await retargetSummativeAttempts();
  console.log(
    `[targets] split ${split.length} summatives by target; retargeted ${attempts} attempts`
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[targets] failed:", e);
    process.exit(0); // never blocks a deploy; the next deploy finishes the job
  });
