import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so load .env.local explicitly (.env too, if present).
loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "DATABASE_URL is not set (see .env.example). Locally, run `npm run db:local` first."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url },
});
