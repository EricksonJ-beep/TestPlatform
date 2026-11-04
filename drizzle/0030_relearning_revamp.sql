-- Re-runnable: preview builds share the live database (see 0023).
-- Relearning revamp, ticket R1 (Jon, Nov 4 2026; docs/relearning-revamp-plan.md): Read · Watch · Do
-- options made of core and extension sections, a student's relearning per target, 5-question
-- practice checks with their rounds, flags for videos that won't play, a per-course switch-on
-- moment (null = the v2 rules) and an assignment's practice-check pass mark. Additive only: the
-- running app never reads these until the later tickets ship, and nothing turns on before L1.
DO $$ BEGIN
  CREATE TYPE "public"."practice_check_purpose" AS ENUM('path', 'attempt');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."relearning_mode" AS ENUM('read', 'watch', 'do');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."relearning_part" AS ENUM('core', 'extension');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_check_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"question_set" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_check_rounds_number_positive" CHECK ("practice_check_rounds"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"purpose" "practice_check_purpose" NOT NULL,
	"target_ids" jsonb NOT NULL,
	"relearning_bundle_id" uuid,
	"unlocks_attempt_number" integer,
	"pass_mark" integer NOT NULL,
	"passed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_checks_purpose_link" CHECK (("practice_checks"."purpose" = 'path' and "practice_checks"."relearning_bundle_id" is not null and "practice_checks"."unlocks_attempt_number" is null) or ("practice_checks"."purpose" = 'attempt' and "practice_checks"."unlocks_attempt_number" is not null and "practice_checks"."relearning_bundle_id" is null)),
	CONSTRAINT "practice_checks_pass_mark_range" CHECK ("practice_checks"."pass_mark" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relearning_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL,
	"mode" "relearning_mode" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relearning_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL,
	"bundle_id" uuid NOT NULL,
	"mode" "relearning_mode",
	"option_id" uuid,
	"added" boolean DEFAULT false NOT NULL,
	"served_section_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"checked_off_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relearning_paths_mode_or_checked_off" CHECK ("relearning_paths"."mode" is not null or "relearning_paths"."checked_off_by" is not null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relearning_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"part" "relearning_part" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"title" text,
	"body" jsonb NOT NULL,
	"media_asset_id" uuid,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"short_answer_prompt" text,
	"est_minutes" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relearning_sections_minutes_range" CHECK ("relearning_sections"."est_minutes" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relearning_video_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid,
	"error_code" text,
	"hits" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "practice_pass" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "relearning_path_from" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_check_rounds_check_id_practice_checks_id_fk') THEN
    ALTER TABLE "practice_check_rounds" ADD CONSTRAINT "practice_check_rounds_check_id_practice_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."practice_checks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_checks_assignment_id_assignments_id_fk') THEN
    ALTER TABLE "practice_checks" ADD CONSTRAINT "practice_checks_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_checks_student_id_users_id_fk') THEN
    ALTER TABLE "practice_checks" ADD CONSTRAINT "practice_checks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_options_owner_id_users_id_fk') THEN
    ALTER TABLE "relearning_options" ADD CONSTRAINT "relearning_options_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_options_learning_target_id_learning_targets_id_fk') THEN
    ALTER TABLE "relearning_options" ADD CONSTRAINT "relearning_options_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_paths_assignment_id_assignments_id_fk') THEN
    ALTER TABLE "relearning_paths" ADD CONSTRAINT "relearning_paths_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_paths_student_id_users_id_fk') THEN
    ALTER TABLE "relearning_paths" ADD CONSTRAINT "relearning_paths_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_paths_learning_target_id_learning_targets_id_fk') THEN
    ALTER TABLE "relearning_paths" ADD CONSTRAINT "relearning_paths_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_paths_option_id_relearning_options_id_fk') THEN
    ALTER TABLE "relearning_paths" ADD CONSTRAINT "relearning_paths_option_id_relearning_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."relearning_options"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_paths_checked_off_by_users_id_fk') THEN
    ALTER TABLE "relearning_paths" ADD CONSTRAINT "relearning_paths_checked_off_by_users_id_fk" FOREIGN KEY ("checked_off_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_sections_option_id_relearning_options_id_fk') THEN
    ALTER TABLE "relearning_sections" ADD CONSTRAINT "relearning_sections_option_id_relearning_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."relearning_options"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_sections_media_asset_id_media_assets_id_fk') THEN
    ALTER TABLE "relearning_sections" ADD CONSTRAINT "relearning_sections_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_video_flags_section_id_relearning_sections_id_fk') THEN
    ALTER TABLE "relearning_video_flags" ADD CONSTRAINT "relearning_video_flags_section_id_relearning_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."relearning_sections"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_video_flags_student_id_users_id_fk') THEN
    ALTER TABLE "relearning_video_flags" ADD CONSTRAINT "relearning_video_flags_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_video_flags_assignment_id_assignments_id_fk') THEN
    ALTER TABLE "relearning_video_flags" ADD CONSTRAINT "relearning_video_flags_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relearning_video_flags_resolved_by_users_id_fk') THEN
    ALTER TABLE "relearning_video_flags" ADD CONSTRAINT "relearning_video_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_practice_pass_range') THEN
    ALTER TABLE "assignments" ADD CONSTRAINT "assignments_practice_pass_range" CHECK ("assignments"."practice_pass" between 1 and 5);
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_check_rounds_unique" ON "practice_check_rounds" USING btree ("check_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_checks_assignment_student_idx" ON "practice_checks" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_checks_path_unique" ON "practice_checks" USING btree ("assignment_id","student_id","relearning_bundle_id") WHERE "practice_checks"."purpose" = 'path';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_checks_attempt_unique" ON "practice_checks" USING btree ("assignment_id","student_id","unlocks_attempt_number") WHERE "practice_checks"."purpose" = 'attempt';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relearning_options_owner_target_mode_unique" ON "relearning_options" USING btree ("owner_id","learning_target_id","mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relearning_options_target_idx" ON "relearning_options" USING btree ("learning_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relearning_paths_target_unique" ON "relearning_paths" USING btree ("assignment_id","student_id","learning_target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relearning_paths_bundle_idx" ON "relearning_paths" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relearning_paths_student_idx" ON "relearning_paths" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relearning_sections_option_idx" ON "relearning_sections" USING btree ("option_id","part","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relearning_video_flags_unique" ON "relearning_video_flags" USING btree ("section_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relearning_video_flags_resolved_idx" ON "relearning_video_flags" USING btree ("resolved_at");--> statement-breakpoint
-- Keep updated_at current on the new tables (0001's trigger, which only covered tables that existed then).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['practice_check_rounds', 'practice_checks', 'relearning_options', 'relearning_paths', 'relearning_sections', 'relearning_video_flags']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
