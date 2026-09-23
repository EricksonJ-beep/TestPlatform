ALTER TABLE "responses" ADD COLUMN "grader_note" text;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "graded_by" uuid;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;