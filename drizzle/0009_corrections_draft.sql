ALTER TYPE "public"."correction_status" ADD VALUE 'draft' BEFORE 'submitted';--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "submitted_at" DROP NOT NULL;