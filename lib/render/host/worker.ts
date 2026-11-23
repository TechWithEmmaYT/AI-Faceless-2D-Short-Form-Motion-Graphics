/// <reference lib="webworker" />
/**
 * The renderer worker, inside the sandboxed render host (opaque origin, connect-src 'none'). This is
 * the ONLY place agent-written code runs (createCodeRuntime). It draws the preview into the
 * transferred canvas and captures frames for render_frames, running the checks on what it drew.
 * Bundled by scripts/build-render-host.mjs — no imports from the app beyond lib/render.
 */
import type {
  RenderRequestResult,
  RenderRequestSpec,
} from "../../db/app-schema";
import {
  frameDifference,
  instrument,
  layoutSignature,
  staticChecks,
  textChecks,
  type Check,
  type TextDraw,
} from "../checks";
import {
  createCodeRuntime,
  render,
  renderScene,
  type RenderEnv,
  type SavedElement,
} from "../render";
import { ordered } from "../timeline";
import { CANVAS_H, CANVAS_W, type Layer, type Scene } from "../types";
import { exportVideo } from "./export";
import type { FromWorker, HostScene, ToWorker } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const FONTS = { sans: "MS Inter", mono: "MS JetBrains Mono" };
const code = createCodeRuntime();

let preview: OffscreenCanvas | null = null;
let data: HostScene = { scenes: [], elements: {}, blank: "#000000" };
let elements = new Map<string, SavedElement>();

const post = (message: FromWorker) => self.postMessage(message);

