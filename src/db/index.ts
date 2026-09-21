/**
 * Drizzle database client.
 *
 * Production / any env with DATABASE_URL: Neon serverless over HTTP.
 * Local dev without DATABASE_URL: an embedded PGlite Postgres in ./.pglite so the
 * app, migrations, seed, and tests run with no external service.
 *
 * Server-only: import this from server components, server actions, route
 * handlers, and scripts. Never from a "use client" module.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbDriver = "neon" | "pglite";

declare global {
  // Survive Next.js dev hot reloads without opening a second PGlite on the same directory.
  var __bloomDb: { db: Db; driver: DbDriver } | undefined;
}

export const PGLITE_DIR = process.env.PGLITE_DIR ?? ".pglite";

async function createDb(): Promise<{ db: Db; driver: DbDriver }> {
  const url = process.env.DATABASE_URL;
  if (url && url.trim() !== "") {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const client = neon(url);
    return { db: drizzle({ client, schema }) as unknown as Db, driver: "neon" };
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PGLITE_IN_PRODUCTION) {
    throw new Error("DATABASE_URL is not set. Add the Neon pooled connection string.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(PGLITE_DIR);
  return { db: drizzle({ client, schema }) as unknown as Db, driver: "pglite" };
}

const instance = globalThis.__bloomDb ?? (await createDb());
if (process.env.NODE_ENV !== "production") globalThis.__bloomDb = instance;

export const db: Db = instance.db;
export const dbDriver: DbDriver = instance.driver;
export { schema };
