CREATE TABLE "attempt_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"requested_at" timestamp with time zone,
	"granted_by" uuid,
	"granted_at" timestamp with time zone,
	CONSTRAINT "attempt_unlocks_number_min" CHECK ("attempt_unlocks"."attempt_number" >= 2)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "retakes_need_unlock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt_unlocks" ADD CONSTRAINT "attempt_unlocks_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_unlocks" ADD CONSTRAINT "attempt_unlocks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_unlocks" ADD CONSTRAINT "attempt_unlocks_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_unlocks_assignment_student_number_unique" ON "attempt_unlocks" USING btree ("assignment_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "attempt_unlocks_student_idx" ON "attempt_unlocks" USING btree ("student_id");