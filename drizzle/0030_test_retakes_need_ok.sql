-- Jon, Oct 19 2026 (docs/retake-cycle-plan.md R4): a unit test's retakes always wait for the
-- teacher's OK. New and edited assignments enforce it in code; this turns it on for existing ones.
UPDATE "assignments" SET "retakes_need_unlock" = true
FROM "assessments"
WHERE "assessments"."id" = "assignments"."assessment_id"
  AND "assessments"."type" = 'summative'
  AND "assignments"."retakes_need_unlock" = false;
