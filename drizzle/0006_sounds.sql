CREATE TABLE "sound" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"scene_id" text,
	"name" text NOT NULL,
	"at_sec" real DEFAULT 0 NOT NULL,
	"public_id" text NOT NULL,
	"url" text NOT NULL,
	"duration_sec" real NOT NULL,
	"volume" real NOT NULL,
	"trim_start" real DEFAULT 0 NOT NULL,
	"trim_end" real,
	"fade_in" real DEFAULT 0 NOT NULL,
	"fade_out" real DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"credit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sound" ADD CONSTRAINT "sound_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound" ADD CONSTRAINT "sound_scene_id_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sound_projectId_idx" ON "sound" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sound_sceneId_idx" ON "sound" USING btree ("scene_id");