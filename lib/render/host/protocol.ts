import type {
  RenderCheck,
  RenderRequestResult,
  RenderRequestSpec,
} from "../../db/app-schema";
import type { SavedElement } from "../render";
import type { Scene } from "../types";

/**
 * Messages between the studio page (parent), the sandboxed render-host page (iframe, opaque origin)
 * and its renderer worker. Only data crosses: scenes, times, fonts, frames. Never functions or DOM.
 */

export type HostScene = {
  scenes: Scene[];
  elements: Record<string, SavedElement & { role: string }>;
  blank: string;
};

/** The full audio mix (rendered in the page), as planar float channels. */
export type ExportAudio = { sampleRate: number; channels: Float32Array[] };

/** What an export produced. */
export type ExportResult = {
  mp4: ArrayBuffer;
  videoCodec: string;
  audioCodec: string | null;
  frames: number;
  /** Layers that threw while exporting (they're skipped in those frames, as in the preview). */
  layerErrors: { layer: string; message: string }[];
};

/** Jobs that run to completion in the worker (render_frames, a still, an export). */
type JobMessages =
  | { type: "captured"; id: string; result: RenderRequestResult }
  | { type: "capture-failed"; id: string; message: string }
  | { type: "still-done"; id: string; jpeg: ArrayBuffer }
  | { type: "export-progress"; id: string; frame: number; frames: number }
  | { type: "export-done"; id: string; result: ExportResult }
  | { type: "job-failed"; id: string; message: string };

/** parent → host */
export type ToHost =
  | { type: "init"; fonts: { sans: ArrayBuffer; mono: ArrayBuffer } }
  | { type: "load"; data: HostScene }
  | { type: "frame"; t: number }
  | { type: "capture"; id: string; spec: RenderRequestSpec }
  /** One frame of the full video at t, as a JPEG (the poster). */
  | { type: "still"; id: string; t: number; longEdge: number }
  /** The whole video as an MP4 at 1080×1920, 30 fps. */
  | { type: "export"; id: string; audio: ExportAudio | null };

/** host → parent */
export type FromHost =
  | { type: "ready" }
  | { type: "initialized" }
  | JobMessages
  | { type: "layer-errors"; errors: { layer: string; message: string }[] }
  | { type: "restarted"; reason: string };

/** host → worker */
export type ToWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      fonts: { sans: ArrayBuffer; mono: ArrayBuffer };
    }
  | { type: "resize"; width: number; height: number }
  | { type: "load"; data: HostScene }
  | { type: "frame"; seq: number; t: number }
  | { type: "capture"; id: string; spec: RenderRequestSpec }
  | { type: "still"; id: string; t: number; longEdge: number }
  | { type: "export"; id: string; audio: ExportAudio | null };

/** worker → host */
export type FromWorker =
  | { type: "initialized" }
  | { type: "drawn"; seq: number; errors: { layer: string; message: string }[] }
  | JobMessages;

export type { RenderCheck };
