import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so load .env.local explicitly.
loadEnv({ path: ".env.local", override: false });

const url = process.env.DATABASE_URL?.trim();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(url
    ? { dbCredentials: { url } }
    : { driver: "pglite", dbCredentials: { url: process.env.PGLITE_DIR ?? ".pglite" } }),
});
