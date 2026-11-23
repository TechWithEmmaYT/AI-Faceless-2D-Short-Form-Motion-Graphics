CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"motion_style" text NOT NULL,
	"input_mode" text NOT NULL,
	"brief" text NOT NULL,
	"target_seconds" integer NOT NULL,
	"script" text,
	"storyboard" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"selected_scene_id" text,
	"poster_url" text,
	"duration_sec" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_userId_updatedAt_idx" ON "project" USING btree ("user_id","updated_at" DESC NULLS LAST);