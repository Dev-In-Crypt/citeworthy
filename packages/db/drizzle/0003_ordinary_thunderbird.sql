CREATE TABLE "visibility_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"cluster_id" uuid,
	"platform" "platform",
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"client_visibility_pct" numeric(5, 1) NOT NULL,
	"competitor_visibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_count" integer NOT NULL,
	"sufficient" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visibility_snapshots" ADD CONSTRAINT "visibility_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visibility_snapshots" ADD CONSTRAINT "visibility_snapshots_cluster_id_prompt_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."prompt_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visibility_snapshots_client_idx" ON "visibility_snapshots" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "visibility_snapshots_cell_idx" ON "visibility_snapshots" USING btree ("client_id","cluster_id","platform","period_start");