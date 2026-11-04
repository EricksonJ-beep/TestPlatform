-- Re-runnable: preview builds share the live database (see 0023).
-- Score history, ticket R7 (Jon, Nov 4 2026; docs/relearning-revamp-plan.md G1): every change to a
-- student's counting score, so the gradebook can show "40 → 80 → 95", each step dated. Additive
-- only. Existing scores get their starting point from scripts/score-history-seed.ts on the first
-- production deploy (preview builds skip it, so the snapshot is taken when this code ships).
CREATE TABLE IF NOT EXISTS "score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"percent" double precision NOT NULL,
	"basis" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'score_history_assignment_id_assignments_id_fk') THEN
    ALTER TABLE "score_history" ADD CONSTRAINT "score_history_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'score_history_student_id_users_id_fk') THEN
    ALTER TABLE "score_history" ADD CONSTRAINT "score_history_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_history_pair_idx" ON "score_history" USING btree ("assignment_id","student_id","at");--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "score_history";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "score_history" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
