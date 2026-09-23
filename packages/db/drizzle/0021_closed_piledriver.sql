CREATE TABLE "payment_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_events_occurred_at_idx" ON "payment_events" USING btree ("occurred_at");