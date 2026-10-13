-- Re-runnable: preview builds share the live database (see 0023).
CREATE TABLE IF NOT EXISTS "resume_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "pause_reason" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "remaining_ms" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "locked_question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "resume_requested_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_codes_teacher_id_users_id_fk') THEN
    ALTER TABLE "resume_codes" ADD CONSTRAINT "resume_codes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resume_codes_teacher_idx" ON "resume_codes" USING btree ("teacher_id");
