/**
 * Drizzle database client.
 *
 * DATABASE_URL decides the driver:
 *   - a Neon host (…neon.tech) → @neondatabase/serverless over HTTP (Vercel + Neon)
 *   - anything else            → node-postgres Pool (local dev against `npm run db:local`,
 *                                which serves an embedded PGlite Postgres on 127.0.0.1:5433)
 *
 * Server-only: import from server components, server actions, route handlers,
 * and scripts. Never from a "use client" module.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbDriver = "neon" | "pg";

declare global {
  // Survive Next.js dev hot reloads without opening a new pool each time.
  var __bloomDb: { db: Db; driver: DbDriver } | undefined;
}

export function isNeonUrl(url: string): boolean {
  return /neon\.tech/i.test(url) || process.env.DB_DRIVER === "neon";
}

function createDb(): { db: Db; driver: DbDriver } {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Locally: run `npm run db:local` and use the URL from .env.example. On Vercel: paste the Neon pooled connection string."
    );
  }
  if (isNeonUrl(url)) {
    return { db: drizzleNeon({ client: neon(url), schema }) as unknown as Db, driver: "neon" };
  }
  const pool = new Pool({ connectionString: url, max: 4 });
  return { db: drizzlePg({ client: pool, schema }) as unknown as Db, driver: "pg" };
}

const instance = globalThis.__bloomDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__bloomDb = instance;

export const db: Db = instance.db;
export const dbDriver: DbDriver = instance.driver;
export { schema };
