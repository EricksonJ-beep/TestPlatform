-- Re-runnable: preview builds share the live database (see 0023).
-- Hardening plan H5.3 (Nov 9 2026). Two indexes, no data change.
-- The per-test activity log reads by assignment.
CREATE INDEX IF NOT EXISTS "activity_log_assignment_idx" ON "activity_log" USING btree ("assignment_id");--> statement-breakpoint
-- Answers still waiting for a teacher's score (the Dashboard's "answers to grade" and the grading queue).
CREATE INDEX IF NOT EXISTS "responses_ungraded_idx" ON "responses" USING btree ("attempt_id") WHERE "responses"."auto_score" is null and "responses"."manual_score" is null;
