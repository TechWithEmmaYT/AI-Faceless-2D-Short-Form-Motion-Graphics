import { index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

/**
 * MotionStudio's own tables (docs/plans/2026-11-21-motionstudio-v1.md §2). Only `project` so far;
 * scene, layer, element, voice_clip, sound, render_request and mcp_activity arrive with the editor
 * and MCP phases.
 */

export const MOTION_STYLES = ["story-scene", "presenter", "system", "documentary"] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];

export const INPUT_MODES = ["idea", "script"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const TARGET_SECONDS = [30, 45, 60] as const;
export type TargetSeconds = (typeof TARGET_SECONDS)[number];

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Equals a Brief id in lib/agent/briefs — one name, no mapping table. */
    motionStyle: text("motion_style").$type<MotionStyle>().notNull(),
    inputMode: text("input_mode").$type<InputMode>().notNull(),
    /** The user's one-line idea or pasted script, ≤ 1000 characters. */
    brief: text("brief").notNull(),
    /** A goal handed to Claude Code, not a hard limit: 30, 45 or 60. */
    targetSeconds: integer("target_seconds").$type<TargetSeconds>().notNull(),
    /** Null until Claude Code saves an approved script (save_script). */
    script: text("script"),
    /** Null until Claude Code saves an approved storyboard (save_storyboard). */
    storyboard: jsonb("storyboard"),
    /** Bumped on every change that alters what the project renders; the studio polls it. */
    version: integer("version").notNull().default(1),
    selectedSceneId: text("selected_scene_id"),
    /** Last MCP tool call on this project — drives the studio's "Agent is working" pill. */
    agentActivityAt: timestamp("agent_activity_at"),
    agentActivity: text("agent_activity"),
    /** A still of the video (t = 1 s, 540×960 JPEG on Cloudinary) for Recents and Projects. */
    posterUrl: text("poster_url"),
    /** The project version the poster shows; the studio re-captures it when the version moves on. */
    posterVersion: integer("poster_version"),
    durationSec: real("duration_sec").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_userId_updatedAt_idx").on(table.userId, table.updatedAt.desc())],
);

export type Project = typeof project.$inferSelect;

/**
 * A scene: one storyboard shot, played in `position` order. Times inside it are scene-relative;
 * a scene's start in the video is the sum of the scenes before it (lib/render/timeline.ts).
 */
export const scene = pgTable(
  "scene",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** The storyboard shot this scene builds (Project.storyboard[].id). */
    shotId: text("shot_id"),
    title: text("title").notNull(),
    durationSec: real("duration_sec").notNull(),
    /** How this scene meets the next one: "cut" | "dissolve" | "swap". */
    join: text("join").$type<"cut" | "dissolve" | "swap">().notNull().default("cut"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("scene_projectId_position_idx").on(table.projectId, table.position)],
);

/**
 * A layer: one thing drawn in a scene, inside its box (1080×1920 px), from `start` to `end`
 * (scene seconds; null end = scene end). The shape of each kind is the contract in lib/render/types.ts.
 */
export const layer = pgTable(
  "layer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scene.id, { onDelete: "cascade" }),
    z: integer("z").notNull(),
    kind: text("kind").$type<"code" | "element" | "caption">().notNull(),
    name: text("name").notNull(),
    start: real("start").notNull().default(0),
    end: real("end"),
    box: jsonb("box").$type<{ x: number; y: number; w: number; h: number }>().notNull(),
    opacity: real("opacity").notNull().default(1),
    /** code layers: the body of function (ctx, t, u, w, h, p, M). Never run outside the sandbox. */
    code: text("code"),
    codeHash: text("code_hash"),
    /** element layers: a built-in element name or a project element id. */
    elementRef: text("element_ref"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    /** caption layers: one script line, with *key word* marks. */
    text: text("text"),
    style: jsonb("style").$type<Record<string, unknown>>(),
    fonts: jsonb("fonts").$type<string[]>().notNull().default([]),
    /** For the words-float check: the layer this label belongs to. */
    pinTo: text("pin_to"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("layer_sceneId_z_idx").on(table.sceneId, table.z)],
);

/**
 * A saved element: drawing code Claude Code wrote once and places by name, so anything that appears
 * twice (the hero, a room, a card) is identical every time. Unique by name within a project.
 * Built-in elements (lib/render/elements.ts) are not rows. The code only ever runs in the sandbox.
 */
export const element = pgTable(
  "element",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").$type<"hero" | "place" | "card" | "prop" | "other">().notNull().default("other"),
    description: text("description").notNull().default(""),
    /** The body of function (ctx, t, u, w, h, p, M). */
    code: text("code").notNull(),
    codeHash: text("code_hash").notNull(),
    defaultParams: jsonb("default_params").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("element_projectId_name_idx").on(table.projectId, table.name)],
);