function env(extra: Partial<RenderEnv> = {}): RenderEnv {
  return { fonts: FONTS, blank: data.blank, code, elements, ...extra };
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "init") {
    preview = msg.canvas;
    const faces = [
      new FontFace(FONTS.sans, msg.fonts.sans, { weight: "100 900" }),
      new FontFace(FONTS.mono, msg.fonts.mono, { weight: "100 800" }),
    ];
    for (const face of faces) {
      await face.load();
      self.fonts.add(face);
    }
    post({ type: "initialized" });
  } else if (msg.type === "resize") {
    if (preview) {
      preview.width = msg.width;
      preview.height = msg.height;
    }
  } else if (msg.type === "load") {
    data = msg.data;
    elements = new Map(Object.entries(data.elements));
  } else if (msg.type === "frame") {
    const errors: { layer: string; message: string }[] = [];
    if (preview) {
      const ctx = preview.getContext(
        "2d",
      ) as unknown as CanvasRenderingContext2D;
      ctx.setTransform(
        preview.width / CANVAS_W,
        0,
        0,
        preview.height / CANVAS_H,
        0,
        0,
      );
      render(
        ctx,
        data.scenes,
        msg.t,
        env({
          onError: (layer, message) =>
            errors.push({ layer: layer.name, message }),
        }),
      );
    }
    post({ type: "drawn", seq: msg.seq, errors });
  } else if (msg.type === "capture") {
    try {
      post({ type: "captured", id: msg.id, result: await capture(msg.spec) });
    } catch (error) {
      post({
        type: "capture-failed",
        id: msg.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (msg.type === "still") {
    try {
      const jpeg = await still(msg.t, msg.longEdge);
      self.postMessage({ type: "still-done", id: msg.id, jpeg } satisfies FromWorker, [jpeg]);
    } catch (error) {
      post({ type: "job-failed", id: msg.id, message: error instanceof Error ? error.message : String(error) });
    }
  } else if (msg.type === "export") {
    try {
      const result = await exportVideo({
        scenes: data.scenes,
        audio: msg.audio,
        env,
        onProgress: (frame, frames) => post({ type: "export-progress", id: msg.id, frame, frames }),
      });
      self.postMessage({ type: "export-done", id: msg.id, result } satisfies FromWorker, [result.mp4]);
    } catch (error) {
      post({ type: "job-failed", id: msg.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
};

/** One frame of the full video at t (the poster), as JPEG bytes. */
async function still(t: number, longEdge: number): Promise<ArrayBuffer> {
  if (data.scenes.length === 0) throw new Error("There are no scenes to take a poster from.");
  const height = longEdge;
  const width = Math.round((height * 9) / 16);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.setTransform(width / CANVAS_W, 0, 0, height / CANVAS_H, 0, 0);
  render(ctx, data.scenes, t, env());
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  return blob.arrayBuffer();
}

type Shot = {
  canvas: OffscreenCanvas;
  checks: Check[];
  pixels: Uint8ClampedArray;
};

/** Renders one scene at scene time t into a fresh canvas, recording text sizes and layer errors. */
function shoot(
  scene: Scene,
  t: number,
  width: number,
  height: number,
  applyJoin: boolean,
): Shot {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const scale = width / CANVAS_W;
  ctx.setTransform(scale, 0, 0, height / CANVAS_H, 0, 0);
  const draws: TextDraw[] = [];
  const checks: Check[] = [];
  let current: Layer | null = null;
  instrument(
    ctx,
    scale,
    (px, text) => current && draws.push({ layer: current, px, text }),
  );
  renderScene(
    ctx,
    scene,
    t,
    env({
      onLayer: (layer) => (current = layer),
      onError: (layer, message) =>
        checks.push({
          check: "layer-error",
          scene: scene.title,
          layer: layer.name,
          at: t,
          message: `threw: ${message}. Read its code with get_project (include_code: true), fix it with update_layer, and render again.`,
        }),
    }),
    applyJoin,
  );
  checks.push(...textChecks(scene, round(t), draws));
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return { canvas, checks, pixels };
}

async function capture(spec: RenderRequestSpec): Promise<RenderRequestResult> {
  const height = spec.longEdge;
  const width = Math.round((height * 9) / 16);
  const scenes = ordered(data.scenes);
  const roles = new Map(
    Object.entries(data.elements).map(([name, e]) => [name, e.role]),
  );
  const notes: string[] = [];

  if (spec.mode === "scene") {
    const index = scenes.findIndex((s) => s.id === spec.sceneId);
    const scene = scenes[index];
    if (!scene)
      throw new Error(
        "That scene isn't in the editor yet — it may have just been created; call render_frames again in a moment.",
      );
    if (scene.layers.length === 0)
      notes.push(
        `"${scene.title}" has no layers, so it plays as a blank frame.`,
      );
    const shots = spec.times.map((t) => ({
      t,
      shot: shoot(scene, t, width, height, index > 0),
    }));
    const checks: Check[] = [
      ...staticChecks(scene, roles),
      ...shots.flatMap((s) => s.shot.checks),
    ];
    if (shots.length >= 2 && scene.layers.length > 0) {
      const diff = frameDifference(
        shots[0]!.shot.pixels,
        shots[shots.length - 1]!.shot.pixels,
      );
      if (diff < 1.5)
        checks.push({
          check: "nothing-moves",
          scene: scene.title,
          message: `the frames at ${shots[0]!.t}s and ${shots[shots.length - 1]!.t}s are almost identical — add a move from the storyboard inside the shot.`,
        });
    }
    const frames = await Promise.all(
      shots.map(async ({ t, shot }) => ({
        label: `${scene.title} @ ${round(t)}s`,
        data: await jpeg(shot.canvas),
      })),
    );
    return { frames, checks: dedupe(checks), notes };
  }

  // Contact sheet: one frame per scene (at 40% of it), in one image, labelled.
  if (scenes.length === 0)
    throw new Error("There are no scenes to put on a contact sheet.");
  const cellH = scenes.length > 8 ? Math.round(height * 0.66) : height;
  const cellW = Math.round((cellH * 9) / 16);
  const cols = Math.min(4, scenes.length);
  const rows = Math.ceil(scenes.length / cols);
  const labelH = 30;
  const gap = 8;
  const sheet = new OffscreenCanvas(
    cols * cellW + (cols + 1) * gap,
    rows * (cellH + labelH) + (rows + 1) * gap,
  );
  const sctx = sheet.getContext("2d")!;
  sctx.fillStyle = "#1A1D23";
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  const checks: Check[] = [];
  let previousLayout = "";
  scenes.forEach((scene, i) => {
    const t = round(scene.durationSec * 0.4);
    const shot = shoot(scene, t, cellW, cellH, false);
    checks.push(...staticChecks(scene, roles), ...shot.checks);
    const layout = layoutSignature(scene);
    if (i > 0 && layout && layout === previousLayout) {
      checks.push({
        check: "layout-repeats",
        scene: scene.title,
        message: `same layout as the scene before it — change the framing or the place.`,
      });
    }
    previousLayout = layout;
    if (scene.layers.length === 0)
      notes.push(`Scene ${i + 1} "${scene.title}" is empty (blank frame).`);
    const x = gap + (i % cols) * (cellW + gap);
    const y = gap + Math.floor(i / cols) * (cellH + labelH + gap);
    sctx.fillStyle = "#E5E7EB";
    sctx.font = `600 15px ${FONTS.sans}`;
    sctx.textBaseline = "middle";
    sctx.fillText(
      `${i + 1} · ${scene.title}`.slice(0, 34),
      x + 2,
      y + labelH / 2,
      cellW - 4,
    );
    sctx.drawImage(shot.canvas, x, y + labelH);
  });
  return {
    frames: [
      {
        label: `contact sheet · ${scenes.length} scenes`,
        data: await jpeg(sheet),
      },
    ],
    checks: dedupe(checks),
    notes,
  };
}

async function jpeg(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.82,
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function dedupe(checks: Check[]): Check[] {
  const seen = new Set<string>();
  return checks.filter((c) => {
    const key = `${c.check}|${c.scene}|${c.layer}|${c.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
