-- Re-runnable: preview builds share the live database (see 0023).
-- Skyward updates (Jon, Nov 5 2026): the score Bloom last handed Jon for each student in each
-- Skyward column of an assignment, so the page can list only the grades that changed since.
-- Additive only: one new table.
CREATE TABLE IF NOT EXISTS "skyward_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"column_key" text NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"source" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skyward_marks_assignment_id_assignments_id_fk') THEN
    ALTER TABLE "skyward_marks" ADD CONSTRAINT "skyward_marks_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skyward_marks_student_id_users_id_fk') THEN
    ALTER TABLE "skyward_marks" ADD CONSTRAINT "skyward_marks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skyward_marks_cell_unique" ON "skyward_marks" USING btree ("assignment_id","column_key","student_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON "skyward_marks";--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "skyward_marks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
