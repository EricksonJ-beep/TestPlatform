ALTER TABLE "assignment_final_scores" ADD COLUMN "previous_tier" integer;--> statement-breakpoint
ALTER TABLE "assignment_final_scores" ADD COLUMN "tier_changed_at" timestamp with time zone;