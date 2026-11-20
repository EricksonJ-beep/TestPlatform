/**
 * Deletes the relearning walkthrough course and everything in it (Jon, Nov 20 2026;
 * src/lib/remove-walkthrough.ts). Runs after migrations on a production deploy only
 * (scripts/migrate-on-build.mjs) and does nothing once the course is gone. By hand:
 * `npx tsx --env-file=.env.local scripts/remove-walkthrough.ts`.
 */
import { settlesOnThisDeploy } from "../src/lib/cvtc";
import { removeWalkthrough } from "../src/lib/remove-walkthrough";

if (!settlesOnThisDeploy(process.env.VERCEL_ENV)) {
  console.log(`[walkthrough] skipped on a ${process.env.VERCEL_ENV} build: production removes it`);
  process.exit(0);
}

removeWalkthrough()
  .then((o) => {
    if (o.status === "removed")
      console.log(
        `[walkthrough] removed: ${o.classes} class(es), ${o.assignments} assignment(s) with ${o.attempts} attempt(s), ` +
          `${o.assessments} assessment(s), ${o.banks} bank(s), ${o.questions} question(s), ${o.packRows} pack record(s)`
      );
    else if (o.status === "absent")
      console.log(
        `[walkthrough] nothing to remove (${o.reason}); ${o.packRows} pack record(s) cleared`
      );
    else {
      console.error(`[walkthrough] NOT removed, nothing was deleted: ${o.reason}`);
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error("[walkthrough] failed partway; the next deploy finishes it:", e);
    process.exit(1);
  });
