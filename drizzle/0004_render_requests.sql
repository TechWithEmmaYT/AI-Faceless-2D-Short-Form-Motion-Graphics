CREATE TABLE "render_request" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "agent_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "agent_activity" text;--> statement-breakpoint
ALTER TABLE "render_request" ADD CONSTRAINT "render_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_request_projectId_status_idx" ON "render_request" USING btree ("project_id","status");