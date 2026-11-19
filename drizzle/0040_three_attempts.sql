-- Jon, Nov 19 2026: "let's just make everything right now a default of minimum of three
-- attempts"; asked and answered "Biology + Physical Science". A test defaulted to one attempt,
-- and with no attempt left Bloom offers no retake, even to a student who wants to raise a
-- learning target. Raise Jon's Biology and Physical Science tests and quizzes that allow fewer
-- than three attempts to three: the assessment's default and every assignment of it. Unlimited
-- (null) and three or more are left alone; so are Anatomy and Physiology (CVTC, no retakes),
-- practice, and other teachers' work. Re-runnable: a second run finds nothing below three.
UPDATE "assignments" asg
SET "attempts_allowed" = 3
FROM "assessments" a, "courses" c, "users" t
WHERE asg."assessment_id" = a."id"
  AND a."course_id" = c."id"
  AND c."owner_id" = t."id"
  AND lower(t."email") = 'ericksonj@cadott.k12.wi.us'
  AND lower(c."name") IN ('biology a', 'biology b', 'physical science a', 'physical science b')
  AND a."type" IN ('formative', 'summative')
  AND asg."attempts_allowed" < 3;
--> statement-breakpoint
UPDATE "assessments" a
SET "attempt_limit" = 3
FROM "courses" c, "users" t
WHERE a."course_id" = c."id"
  AND c."owner_id" = t."id"
  AND lower(t."email") = 'ericksonj@cadott.k12.wi.us'
  AND lower(c."name") IN ('biology a', 'biology b', 'physical science a', 'physical science b')
  AND a."type" IN ('formative', 'summative')
  AND a."attempt_limit" < 3;
