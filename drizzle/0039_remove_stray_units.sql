-- Nov 19 2026: the Unit 3 Test and Unit 3 retake bank packs first shipped with a measurement
-- unit ("dots", "pairs", "atoms", "electrons") in the CSV's course-unit column, so the import
-- made four stray units in Jon's Physical Science A course. Remove them. Everything that points
-- at a unit (questions, banks, assessments, targets) is ON DELETE SET NULL, and the test and
-- the banks sit under "Unit 3 · Bonding" on their own unit_id, so nothing else changes.
-- Re-runnable: a second run finds nothing.
DELETE FROM "units" u
USING "courses" c, "users" t
WHERE u."course_id" = c."id"
  AND c."owner_id" = t."id"
  AND lower(t."email") = 'ericksonj@cadott.k12.wi.us'
  AND lower(c."name") = 'physical science a'
  AND u."name" IN ('dots', 'pairs', 'atoms', 'electrons')
  AND u."created_at" >= '2026-11-19T00:00:00Z';
