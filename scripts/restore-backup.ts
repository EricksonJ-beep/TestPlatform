/**
 * Restore a Bloom backup (docs/backup.md; hardening plan H7.3).
 *
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts "path/to/Bloom backup 2026-11-15"
 *
 * The folder is one weekly backup downloaded from Google Drive: manifest.json and one
 * <table>.ndjson.gz per table. DATABASE_URL must point at an EMPTY database that already has
 * the schema (`npm run db:migrate`). It never overwrites: a database with accounts is refused.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { db } from "../src/db";
import { restoreBackup, type BackupManifest } from "../src/lib/backup";

const folder = process.argv[2];
if (!folder || !existsSync(join(folder, "manifest.json"))) {
  console.error("Give the folder of one backup (the one that holds manifest.json).");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as BackupManifest;
if (manifest.app !== "bloom" || manifest.format !== 1) {
  console.error("That isn't a Bloom backup this version can read.");
  process.exit(1);
}
console.log(`[restore] backup taken ${manifest.takenAt}, ${manifest.tables.length} tables`);

async function* read(table: string): AsyncGenerator<string[]> {
  const file = join(folder, `${table}.ndjson.gz`);
  if (!existsSync(file)) {
    console.warn(`[restore] ${table}: no file in the backup, left empty`);
    return;
  }
  const lines = gunzipSync(readFileSync(file)).toString("utf8").split("\n").filter(Boolean);
  for (let i = 0; i < lines.length; i += 500) yield lines.slice(i, i + 500);
}

try {
  const loaded = await restoreBackup(db, manifest, read);
  let short = 0;
  for (const t of manifest.tables) {
    const n = loaded[t.name] ?? 0;
    if (n !== t.rows) short++;
    console.log(
      `[restore] ${t.name}: ${n} rows${n === t.rows ? "" : ` (the backup listed ${t.rows})`}`
    );
  }
  console.log(
    short
      ? `[restore] done; ${short} table(s) differ from the manifest (rows added while the backup ran).`
      : "[restore] done; every table matches the manifest."
  );
  process.exit(0);
} catch (err) {
  console.error("[restore] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
