/**
 * CVTC rules (Jon, Oct 13 2026): recompute counting scores in a course with CVTC rules on that
 * still carry a corrections lift (earned before the rules came on, as migration 0027 turned them
 * on for Anatomy and Physiology). Runs after migrations on every deploy
 * (scripts/migrate-on-build.mjs) and finds nothing once they are settled; safe to run by hand:
 * `npx tsx --env-file=.env.local scripts/cvtc-leftovers.ts`.
 */
import { settleCvtcLeftovers } from "../src/lib/cvtc";

settleCvtcLeftovers()
  .then((n) => {
    console.log(`[cvtc] ${n ? `recomputed ${n} corrections-lifted scores` : "nothing to settle"}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[cvtc] failed:", e);
    process.exit(0); // never blocks a deploy; Regrade or the course switch settles them too
  });
