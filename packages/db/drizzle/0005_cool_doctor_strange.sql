CREATE TYPE "public"."source_type" AS ENUM('owned', 'editorial', 'review', 'directory', 'ugc', 'social', 'product_feed', 'documentation', 'inaccessible', 'other');--> statement-breakpoint
CREATE TABLE "citation_sources" (
	"citation_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "citation_sources_citation_id_source_id_pk" PRIMARY KEY("citation_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "source_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"client_present" boolean DEFAULT false NOT NULL,
	"competitors_present" text[] DEFAULT '{}' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"source_type" "source_type",
	"classified_by" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "citation_sources" ADD CONSTRAINT "citation_sources_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_sources" ADD CONSTRAINT "citation_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_presence" ADD CONSTRAINT "source_presence_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_presence" ADD CONSTRAINT "source_presence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citation_sources_source_idx" ON "citation_sources" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_presence_client_source_idx" ON "source_presence" USING btree ("client_id","source_id");--> statement-breakpoint
CREATE INDEX "source_presence_client_idx" ON "source_presence" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_domain_idx" ON "sources" USING btree ("domain");