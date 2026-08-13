CREATE TYPE "public"."adapters_mode" AS ENUM('mock', 'live');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "adapters_mode" "adapters_mode" DEFAULT 'mock' NOT NULL;