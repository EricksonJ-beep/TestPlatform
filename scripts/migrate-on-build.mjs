/**
 * Runs `drizzle-kit migrate` before `next build` when a database is configured,
 * so a deploy carries its own schema changes (Jon, Oct 1 2026: the dashboard
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
process.exit(r.status ?? 1);
