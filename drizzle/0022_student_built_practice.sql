ALTER TABLE "practice_attempts" ALTER COLUMN "practice_set_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD COLUMN "target_ids" jsonb;--> statement-breakpoint
ALTER TABLE "question_banks" ADD COLUMN "open_practice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_attempts_course_idx" ON "practice_attempts" USING btree ("course_id");--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_source" CHECK ("practice_attempts"."practice_set_id" is not null or "practice_attempts"."course_id" is not null);