-- Re-runnable: preview builds share the live database (see 0023).
-- Hardening plan H4.1–H4.2 (Nov 9 2026). Additive only: one new table, one nullable column.
-- auth_throttle: failed tries at something guessable (login, join code, access code, resume code).
CREATE TABLE IF NOT EXISTS "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- When the password last changed; a session that began before it is signed out.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;
