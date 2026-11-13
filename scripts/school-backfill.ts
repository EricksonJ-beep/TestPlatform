/**
 * Records the school on accounts made before schools were recorded (hardening plan H4.8,
 * `ensureSingleSchool`). Runs after migrations on every build that migrates
 * (scripts/migrate-on-build.mjs): production, and a preview on its own database branch. It only
 * fills blanks, and finds nothing once done. By hand: `npx tsx --env-file=.env.local scripts/school-backfill.ts`.
 */
import { ensureSingleSchool } from "../src/lib/school";

ensureSingleSchool()
  .then((r) => {
    console.log(
      r.organizationId
        ? `[school] ${r.created ? "created the school; " : ""}${r.filled ? `recorded it on ${r.filled} accounts` : "nothing to fill"}`
        : "[school] more than one school exists; nothing guessed"
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("[school] failed:", e);
    process.exit(0); // never blocks a deploy; the next deploy fills what's left
  });
