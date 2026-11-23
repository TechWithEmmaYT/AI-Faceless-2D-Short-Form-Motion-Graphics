CREATE TABLE "layer" (
	"id" text PRIMARY KEY NOT NULL,
	"scene_id" text NOT NULL,
	"z" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"start" real DEFAULT 0 NOT NULL,
	"end" real,
	"box" jsonb NOT NULL,
	"opacity" real DEFAULT 1 NOT NULL,
	"code" text,
	"code_hash" text,
	"element_ref" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text,
	"style" jsonb,
	"fonts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pin_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"position" integer NOT NULL,
	"shot_id" text,
	"title" text NOT NULL,
	"duration_sec" real NOT NULL,
	"join" text DEFAULT 'cut' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "layer" ADD CONSTRAINT "layer_scene_id_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene" ADD CONSTRAINT "scene_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "layer_sceneId_z_idx" ON "layer" USING btree ("scene_id","z");--> statement-breakpoint
CREATE INDEX "scene_projectId_position_idx" ON "scene" USING btree ("project_id","position");