/**
 * Apply content packs (content/packs/*) that have not been applied yet.
 * Runs after migrations on every deploy (scripts/migrate-on-build.mjs); safe to
 * run by hand: `npx tsx --env-file=.env.local scripts/apply-packs.ts`.
 */
import { applyAllPacks } from "../src/lib/content-packs";

async function main() {
  const outcomes = await applyAllPacks();
  for (const o of outcomes) {
    if (o.status === "applied")
      console.log(`[packs] applied ${o.name}: ${JSON.stringify(o.summary)}`);
    else if (o.status === "already_applied")
      console.log(
        `[packs] ${o.name}: already applied${o.renamed.length ? `; renamed ${o.renamed.join(", ")}` : ""}`
      );
    else console.log(`[packs] ${o.name}: skipped (${o.reason})`);
  }
  if (outcomes.length === 0) console.log("[packs] no packs found");
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[packs] failed:", e);
    process.exit(0); // content never blocks a deploy; the log says what happened
  });
