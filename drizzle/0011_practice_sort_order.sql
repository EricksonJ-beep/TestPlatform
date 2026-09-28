ALTER TABLE "practice_sets" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "relearning_activities" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;