CREATE TYPE "public"."opportunity_kind" AS ENUM('competitor_gap', 'source_gap', 'content_gap', 'cluster_gap');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'snoozed', 'dismissed', 'converted');--> statement-breakpoint
ALTER TYPE "public"."activity_event" ADD VALUE 'opportunity_dismissed';--> statement-breakpoint
ALTER TYPE "public"."activity_event" ADD VALUE 'opportunity_converted';--> statement-breakpoint
ALTER TYPE "public"."activity_event" ADD VALUE 'opportunities_refreshed';--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" "opportunity_kind" NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"score" integer NOT NULL,
	"score_version" smallint DEFAULT 1 NOT NULL,
	"score_breakdown" jsonb NOT NULL,
	"evidence_level" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_prompt_ids" uuid[] DEFAULT '{}' NOT NULL,
	"affected_cluster_ids" uuid[] DEFAULT '{}' NOT NULL,
	"competitor_names" text[] DEFAULT '{}' NOT NULL,
	"source_domain" text,
	"source_id" uuid,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"dismissed_reason" text,
	"snoozed_until" timestamp with time zone,
	"decision_score" integer,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "origin_opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_dedupe_idx" ON "opportunities" USING btree ("client_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "opportunities_list_idx" ON "opportunities" USING btree ("client_id","status","score");--> statement-breakpoint
CREATE INDEX "opportunities_generation_idx" ON "opportunities" USING btree ("client_id","generation_id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_origin_opportunity_id_opportunities_id_fk" FOREIGN KEY ("origin_opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;