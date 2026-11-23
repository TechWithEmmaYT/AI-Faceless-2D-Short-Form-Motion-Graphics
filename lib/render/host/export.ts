/// <reference lib="webworker" />
/**
 * MP4 export, inside the renderer worker (the sandbox — agent code never runs anywhere else). Each
 * frame i of the full video is drawn by the same render() as the preview at t = i / 30 on a
 * 1080×1920 canvas, encoded with WebCodecs (H.264, a key frame every 2 s) and muxed by Mediabunny
 * with the page's audio mix (AAC, or Opus where AAC can't be encoded). Encoder backpressure is
 * respected by awaiting each add(); nothing here depends on timers, so a hidden tab keeps exporting.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";

import type { RenderEnv } from "../render";
import { render } from "../render";
import { totalDuration } from "../timeline";
import { CANVAS_H, CANVAS_W, FPS, type Scene } from "../types";
import type { ExportAudio, ExportResult } from "./protocol";

/** Report progress this often (frames); each report also feeds the host's stall watchdog. */
const PROGRESS_EVERY = 3;

export async function exportVideo({
  scenes,
  audio,
  env,
  onProgress,
}: {
  scenes: Scene[];
  audio: ExportAudio | null;
  env: (extra?: Partial<RenderEnv>) => RenderEnv;
  onProgress: (frame: number, frames: number) => void;
}): Promise<ExportResult> {
  const frames = Math.round(totalDuration(scenes) * FPS);
  if (frames < 1) throw new Error("There's nothing to export yet: the video has no scenes with length.");

  const videoCodec = await getFirstEncodableVideoCodec(["avc"], { width: CANVAS_W, height: CANVAS_H, frameRate: FPS });
  if (!videoCodec) throw new Error("This browser can't encode H.264 video. Export in desktop Chrome or Edge.");
  const channels = audio ? Math.min(2, audio.channels.length) : 0;
  const audioCodec = audio && channels
    ? await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: channels, sampleRate: audio.sampleRate })
    : null;
  if (audio && channels && !audioCodec) throw new Error("This browser can't encode AAC or Opus audio. Export in desktop Chrome or Edge.");

  const canvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext("2d", { alpha: false }) as unknown as CanvasRenderingContext2D;

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: FPS });
  const sound = audioCodec ? new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH }) : null;
  if (sound) output.addAudioTrack(sound);

  const layerErrors = new Map<string, string>();
  const frameEnv = env({ onError: (layer, message) => layerErrors.set(layer.name, message) });

  try {
    await output.start();
    // Audio goes in one-second chunks, kept just ahead of the video so the muxer can interleave.
    const audioEnd = frames / FPS;
    let audioAt = 0;
    const feedAudio = async (until: number) => {
      if (!sound || !audio) return;
      while (audioAt < Math.min(until, audioEnd) - 1e-9) {
        const next = Math.min(audioAt + 1, audioEnd);
        await sound.add(audioChunk(audio, channels, audioAt, next));
        audioAt = next;
      }
    };

    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await feedAudio(t + 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      render(ctx, scenes, t, frameEnv);
      await video.add(t, 1 / FPS);
      if (i % PROGRESS_EVERY === 0) onProgress(i, frames);
    }
    await feedAudio(audioEnd);
    onProgress(frames, frames);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }

  if (!target.buffer) throw new Error("The encoder finished without producing a file.");
  return {
    mp4: target.buffer,
    videoCodec,
    audioCodec,
    frames,
    layerErrors: [...layerErrors].map(([layer, message]) => ({ layer, message })),
  };
}

/** Planar float samples for [from, to) seconds of the mix; silence past the end of the mix. */
function audioChunk(audio: ExportAudio, channels: number, from: number, to: number): AudioSample {
  const start = Math.round(from * audio.sampleRate);
  const length = Math.max(1, Math.round(to * audio.sampleRate) - start);
  const data = new Float32Array(length * channels);
  for (let c = 0; c < channels; c++) {
    const source = audio.channels[c]!;
    const part = source.subarray(Math.min(start, source.length), Math.min(start + length, source.length));
    data.set(part, c * length);
  }
  return new AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: audio.sampleRate, timestamp: from });
}
