-- Re-runnable: preview builds share the live database (see 0023).
-- A teacher's "Also starts tests" switch (Jon, Nov 13 2026): while on, their resume code is also
-- accepted in place of the access code on any of their assignments.
-- Additive only: one column, off by default.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resume_code_starts_tests" boolean DEFAULT false NOT NULL;
