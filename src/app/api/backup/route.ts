import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { publicRoute } from "@/lib/authz";
import { backupManifest, exportTable, listBackupTables } from "@/lib/backup";
import { clientAddress, isThrottled, recordFailure, THROTTLE, throttleKey } from "@/lib/throttle";

export const dynamic = "force-dynamic";
/** A large table is streamed a batch at a time; give it room. */
export const maxDuration = 300;

/** Constant-time compare of the shared secret; false for any length mismatch. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The weekly backup's source (hardening plan H7.3, docs/backup.md). Public by design: the
 * caller is Jon's Google Apps Script, which has no session; it proves itself with
 * X-Bloom-Backup-Secret (BLOOM_BACKUP_SECRET, 32+ characters). Without that variable the
 * route is off. Wrong secrets are counted and throttled by address.
 *
 *   GET /api/backup               → the manifest: every table and its row count (JSON)
 *   GET /api/backup?table=<name>  → that table, one JSON line per row, gzipped
 *
 * This hands out everything in the database, student records and password hashes included,
 * so the secret is the whole lock: it lives only in Vercel and in the script's properties.
 */
export const GET = publicRoute(async (req: Request) => {
  const expected = process.env.BLOOM_BACKUP_SECRET?.trim();
  if (!expected || expected.length < 32)
    return Response.json({ ok: false, error: "Backups are not set up." }, { status: 503 });
  const key = throttleKey("backup-from", await clientAddress());
  if (await isThrottled(key, THROTTLE.invite))
    return Response.json({ ok: false, error: "Too many tries." }, { status: 429 });
  if (!secretMatches(req.headers.get("x-bloom-backup-secret"), expected)) {
    await recordFailure(key, THROTTLE.invite);
    return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }

  const table = new URL(req.url).searchParams.get("table");
  if (!table) {
    return Response.json(await backupManifest(db), { headers: { "cache-control": "no-store" } });
  }
  if (!(await listBackupTables(db)).includes(table))
    return Response.json({ ok: false, error: "No such table." }, { status: 404 });

  const batches = exportTable(db, table);
  const encoder = new TextEncoder();
  const lines = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await batches.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value.join("\n") + "\n"));
    },
  });
  // The DOM and Node typings disagree about a gzip stream's chunk type; it is bytes in, bytes out.
  const gzip = new CompressionStream("gzip") as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  return new Response(lines.pipeThrough(gzip), {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": `attachment; filename="${table}.ndjson.gz"`,
      "cache-control": "no-store",
    },
  });
});
