ALTER TABLE "assignments" ALTER COLUMN "retake_window_days" SET DEFAULT 14;
--> statement-breakpoint
-- Jon, Nov 19 2026: the retake window defaults to two weeks (it was 7 days) and now applies to
-- tests as well as capped quizzes. Move Jon's Biology and Physical Science assignments that still
-- carry the old default to 14. A window he set to anything else, or to 0 (none), is left alone,
-- as are Anatomy and Physiology and other teachers' work. Re-runnable.
UPDATE "assignments" asg
SET "retake_window_days" = 14
FROM "assessments" a, "courses" c, "users" t
WHERE asg."assessment_id" = a."id"
  AND a."course_id" = c."id"
  AND c."owner_id" = t."id"
  AND lower(t."email") = 'ericksonj@cadott.k12.wi.us'
  AND lower(c."name") IN ('biology a', 'biology b', 'physical science a', 'physical science b')
  AND asg."retake_window_days" = 7;
