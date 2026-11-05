-- Re-runnable: preview builds share the live database (see 0023).
-- Read · Watch · Do edited in Bloom (Nov 5 2026): when the teacher last saved an option in the
-- app's editor, so a later content-pack revision keeps the teacher's edits. Additive only: one
-- nullable column.
ALTER TABLE "relearning_options" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;
