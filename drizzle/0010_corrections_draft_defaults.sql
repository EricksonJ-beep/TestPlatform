ALTER TABLE "corrections" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "submitted_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "corrections" ALTER COLUMN "submitted_at" DROP NOT NULL;