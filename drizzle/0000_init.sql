CREATE TYPE "public"."activity_kind" AS ENUM('video', 'reading', 'link', 'guided_notes', 'worksheet');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('practice', 'formative', 'summative');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'graded');--> statement-breakpoint
CREATE TYPE "public"."bloom_level" AS ENUM('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('submitted', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."grading_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'audio', 'file');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('multiple_choice', 'multiple_select', 'true_false', 'matching', 'ordering', 'fill_blank', 'numeric', 'short_answer', 'extended_response', 'image_hotspot');--> statement-breakpoint
CREATE TYPE "public"."review_mode" AS ENUM('auto', 'teacher_approved');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('view', 'copy', 'co_edit');--> statement-breakpoint
CREATE TYPE "public"."share_resource_type" AS ENUM('question_bank', 'assessment');--> statement-breakpoint
CREATE TYPE "public"."stimulus_kind" AS ENUM('text', 'image', 'video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('teacher', 'student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."worksheet_counts_as" AS ENUM('practice', 'activity', 'both');--> statement-breakpoint
CREATE TYPE "public"."worksheet_event_type" AS ENUM('submit', 'progress');--> statement-breakpoint
CREATE TABLE "activity_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb,
	"teacher_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_targets" (
	"activity_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"question_id" uuid,
	"pool_id" uuid,
	"draw_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_questions_question_xor_pool" CHECK (("assessment_questions"."question_id" is not null and "assessment_questions"."pool_id" is null) or ("assessment_questions"."question_id" is null and "assessment_questions"."pool_id" is not null and "assessment_questions"."draw_count" > 0))
);
--> statement-breakpoint
CREATE TABLE "assessment_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"learning_target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"type" "assessment_type" NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"attempt_limit" integer,
	"review_mode" "review_mode" DEFAULT 'auto' NOT NULL,
	"retake_threshold" integer DEFAULT 80 NOT NULL,
	"optional_retakes" boolean DEFAULT true NOT NULL,
	"randomize_questions" boolean DEFAULT false NOT NULL,
	"randomize_options" boolean DEFAULT false NOT NULL,
	"one_at_a_time" boolean DEFAULT false NOT NULL,
	"allow_backtrack" boolean DEFAULT true NOT NULL,
	"show_results_immediately" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_threshold_range" CHECK ("assessments"."retake_threshold" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "assignment_final_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"per_target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_earned" double precision NOT NULL,
	"total_possible" double precision NOT NULL,
	"percent" double precision NOT NULL,
	"tier" integer,
	"targets_below_threshold" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL,
	"activity_id" uuid,
	"practice_set_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_pins_has_target_item" CHECK ("assignment_pins"."activity_id" is not null or "assignment_pins"."practice_set_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"access_code" text,
	"time_limit_minutes" integer,
	"attempts_allowed" integer,
	"review_mode" "review_mode" DEFAULT 'auto' NOT NULL,
	"retake_threshold" integer DEFAULT 80 NOT NULL,
	"optional_retakes" boolean DEFAULT true NOT NULL,
	"tier2_max" integer DEFAULT 2 NOT NULL,
	"results_released" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_threshold_range" CHECK ("assignments"."retake_threshold" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "attempt_target_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL,
	"points_earned" double precision NOT NULL,
	"points_possible" double precision NOT NULL,
	"percent" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"scope" jsonb,
	"question_set" jsonb NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"score" double precision,
	"max_score" double precision,
	"percent" double precision,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"graded_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"tab_switches" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"name" text NOT NULL,
	"period" text,
	"term" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"correct_answer" text NOT NULL,
	"explanation" text NOT NULL,
	"status" "correction_status" DEFAULT 'submitted' NOT NULL,
	"ai_flag" boolean DEFAULT false NOT NULL,
	"ai_note" text,
	"reviewer_id" uuid,
	"reviewer_note" text,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"unit_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"alt_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_questions" (
	"pool_id" uuid NOT NULL,
	"question_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_targets" (
	"pool_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"practice_set_id" uuid NOT NULL,
	"question_set" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" double precision,
	"max_score" double precision,
	"percent" double precision,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_set_questions" (
	"practice_set_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_set_targets" (
	"practice_set_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"pool_id" uuid,
	"draw_count" integer,
	"worksheet_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"match_text" text,
	"correct_position" integer,
	"feedback" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_standards" (
	"question_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_targets" (
	"question_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"bank_id" uuid,
	"title" text NOT NULL,
	"stem_template" text NOT NULL,
	"variables" jsonb NOT NULL,
	"answer_expression" text NOT NULL,
	"unit" text,
	"grading_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"unit_id" uuid,
	"type" "question_type" NOT NULL,
	"stem" text NOT NULL,
	"explanation" text,
	"points" integer DEFAULT 1 NOT NULL,
	"difficulty" integer DEFAULT 3 NOT NULL,
	"bloom" "bloom_level",
	"grading" "grading_mode" DEFAULT 'auto' NOT NULL,
	"grading_config" jsonb,
	"topic" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"media_asset_id" uuid,
	"media_url" text,
	"stimulus_id" uuid,
	"template_id" uuid,
	"external_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_difficulty_range" CHECK ("questions"."difficulty" between 1 and 5),
	CONSTRAINT "questions_points_nonneg" CHECK ("questions"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "relearning_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"media_asset_id" uuid,
	"url" text,
	"prompts" jsonb,
	"worksheet_id" uuid,
	"requires_teacher_verification" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" jsonb,
	"auto_score" double precision,
	"manual_score" double precision,
	"is_correct" boolean,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retake_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"learning_target_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"corrections_ok" boolean DEFAULT false NOT NULL,
	"activity_ok" boolean DEFAULT false NOT NULL,
	"practice_ok" boolean DEFAULT false NOT NULL,
	"unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" "share_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"shared_with_user_id" uuid NOT NULL,
	"permission" "share_permission" DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stimuli" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"course_id" uuid,
	"kind" "stimulus_kind" NOT NULL,
	"title" text,
	"ref" text,
	"content" text,
	"media_asset_id" uuid,
	"media_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"organization_id" uuid,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worksheet_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worksheet_id" uuid NOT NULL,
	"student_id" uuid,
	"email" text NOT NULL,
	"event" "worksheet_event_type" NOT NULL,
	"score" double precision,
	"section_scores" jsonb,
	"cards_correct" integer,
	"total_cards" integer,
	"total_checks" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worksheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"course_id" uuid,
	"script_id" text NOT NULL,
	"title" text,
	"student_url" text,
	"counts_as" "worksheet_counts_as" DEFAULT 'practice' NOT NULL,
	"section_target_map" jsonb,
	"registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_activity_id_relearning_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."relearning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_targets" ADD CONSTRAINT "activity_targets_activity_id_relearning_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."relearning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_targets" ADD CONSTRAINT "activity_targets_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_final_scores" ADD CONSTRAINT "assignment_final_scores_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_final_scores" ADD CONSTRAINT "assignment_final_scores_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_pins" ADD CONSTRAINT "assignment_pins_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_pins" ADD CONSTRAINT "assignment_pins_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_pins" ADD CONSTRAINT "assignment_pins_activity_id_relearning_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."relearning_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_pins" ADD CONSTRAINT "assignment_pins_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_target_scores" ADD CONSTRAINT "attempt_target_scores_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_target_scores" ADD CONSTRAINT "attempt_target_scores_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_targets" ADD CONSTRAINT "learning_targets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_targets" ADD CONSTRAINT "learning_targets_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_questions" ADD CONSTRAINT "pool_questions_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_questions" ADD CONSTRAINT "pool_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_targets" ADD CONSTRAINT "pool_targets_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_targets" ADD CONSTRAINT "pool_targets_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_questions" ADD CONSTRAINT "practice_set_questions_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_questions" ADD CONSTRAINT "practice_set_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_targets" ADD CONSTRAINT "practice_set_targets_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_targets" ADD CONSTRAINT "practice_set_targets_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_pool_id_question_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."question_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_worksheet_id_worksheets_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_pools" ADD CONSTRAINT "question_pools_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_standards" ADD CONSTRAINT "question_standards_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_standards" ADD CONSTRAINT "question_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_targets" ADD CONSTRAINT "question_targets_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_targets" ADD CONSTRAINT "question_targets_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."question_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_stimulus_id_stimuli_id_fk" FOREIGN KEY ("stimulus_id") REFERENCES "public"."stimuli"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_template_id_question_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."question_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relearning_activities" ADD CONSTRAINT "relearning_activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relearning_activities" ADD CONSTRAINT "relearning_activities_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relearning_activities" ADD CONSTRAINT "relearning_activities_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relearning_activities" ADD CONSTRAINT "relearning_activities_worksheet_id_worksheets_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_gates" ADD CONSTRAINT "retake_gates_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_gates" ADD CONSTRAINT "retake_gates_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retake_gates" ADD CONSTRAINT "retake_gates_learning_target_id_learning_targets_id_fk" FOREIGN KEY ("learning_target_id") REFERENCES "public"."learning_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stimuli" ADD CONSTRAINT "stimuli_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stimuli" ADD CONSTRAINT "stimuli_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stimuli" ADD CONSTRAINT "stimuli_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet_events" ADD CONSTRAINT "worksheet_events_worksheet_id_worksheets_id_fk" FOREIGN KEY ("worksheet_id") REFERENCES "public"."worksheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheet_events" ADD CONSTRAINT "worksheet_events_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_unique" ON "activity_completions" USING btree ("student_id","activity_id");--> statement-breakpoint
CREATE INDEX "activity_completions_activity_idx" ON "activity_completions" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_targets_pk" ON "activity_targets" USING btree ("activity_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "activity_targets_target_idx" ON "activity_targets" USING btree ("learning_target_id");--> statement-breakpoint
CREATE INDEX "assessment_questions_section_idx" ON "assessment_questions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "assessment_questions_question_idx" ON "assessment_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "assessment_sections_assessment_idx" ON "assessment_sections" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessments_owner_idx" ON "assessments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "assessments_course_idx" ON "assessments" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_final_scores_unique" ON "assignment_final_scores" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX "assignment_final_scores_student_idx" ON "assignment_final_scores" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "assignment_pins_assignment_idx" ON "assignment_pins" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignments_class_idx" ON "assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "assignments_assessment_idx" ON "assignments" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assignments_owner_idx" ON "assignments" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_target_scores_unique" ON "attempt_target_scores" USING btree ("attempt_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "attempt_target_scores_target_idx" ON "attempt_target_scores" USING btree ("learning_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_assignment_student_number_unique" ON "attempts" USING btree ("assignment_id","student_id","number");--> statement-breakpoint
CREATE INDEX "attempts_student_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attempts_assignment_idx" ON "attempts" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "classes_owner_idx" ON "classes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "classes_course_idx" ON "classes" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corrections_attempt_question_unique" ON "corrections" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "corrections_student_idx" ON "corrections" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "corrections_status_idx" ON "corrections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "courses_owner_idx" ON "courses" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_class_student_unique" ON "enrollments" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_targets_course_code_unique" ON "learning_targets" USING btree ("course_id",lower("code"));--> statement-breakpoint
CREATE INDEX "learning_targets_course_idx" ON "learning_targets" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_questions_pk" ON "pool_questions" USING btree ("pool_id","question_id");--> statement-breakpoint
CREATE INDEX "pool_questions_question_idx" ON "pool_questions" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pool_targets_pk" ON "pool_targets" USING btree ("pool_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "practice_attempts_student_idx" ON "practice_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "practice_attempts_set_idx" ON "practice_attempts" USING btree ("practice_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_set_questions_pk" ON "practice_set_questions" USING btree ("practice_set_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_set_targets_pk" ON "practice_set_targets" USING btree ("practice_set_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "practice_set_targets_target_idx" ON "practice_set_targets" USING btree ("learning_target_id");--> statement-breakpoint
CREATE INDEX "practice_sets_owner_idx" ON "practice_sets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "question_banks_owner_idx" ON "question_banks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "question_options_question_idx" ON "question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_pools_owner_idx" ON "question_pools" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_pools_course_name_unique" ON "question_pools" USING btree ("course_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "question_standards_pk" ON "question_standards" USING btree ("question_id","standard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_targets_pk" ON "question_targets" USING btree ("question_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "question_targets_target_idx" ON "question_targets" USING btree ("learning_target_id");--> statement-breakpoint
CREATE INDEX "question_templates_owner_idx" ON "question_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "questions_bank_idx" ON "questions" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "questions_owner_idx" ON "questions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "questions_stimulus_idx" ON "questions" USING btree ("stimulus_id");--> statement-breakpoint
CREATE INDEX "questions_template_idx" ON "questions" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_bank_external_id_unique" ON "questions" USING btree ("bank_id","external_id");--> statement-breakpoint
CREATE INDEX "relearning_activities_owner_idx" ON "relearning_activities" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_attempt_question_unique" ON "responses" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "responses_question_idx" ON "responses" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retake_gates_unique" ON "retake_gates" USING btree ("student_id","assignment_id","learning_target_id");--> statement-breakpoint
CREATE INDEX "retake_gates_assignment_idx" ON "retake_gates" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_resource_user_unique" ON "shares" USING btree ("resource_type","resource_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX "shares_shared_with_idx" ON "shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "shares_resource_idx" ON "shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standards_framework_code_unique" ON "standards" USING btree ("framework","code");--> statement-breakpoint
CREATE INDEX "stimuli_owner_idx" ON "stimuli" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stimuli_course_ref_unique" ON "stimuli" USING btree ("course_id",lower("ref"));--> statement-breakpoint
CREATE INDEX "units_course_idx" ON "units" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "worksheet_events_idempotent" ON "worksheet_events" USING btree ("worksheet_id","email","occurred_at");--> statement-breakpoint
CREATE INDEX "worksheet_events_student_idx" ON "worksheet_events" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "worksheets_script_id_unique" ON "worksheets" USING btree ("script_id");