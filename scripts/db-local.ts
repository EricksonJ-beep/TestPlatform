/**
 * Local development database: an embedded PGlite Postgres served over the
 * wire protocol so Next's multi-process dev server, drizzle-kit, the seed
 * script, and any SQL client can all talk to the same data.
 *
 *   npm run db:local          → postgresql://postgres:postgres@127.0.0.1:5433/postgres
 *   PGLITE_DIR=… / PGLITE_PORT=… to override. Data lives in ./.pglite (gitignored).
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dataDir = process.env.PGLITE_DIR ?? ".pglite";
const port = Number(process.env.PGLITE_PORT ?? 5433);
const host = "127.0.0.1";

const db = await PGlite.create({ dataDir });
// Next dev renders in several worker processes; each keeps its own small pool.
const server = new PGLiteSocketServer({ db, port, host, maxConnections: 32 });

await server.start();
console.log(
  `[db:local] PGlite serving ${dataDir} at postgresql://postgres:postgres@${host}:${port}/postgres`
);
console.log("[db:local] Ctrl+C to stop.");

async function shutdown() {
  await server.stop();
  await db.close();
  console.log("[db:local] stopped");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
