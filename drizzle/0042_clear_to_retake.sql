-- Re-runnable: preview builds share the live database (see 0023).
-- Jon, Nov 20 2026: "Clear to retake". The teacher marks a practice check passed because the
-- student did the work with them; who did it and why are kept on the check. Additive.
ALTER TABLE "practice_checks" ADD COLUMN IF NOT EXISTS "cleared_by" uuid;--> statement-breakpoint
ALTER TABLE "practice_checks" ADD COLUMN IF NOT EXISTS "clear_note" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_checks_cleared_by_users_id_fk') THEN
    ALTER TABLE "practice_checks" ADD CONSTRAINT "practice_checks_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
