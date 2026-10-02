CREATE TABLE "content_packs" (
	"name" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);
