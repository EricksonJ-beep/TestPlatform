ALTER TABLE "assignment_final_scores" ADD COLUMN "basis" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "corrections_cap" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "retake_window_days" integer DEFAULT 7 NOT NULL;