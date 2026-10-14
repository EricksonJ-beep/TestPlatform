-- Re-runnable: preview builds share the live database (see 0023).
-- Ask to retake on a closed test (Jon, Oct 14 2026): an approval reopens the test for one student
-- until the end of the next school day.
ALTER TABLE "attempt_unlocks" ADD COLUMN IF NOT EXISTS "open_until" timestamp with time zone;
