-- Re-runnable: preview builds share the live database (see 0023).
-- CVTC rules (Jon, Oct 13 2026): on for the course named "Anatomy and Physiology". The data step
-- runs only in the run that creates the column, so a re-run never turns it back on after Jon
-- switches it off on the course page.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'courses' AND column_name = 'cvtc_rules'
  ) THEN
    ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "cvtc_rules" boolean DEFAULT false NOT NULL;
    UPDATE "courses" SET "cvtc_rules" = true WHERE lower(btrim("name")) = 'anatomy and physiology';
  END IF;
END $$;
