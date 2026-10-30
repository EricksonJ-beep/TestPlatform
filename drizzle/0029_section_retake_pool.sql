-- Re-runnable: preview builds share the live database (see 0023).
-- Targeted retakes draw fresh questions (Jon, Oct 30 2026): a summative section can name a retake
-- pool and a count; a retake covering the section's target serves that draw instead of the
-- section's own questions.
ALTER TABLE "assessment_sections" ADD COLUMN IF NOT EXISTS "retake_pool_id" uuid;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD COLUMN IF NOT EXISTS "retake_draw_count" integer;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_sections_retake_pool_id_question_pools_id_fk') THEN
    ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_retake_pool_id_question_pools_id_fk" FOREIGN KEY ("retake_pool_id") REFERENCES "public"."question_pools"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
