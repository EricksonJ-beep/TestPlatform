-- Re-runnable: preview builds share the live database (see 0023).
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "kind" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "kind_order" integer;
