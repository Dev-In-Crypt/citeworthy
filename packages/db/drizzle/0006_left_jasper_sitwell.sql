CREATE TYPE "public"."action_status" AS ENUM('backlog', 'in_progress', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."action_type" AS ENUM('refresh_page', 'create_page', 'technical_fix', 'structured_data_fix', 'crawler_fix', 'source_outreach', 'review_platform', 'pr_editorial', 'ugc_community', 'product_data_update');--> statement-breakpoint
CREATE TYPE "public"."impact_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"action_type" "action_type" NOT NULL,
	"source_id" uuid,
	"source_domain" text,
	"affected_cluster_ids" uuid[] DEFAULT '{}' NOT NULL,
	"estimated_impact" "impact_level" DEFAULT 'medium' NOT NULL,
	"effort" "impact_level" DEFAULT 'medium' NOT NULL,
	"owner_user_id" uuid,
	"status" "action_status" DEFAULT 'backlog' NOT NULL,
	"origin_rule" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_client_idx" ON "actions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "actions_status_idx" ON "actions" USING btree ("status");