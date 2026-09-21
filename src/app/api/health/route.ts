import { sql } from "drizzle-orm";
import { db, dbDriver } from "@/db";
import { publicRoute } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** Public liveness check: confirms the app can reach its database. Touches no user data. */
export const GET = publicRoute(async () => {
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
    return Response.json(
      { ok: false, db: dbDriver, error: "database unreachable" },
      { status: 503 }
    );
  }
});
