import { CANVAS_H, CANVAS_W, type Layer, type Scene } from "./types";

/**
 * The named checks render_frames returns (lib/agent/guide/topics/checks.ts). Pure: they read the
 * scene data and what an instrumented context saw while drawing — never the DOM. Run in the sandbox.
 */

export type Check = { check: string; scene?: string; layer?: string; at?: number; message: string };

/** 3% of the 1080×1920 frame height. */
export const MIN_TEXT_PX = 58;
/** Small UI labels the briefs size below 58px on purpose (section chip, counter, terminal text). */
const SMALL_TEXT_OK = new Set(["chip", "counter", "terminal"]);
/** Default caption band (fraction of height) until each brief declares its own. */
const CAPTION_BAND: [number, number] = [0.55, 0.97];

export type TextDraw = { layer: Layer; px: number; text: string };

/**
 * Wraps a 2D context so every fillText/strokeText is recorded with its on-screen size (font px × the
 * current transform's vertical scale, in 1080×1920 units). `scale` = device px per canvas unit.
 */
export function instrument(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, scale: number, sink: (px: number, text: string) => void) {
  const record = (text: string) => {
    const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
    if (!match) return;
    const m = ctx.getTransform();
    const vertical = Math.hypot(m.b, m.d) / scale;
    sink(Number(match[1]) * vertical, text);
  };
  const fill = ctx.fillText.bind(ctx);
  const stroke = ctx.strokeText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    record(text);
    return maxWidth === undefined ? fill(text, x, y) : fill(text, x, y, maxWidth);
  };
  ctx.strokeText = (text: string, x: number, y: number, maxWidth?: number) => {
    record(text);
    return maxWidth === undefined ? stroke(text, x, y) : stroke(text, x, y, maxWidth);
  };
}

/** Checks that depend only on a scene's layers (boxes, kinds, references). */
export function staticChecks(scene: Scene, savedRoles: Map<string, string>): Check[] {
  const out: Check[] = [];
  for (const l of scene.layers) {
    const { x, y, w, h } = l.box;
    const fullBleed = x <= 0 && y <= 0 && x + w >= CANVAS_W && y + h >= CANVAS_H;
    if (!fullBleed && (x < 0 || y < 0 || x + w > CANVAS_W || y + h > CANVAS_H)) {
      out.push({ check: "off-canvas", scene: scene.title, layer: l.name, message: `box ${x},${y} ${w}×${h} goes past the 1080×1920 frame — move it in or shrink it.` });
    }
    if (l.kind === "caption") {
      const center = (y + h / 2) / CANVAS_H;
      if (center < CAPTION_BAND[0] || center > CAPTION_BAND[1]) {
        out.push({ check: "caption-outside-band", scene: scene.title, layer: l.name, message: `caption centred at ${Math.round(center * 100)}% of the height; keep captions in the style's band (lower part of the frame).` });
      }
    }
    if (l.kind === "element" && savedRoles.get(l.elementRef) === "hero" && h < CANVAS_H * 0.2) {
      out.push({ check: "hero-too-small", scene: scene.title, layer: l.name, message: `the hero is ${Math.round((h / CANVAS_H) * 100)}% of the frame height; the briefs ask for 20–25%.` });
    }
    if (l.end !== null && l.end > scene.durationSec + 0.01) {
      out.push({ check: "past-scene-end", scene: scene.title, layer: l.name, message: `ends at ${l.end}s but the scene is ${scene.durationSec}s — it's cut at the scene end.` });
    }
  }
  return out;
}

/** Text drawn smaller than 3% of the height (excluding the small UI labels briefs allow). */
export function textChecks(scene: Scene, at: number, draws: TextDraw[]): Check[] {
  const out: Check[] = [];
  const seen = new Set<string>();
  for (const d of draws) {
    if (d.layer.kind === "element" && SMALL_TEXT_OK.has(d.layer.elementRef)) continue;
    if (d.px >= MIN_TEXT_PX - 0.5 || !d.text.trim()) continue;
    const key = `${d.layer.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ check: "text-too-small", scene: scene.title, layer: d.layer.name, at, message: `"${d.text.slice(0, 40)}" is ${Math.round(d.px)}px — under ${MIN_TEXT_PX}px (3% of the height). Make it bigger or cut it.` });
  }
  return out;
}

/** Mean absolute difference (0–255) of two equally sized RGBA buffers, sampled. */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 16) {
    sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    n += 3;
  }
  return sum / n;
}

/** The scene's layout as a comparable signature: the 5 largest boxes, rounded. */
export function layoutSignature(scene: Scene): string {
  return [...scene.layers]
    .filter((l) => !(l.box.w >= CANVAS_W && l.box.h >= CANVAS_H)) // ignore full-frame backgrounds
    .sort((p, q) => q.box.w * q.box.h - p.box.w * p.box.h)
    .slice(0, 5)
    .map((l) => [l.box.x, l.box.y, l.box.w, l.box.h].map((v) => Math.round(v / 60)).join(","))
    .join("|");
}
