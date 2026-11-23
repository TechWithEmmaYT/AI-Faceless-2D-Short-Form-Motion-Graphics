/**
 * MP4 export, run by the render-host PAGE (inside the sandbox). WebCodecs only exists in secure
 * contexts, and the renderer worker — a blob: worker of an opaque-origin page — isn't one, so the
 * split is: the worker draws each frame with the preview's render() (agent code still runs only there)
 * and transfers it as an ImageBitmap; this page encodes it (H.264, a key frame every 2 s) and muxes it
 * with the page's audio mix (AAC, or Opus where AAC can't be encoded) using Mediabunny. Frames are
 * requested one at a time, so the host's per-frame watchdog still catches a hung layer, and encoder
 * backpressure is respected by awaiting each add(). No timers: a hidden tab keeps exporting.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";

import { CANVAS_H, CANVAS_W, FPS } from "../types";
import type { ExportAudio, ExportResult } from "./protocol";

/** Report progress this often (frames). */
const PROGRESS_EVERY = 3;

export async function encodeVideo({
  frames,
  audio,
  renderFrame,
  onProgress,
}: {
  frames: number;
  audio: ExportAudio | null;
  /** Draws frame i (t = i / 30) at 1080×1920 in the renderer worker. */
  renderFrame: (
    i: number,
  ) => Promise<{
    bitmap: ImageBitmap;
    errors: { layer: string; message: string }[];
  }>;
  onProgress: (frame: number, frames: number) => void;
}): Promise<ExportResult> {
  if (frames < 1)
    throw new Error(
      "There's nothing to export yet: the video has no scenes with length.",
    );

  const videoCodec = await getFirstEncodableVideoCodec(["avc"], {
    width: CANVAS_W,
    height: CANVAS_H,
    frameRate: FPS,
  });
  if (!videoCodec)
    throw new Error(
      "This browser can't encode H.264 video. Export in desktop Chrome or Edge.",
    );
  const channels = audio ? Math.min(2, audio.channels.length) : 0;
  const audioCodec =
    audio && channels
      ? await getFirstEncodableAudioCodec(["aac", "opus"], {
          numberOfChannels: channels,
          sampleRate: audio.sampleRate,
        })
      : null;
  if (audio && channels && !audioCodec)
    throw new Error(
      "This browser can't encode AAC or Opus audio. Export in desktop Chrome or Edge.",
    );

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const video = new VideoSampleSource({
    codec: videoCodec,
    quality: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(video, { frameRate: FPS });
  const sound = audioCodec
    ? new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH })
    : null;
  if (sound) output.addAudioTrack(sound);

  const layerErrors = new Map<string, string>();

  try {
    await output.start();
    // Audio goes in one-second chunks, kept just ahead of the video so the muxer can interleave.
    const audioEnd = frames / FPS;
    let audioAt = 0;
    const feedAudio = async (until: number) => {
      if (!sound || !audio) return;
      while (audioAt < Math.min(until, audioEnd) - 1e-9) {
        const next = Math.min(audioAt + 1, audioEnd);
        const chunk = audioChunk(audio, channels, audioAt, next);
        try {
          await sound.add(chunk);
        } finally {
          chunk.close();
        }
        audioAt = next;
      }
    };

    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await feedAudio(t + 1);
      const { bitmap, errors } = await renderFrame(i);
      for (const e of errors) layerErrors.set(e.layer, e.message);
      const sample = new VideoSample(bitmap, {
        timestamp: t,
        duration: 1 / FPS,
      });
      try {
        await video.add(sample);
      } finally {
        sample.close();
        bitmap.close();
      }
      if (i % PROGRESS_EVERY === 0) onProgress(i, frames);
    }
    await feedAudio(audioEnd);
    onProgress(frames, frames);
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }

  if (!target.buffer)
    throw new Error("The encoder finished without producing a file.");
  return {
    mp4: target.buffer,
    videoCodec,
    audioCodec,
    frames,
    layerErrors: [...layerErrors].map(([layer, message]) => ({
      layer,
      message,
    })),
  };
}

/** Planar float samples for [from, to) seconds of the mix; silence past the end of the mix. */
function audioChunk(
  audio: ExportAudio,
  channels: number,
  from: number,
  to: number,
): AudioSample {
  const start = Math.round(from * audio.sampleRate);
  const length = Math.max(1, Math.round(to * audio.sampleRate) - start);
  const data = new Float32Array(length * channels);
  for (let c = 0; c < channels; c++) {
    const source = audio.channels[c]!;
    data.set(
      source.subarray(
        Math.min(start, source.length),
        Math.min(start + length, source.length),
      ),
      c * length,
    );
  }
  return new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: audio.sampleRate,
    timestamp: from,
  });
}
