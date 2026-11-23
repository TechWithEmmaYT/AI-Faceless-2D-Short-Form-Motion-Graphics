import { ELEMENTS } from "./elements";
import { M, clamp, eo, marked, pg } from "./helpers";
import { sceneAt } from "./timeline";
import { CANVAS_H, CANVAS_W, type CaptionLayer, type Layer, type RenderFonts, type Scene } from "./types";

/**
 * The renderer: render(ctx, scenes, t) draws the video at time t. Pure — everything is computed
 * from t, nothing is kept between frames — so the preview, render_frames, thumbnails and export
 * are one code path. ctx must already be scaled so 1 unit = 1px of the 1080×1920 canvas.
 *
 * Isolation: each frame clears the canvas and draws ONE scene's own layers (see types.ts).
 */

export type SavedElement = { code: string; codeHash: string; defaultParams: Record<string, unknown> };

/** Compiled agent code, cached per code hash. Only the sandbox ever creates one of these. */
export type CodeRuntime = {
  compile: (key: string, body: string) => DrawFn;
};
export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, u: number, w: number, h: number, p: Record<string, unknown>, m: typeof M) => void;

export type RenderEnv = {
  fonts: RenderFonts;
  /** Stage colour an empty scene shows and a dissolve fades in from. */
  blank: string;
  /**
   * Runs agent-written code (code layers, saved elements). Present ONLY inside the sandboxed render
   * host; everywhere else (thumbnails, element previews) agent code draws a labelled placeholder.
   */
  code?: CodeRuntime;
  /** The project's saved elements, by name. */
  elements?: Map<string, SavedElement>;
  /** Called before each layer draws (lets checks attribute text to a layer). */
  onLayer?: (layer: Layer) => void;
  /** Called when a layer throws; the frame still renders with an error box in its place. */
  onError?: (layer: Layer, message: string) => void;
};

/** Compiles agent code once per key. Used by the sandboxed render host only. */
export function createCodeRuntime(): CodeRuntime {
  const cache = new Map<string, DrawFn>();
  return {
    compile(key, body) {
      let fn = cache.get(key);
      if (!fn) {
        fn = new Function("ctx", "t", "u", "w", "h", "p", "M", body) as DrawFn;
        cache.set(key, fn);
      }
      return fn;
    },
  };
}

const JOIN_SECONDS = 0.4;

/** Draws the whole video at video time t. */
export function render(ctx: CanvasRenderingContext2D, scenes: Scene[], t: number, env: RenderEnv) {
  const at = sceneAt(scenes, t);
  clear(ctx, env.blank);
  if (!at) return;
  renderScene(ctx, at.scene, at.local, env, at.index > 0);
}

/** Draws one scene at scene time `local` — on its own, never with another scene's layers. */
export function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, local: number, env: RenderEnv, applyJoin = false) {
  clear(ctx, env.blank);
  // A layer can't outlive its scene: clamp time to the scene's length.
  const time = clamp(local, 0, Math.max(0, scene.durationSec));

  ctx.save();
  // Joins only bring THIS scene in from blank; they never blend the previous scene into it.
  if (applyJoin && scene.join === "dissolve") ctx.globalAlpha = eo(pg(time, 0, JOIN_SECONDS));
  if (applyJoin && scene.join === "swap") {
    const k = eo(pg(time, 0, JOIN_SECONDS));
    ctx.translate(0, (1 - k) * 80);
    ctx.globalAlpha = k;
  }

  const layers = [...scene.layers].sort((a, b) => a.z - b.z);
  for (const layer of layers) {
    const end = Math.min(layer.end ?? scene.durationSec, scene.durationSec);
    if (time < layer.start || time >= end) continue;
    drawLayer(ctx, layer, time - layer.start, end - layer.start, env);
  }
  ctx.restore();
}

