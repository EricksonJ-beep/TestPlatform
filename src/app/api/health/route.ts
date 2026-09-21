import { sql } from "drizzle-orm";
import { db, dbDriver } from "@/db";

export const dynamic = "force-dynamic";

/** Public liveness check: confirms the app can reach its database. Touches no user data. */
export async function GET() {
  try {
    const started = Date.now();
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      db: dbDriver,
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("health check failed", err);
    return Response.json({ ok: false, db: dbDriver, error: "database unreachable" }, { status: 503 });
  }
}
