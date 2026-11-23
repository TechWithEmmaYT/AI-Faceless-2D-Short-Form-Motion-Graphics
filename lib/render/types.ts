/**
 * The scene contract: what a video is made of, shared by the database (lib/db/app-schema.ts), the API,
 * the renderer and (later) the MCP tools. Canvas space is always 1080×1920 (9:16).
 *
 * Isolation rule: a frame draws exactly ONE scene — that scene's own layers, on a cleared canvas.
 * Nothing from a previous scene ever shows in the next one: an empty scene is a blank frame, layers
 * are clipped to their scene's duration, and joins only fade the incoming scene in from blank.
 */

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;
export const FPS = 30;

export type Box = { x: number; y: number; w: number; h: number };

export type Join = "cut" | "dissolve" | "swap";

type LayerBase = {
  id: string;
  /** Draw order inside the scene: lower first. */
  z: number;
  name: string;
  /** Scene seconds. */
  start: number;
  /** Scene seconds; null = until the scene ends. Never past the scene's end. */
  end: number | null;
  box: Box;
  opacity: number;
};

/** Agent-written drawing code: the body of function (ctx, t, u, w, h, p, M). Runs only in the sandbox. */
export type CodeLayer = LayerBase & {
  kind: "code";
  code: string;
  params: Record<string, unknown>;
  fonts: string[];
};

/** A built-in element (lib/render/elements) or, later, a saved project element, drawn with params. */
export type ElementLayer = LayerBase & {
  kind: "element";
  elementRef: string;
  params: Record<string, unknown>;
};

/** One script line as a caption: words appear on their times (or spread evenly), *key* words accented. */
export type CaptionLayer = LayerBase & {
  kind: "caption";
  text: string;
  style: CaptionStyle;
  /** Word times inside the layer (seconds from its start), when the voice provides them. */
  words?: { w: string; start: number; end: number }[];
};

export type CaptionStyle = {
  color?: string;
  accent?: string;
  /** px at 1080×1920. Never under 58 (3% of the height). */
  size?: number;
  weight?: number;
  align?: "center" | "left";
  /** "sans" (Inter) or "mono" (JetBrains Mono). */
  font?: "sans" | "mono";
  uppercase?: boolean;
};

export type Layer = CodeLayer | ElementLayer | CaptionLayer;

/** A layer before it has an id (Omit<Layer, "id"> would flatten the union and lose each kind's fields). */
export type NewLayer = Omit<CodeLayer, "id"> | Omit<ElementLayer, "id"> | Omit<CaptionLayer, "id">;

export type Scene = {
  id: string;
  position: number;
  shotId: string | null;
  title: string;
  durationSec: number;
  /** How this scene enters from the one before it. */
  join: Join;
  layers: Layer[];
};

/** Fonts resolved in the page (next/font gives hashed family names). */
export type RenderFonts = { sans: string; mono: string };
