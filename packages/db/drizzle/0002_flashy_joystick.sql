CREATE TYPE "public"."cadence" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('client', 'competitor', 'other');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('chatgpt', 'perplexity', 'gemini');--> statement-breakpoint
CREATE TYPE "public"."prompt_intent" AS ENUM('learning', 'comparison', 'purchase', 'other');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"position" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"entity_type" "entity_type" DEFAULT 'other' NOT NULL,
	"entity_name" text NOT NULL,
	"position" integer NOT NULL,
	"sentiment" "sentiment" DEFAULT 'neutral' NOT NULL,
	"is_client" boolean DEFAULT false NOT NULL,
	"is_competitor" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"intent" "prompt_intent" DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"geo" text DEFAULT 'us' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"model_version" text NOT NULL,
	"sample_index" integer DEFAULT 0 NOT NULL,
	"raw_text" text NOT NULL,
	"raw_storage_key" text,
	"latency_ms" integer,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"cadence" "cadence" DEFAULT 'weekly' NOT NULL,
	"platforms" "platform"[] DEFAULT '{"chatgpt"}' NOT NULL,
	"samples_per_prompt" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid,
	"client_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"trigger" "run_trigger" DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_clusters" ADD CONSTRAINT "prompt_clusters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_cluster_id_prompt_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."prompt_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_schedule_id_run_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."run_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citations_response_id_idx" ON "citations" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "citations_domain_idx" ON "citations" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "mentions_response_id_idx" ON "mentions" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "prompt_clusters_client_id_idx" ON "prompt_clusters" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "prompts_cluster_id_idx" ON "prompts" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "responses_run_id_idx" ON "responses" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "responses_prompt_id_idx" ON "responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_unique_sample_idx" ON "responses" USING btree ("run_id","prompt_id","platform","sample_index");--> statement-breakpoint
CREATE INDEX "run_schedules_next_run_at_idx" ON "run_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "runs_client_id_idx" ON "runs" USING btree ("client_id");