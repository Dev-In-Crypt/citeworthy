CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."experiment_event" AS ENUM('action_shipped', 'indexed', 'first_new_citation', 'visibility_change', 'note');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('collecting', 'ready', 'inconclusive');--> statement-breakpoint
CREATE TABLE "experiment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"type" "experiment_event" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"treatment_before" numeric(5, 1),
	"treatment_after" numeric(5, 1),
	"control_before" numeric(5, 1),
	"control_after" numeric(5, 1),
	"incremental_pp" numeric(5, 1),
	"confidence" "confidence_level" DEFAULT 'low' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_results_experiment_id_unique" UNIQUE("experiment_id")
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"action_date" timestamp with time zone NOT NULL,
	"baseline_start" timestamp with time zone NOT NULL,
	"baseline_end" timestamp with time zone NOT NULL,
	"treatment_cluster_ids" uuid[] DEFAULT '{}' NOT NULL,
	"control_cluster_ids" uuid[] DEFAULT '{}' NOT NULL,
	"control_prompt_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" "experiment_status" DEFAULT 'collecting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_events" ADD CONSTRAINT "experiment_events_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_events_experiment_idx" ON "experiment_events" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiments_client_idx" ON "experiments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "experiments_action_idx" ON "experiments" USING btree ("action_id");