function clear(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.setTransform(ctx.getTransform()); // keep the caller's scale
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, t: number, length: number, env: RenderEnv) {
  const { x, y, w, h } = layer.box;
  const u = length > 0 ? clamp(t / length, 0, 1) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= clamp(layer.opacity, 0, 1);
  env.onLayer?.(layer);
  try {
    if (layer.kind === "element") {
      const builtIn = ELEMENTS[layer.elementRef];
      const saved = env.elements?.get(layer.elementRef);
      if (builtIn) builtIn.draw(ctx, t, u, w, h, { ...builtIn.defaultParams, ...layer.params }, M, env.fonts);
      else if (saved && env.code) env.code.compile(`el:${saved.codeHash}`, saved.code)(ctx, t, u, w, h, { ...saved.defaultParams, ...layer.params }, M);
      else if (saved) placeholder(ctx, w, h, `element "${layer.elementRef}" · draws in the preview`, env);
      else placeholder(ctx, w, h, `unknown element "${layer.elementRef}"`, env);
    } else if (layer.kind === "caption") {
      drawCaption(ctx, layer, t, length, w, h, env);
    } else if (env.code) {
      // Agent-written code: only ever executed here when env.code exists, i.e. inside the sandbox.
      env.code.compile(`code:${layer.id}:${layer.code.length}:${hashish(layer.code)}`, layer.code)(ctx, t, u, w, h, layer.params, M);
    } else {
      placeholder(ctx, w, h, `code layer "${layer.name}" · draws in the preview`, env);
    }
  } catch (error) {
    env.onError?.(layer, error instanceof Error ? error.message : String(error));
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    placeholder(ctx, w, h, `layer error: ${layer.name}`, env, true);
  }
  ctx.restore();
}

/** Words appear on their times (voice word timing) or spread evenly across the line; *key* words take the accent. */
function drawCaption(ctx: CanvasRenderingContext2D, layer: CaptionLayer, t: number, length: number, w: number, h: number, env: RenderEnv) {
  const s = layer.style ?? {};
  const words = marked(s.uppercase ? layer.text.toUpperCase() : layer.text);
  if (!words.length) return;
  const size = Math.max(58, s.size ?? 72);
  const family = s.font === "mono" ? env.fonts.mono : env.fonts.sans;
  ctx.font = `${s.weight ?? 800} ${size}px ${family}`;
  ctx.textBaseline = "middle";

  // Word-wrap into lines that fit the box.
  const space = ctx.measureText(" ").width;
  const lines: { w: string; key: boolean; width: number; index: number }[][] = [[]];
  let lineWidth = 0;
  words.forEach((word, index) => {
    const width = ctx.measureText(word.w).width;
    const current = lines[lines.length - 1]!;
    if (current.length && lineWidth + space + width > w) {
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1]!.push({ ...word, width, index });
    lineWidth += (lineWidth ? space : 0) + width;
  });

  const lineHeight = size * 1.18;
  let y = h / 2 - ((lines.length - 1) * lineHeight) / 2;
  const reveal = Math.max(0.001, Math.min(length, 0.25 * words.length + 0.2));
  for (const line of lines) {
    const total = line.reduce((sum, word) => sum + word.width, 0) + space * (line.length - 1);
    let x = s.align === "left" ? 0 : (w - total) / 2;
    for (const word of line) {
      const timed = layer.words?.[word.index];
      const appearAt = timed ? timed.start : (word.index / words.length) * reveal;
      const k = eo(pg(t, appearAt, appearAt + 0.12));
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha *= k;
        ctx.fillStyle = word.key ? (s.accent ?? "#FACC15") : (s.color ?? "#FFFFFF");
        ctx.fillText(word.w, x, y + (1 - k) * 12);
        ctx.restore();
      }
      x += word.width + space;
    }
    y += lineHeight;
  }
}

/** Cheap stable string hash for the compile cache key (code layers carry no stored hash client-side). */
function hashish(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function placeholder(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, env: RenderEnv, error = false) {
  ctx.save();
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = error ? "#DC2626" : "rgba(120,120,120,0.7)";
  ctx.fillStyle = error ? "rgba(220,38,38,0.08)" : "rgba(120,120,120,0.08)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = error ? "#DC2626" : "rgba(90,90,90,0.9)";
  ctx.font = `500 28px ${env.fonts.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2, w - 24);
  ctx.restore();
}
