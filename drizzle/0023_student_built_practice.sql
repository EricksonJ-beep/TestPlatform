-- Written to be re-runnable (Oct 13 2026): preview builds share the live database, and an
-- earlier preview of this branch applied these same changes under another migration number.
-- Also re-asserts 0022's questions.hint, which a database that recorded that earlier number
-- would otherwise skip (drizzle applies only migrations newer than the last one it recorded).
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "hint" text;--> statement-breakpoint
ALTER TABLE "practice_attempts" ALTER COLUMN "practice_set_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD COLUMN IF NOT EXISTS "course_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD COLUMN IF NOT EXISTS "target_ids" jsonb;--> statement-breakpoint
ALTER TABLE "question_banks" ADD COLUMN IF NOT EXISTS "open_practice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_attempts_course_id_courses_id_fk') THEN
    ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_attempts_course_idx" ON "practice_attempts" USING btree ("course_id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_attempts_source') THEN
    ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_source" CHECK ("practice_attempts"."practice_set_id" is not null or "practice_attempts"."course_id" is not null);
  END IF;
END $$;
