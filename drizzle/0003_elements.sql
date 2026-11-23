CREATE TABLE "element" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"code_hash" text NOT NULL,
	"default_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "element_projectId_name_idx" ON "element" USING btree ("project_id","name");