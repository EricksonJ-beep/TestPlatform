-- Re-runnable: preview builds share the live database (see 0023).
-- "Keep my 80%" (relearning revamp decision 28, ticket R5): when a student keeps a quiz's raised
-- score for now. Additive only: one nullable column.
ALTER TABLE "assignment_final_scores" ADD COLUMN IF NOT EXISTS "kept_at" timestamp with time zone;
