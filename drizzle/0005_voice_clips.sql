CREATE TABLE "voice_clip" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"public_id" text NOT NULL,
	"url" text NOT NULL,
	"duration_sec" real NOT NULL,
	"voice_name" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_clip" ADD CONSTRAINT "voice_clip_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_clip" ADD CONSTRAINT "voice_clip_scene_id_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_clip_sceneId_idx" ON "voice_clip" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "voice_clip_projectId_idx" ON "voice_clip" USING btree ("project_id");