/**
 * The relearning walkthrough's practice course and class (src/lib/walkthrough.ts), made before the
 * content packs apply so the `walkthrough-*` packs find them. Runs on every deploy (packs do too,
 * on preview builds against the live database); does nothing once both exist. Safe by hand:
 * `npx tsx --env-file=.env.local scripts/walkthrough-setup.ts`.
 */
import { ensureWalkthrough, readWalkthroughSetup } from "../src/lib/walkthrough";

ensureWalkthrough(readWalkthroughSetup())
  .then((o) => {
    console.log(
      o.status === "ready"
        ? `[walkthrough] ready${o.created.length ? `; created ${o.created.join(" and ")}` : ""}`
        : `[walkthrough] skipped (${o.reason})`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("[walkthrough] failed:", e);
    process.exit(0); // never blocks a deploy
  });
