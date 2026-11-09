-- Re-runnable: preview builds share the live database (see 0023).
-- Hardening plan H6.1 (Nov 9 2026): what a question's picture shows, for screen readers.
-- Additive only: one nullable column.
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "media_alt" text;
