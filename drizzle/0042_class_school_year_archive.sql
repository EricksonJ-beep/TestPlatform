-- Re-runnable: preview builds share the live database (see 0023). Additive only: two nullable columns.
-- Jon, Nov 20 2026: a class carries its school year ("2026-27"), and a finished class can be archived.
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "school_year" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
-- Classes made before this get the school year they were created in (it turns over July 1,
-- school time). A year the teacher has set is left alone.
UPDATE "classes" c
SET "school_year" = y."start"::text || '-' || lpad(((y."start" + 1) % 100)::text, 2, '0')
FROM (
  SELECT "id",
    (extract(year from "created_at" AT TIME ZONE 'America/Chicago')::int
      - CASE WHEN extract(month from "created_at" AT TIME ZONE 'America/Chicago') >= 7 THEN 0 ELSE 1 END) AS "start"
  FROM "classes"
) y
WHERE c."id" = y."id" AND c."school_year" IS NULL;