/**
 * render_frames, relayed through the user's open editor (plan, Phase 6): the MCP tool inserts a
 * pending request and waits; the open studio claims it, renders with the same renderer as the preview,
 * runs the checks, and completes it with JPEG frames. Rows are deleted once read (or swept when stale).
 */
export const renderRequest = pgTable(
  "render_request",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    status: text("status").$type<"pending" | "claimed" | "done" | "failed">().notNull().default("pending"),
    request: jsonb("request").$type<RenderRequestSpec>().notNull(),
    result: jsonb("result").$type<RenderRequestResult>(),
    error: text("error"),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("render_request_projectId_status_idx").on(table.projectId, table.status)],
);

export type RenderRequestSpec =
  | { mode: "scene"; sceneId: string; times: number[]; longEdge: number }
  | { mode: "contact_sheet"; longEdge: number };

export type RenderCheck = { check: string; scene?: string; layer?: string; at?: number; message: string };

export type RenderRequestResult = {
  /** JPEG, base64 (no data: prefix). */
  frames: { label: string; data: string }[];
  checks: RenderCheck[];
  notes: string[];
};

/** One line of a voiceover: its script line number, its text, and where it sits in the file (seconds). */
export type VoiceLine = {
  line: number;
  text: string;
  start: number;
  end: number;
  /** Word timings inside the file, when Fish Audio speech_to_text (or Whisper) provided them. */
  words?: { w: string; start: number; end: number }[];
};

/**
 * A scene's voiceover: ONE file per scene (Fish Audio clips joined with their breaths), re-hosted on
 * Cloudinary under motionstudio/<userId>/<projectId>/voice/. The line times inside it set the
 * scene's timing. Replacing it (a fixed line) overwrites this row.
 */
export const voiceClip = pgTable(
  "voice_clip",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scene.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    url: text("url").notNull(),
    durationSec: real("duration_sec").notNull(),
    voiceName: text("voice_name").notNull(),
    lines: jsonb("lines").$type<VoiceLine[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("voice_clip_sceneId_idx").on(table.sceneId), index("voice_clip_projectId_idx").on(table.projectId)],
);

/**
 * A story sound ("sfx": pinned to a moment in one scene, only when the script names it) or the
 * optional music bed ("music": across the whole video, one per project). Hosted on Cloudinary under
 * motionstudio/<userId>/<projectId>/sound|music/.
 */
export const sound = pgTable(
  "sound",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"sfx" | "music">().notNull(),
    /** sfx: the scene it belongs to. music: null. */
    sceneId: text("scene_id").references(() => scene.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** sfx: scene seconds. music: video seconds. */
    atSec: real("at_sec").notNull().default(0),
    publicId: text("public_id").notNull(),
    url: text("url").notNull(),
    durationSec: real("duration_sec").notNull(),
    volume: real("volume").notNull(),
    trimStart: real("trim_start").notNull().default(0),
    /** Where to stop inside the file (seconds); null = the end of the file. */
    trimEnd: real("trim_end"),
    fadeIn: real("fade_in").notNull().default(0),
    fadeOut: real("fade_out").notNull().default(0),
    /** Where the file came from, e.g. "Fish Audio sound library" or "Openverse". */
    source: text("source").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("sound_projectId_idx").on(table.projectId), index("sound_sceneId_idx").on(table.sceneId)],
);
