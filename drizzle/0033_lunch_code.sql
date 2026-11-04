-- Re-runnable: preview builds share the live database (see 0023).
-- A student's lunch code, Skyward's "Other ID" (Jon, Nov 5 2026), set from the class roster.
-- Additive only: one nullable column.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lunch_code" text;
