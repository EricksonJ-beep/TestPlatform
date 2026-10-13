-- Re-runnable: preview builds share the live database (see 0023).
ALTER TABLE "question_banks" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
ALTER TABLE "question_banks" ADD COLUMN IF NOT EXISTS "kind_order" integer;
