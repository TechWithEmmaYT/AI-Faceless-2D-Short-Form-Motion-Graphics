import type { SoundData, VoiceClipData } from "@/lib/api";
import type { ExportAudio } from "@/lib/render/host/protocol";
import { sceneStarts } from "@/lib/render/timeline";
import { FPS, type Scene } from "@/lib/render/types";
import { envelope } from "@/lib/studio/envelope";

const SAMPLE_RATE = 48_000;
/** Gain-curve resolution for fades (points per second). */
const CURVE_RATE = 200;

/**
 * Renders the video's whole soundtrack offline (48 kHz stereo) with the same timing as the preview
 * (use-studio-audio): each voiceover from its scene's start, cut at the scene's end; story sounds
 * from scene start + atSec, trimmed, faded, cut at the scene's end; the music bed from atSec in
 * video seconds with its fades. Returns null when the project has no audio at all.
 */
export async function mixProjectAudio({
  scenes,
  clips,
  sounds,
  frames,
}: {
  scenes: Scene[];
  clips: VoiceClipData[];
  sounds: SoundData[];
  /** The video's length in frames (the mix matches it exactly). */
  frames: number;
}): Promise<ExportAudio | null> {
  if (clips.length === 0 && sounds.length === 0) return null;
  const duration = frames / FPS;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(duration * SAMPLE_RATE), sampleRate: SAMPLE_RATE });

  // Fetch and decode each file once, in parallel.
  const names = new Map<string, string>([
    ...clips.map((c) => [c.url, `the voiceover for scene ${scenes.findIndex((s) => s.id === c.sceneId) + 1}`] as const),
    ...sounds.map((s) => [s.url, `the sound “${s.name}”`] as const),
  ]);
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    [...names].map(async ([url, name]) => {
      // A dropped connection shouldn't cost the whole export: try each file up to three times.
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          buffers.set(url, await ctx.decodeAudioData(await response.arrayBuffer()));
          return;
        } catch {
          if (attempt >= 2) throw new Error(`Couldn't load ${name}. Check your connection and try again.`);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }),
  );

  const starts = sceneStarts(scenes);
  const byId = new Map(scenes.map((s) => [s.id, s]));

  /** Plays [from, from + plays) of `buffer` at `when`, at `volume` shaped by the fade envelope over `length`. */
  function place(buffer: AudioBuffer, when: number, from: number, plays: number, volume: number, fade?: { length: number; fadeIn: number; fadeOut: number }) {
    if (plays <= 0.001 || when >= duration) return;
    const source = new AudioBufferSourceNode(ctx, { buffer });
    const gain = new GainNode(ctx, { gain: volume });
    if (fade && (fade.fadeIn > 0 || fade.fadeOut > 0)) {
      const points = Math.max(2, Math.ceil(plays * CURVE_RATE) + 1);
      const curve = new Float32Array(points);
      for (let i = 0; i < points; i++) curve[i] = volume * envelope((i / (points - 1)) * plays, fade.length, fade.fadeIn, fade.fadeOut);
      gain.gain.setValueCurveAtTime(curve, when, plays);
    }
    source.connect(gain).connect(ctx.destination);
    source.start(when, from, plays);
  }

  for (const clip of clips) {
    const scene = byId.get(clip.sceneId);
    const buffer = buffers.get(clip.url);
    if (!scene || !buffer) continue;
    place(buffer, starts.get(scene.id) ?? 0, 0, Math.min(buffer.duration, scene.durationSec), 1);
  }

  for (const s of sounds) {
    const buffer = buffers.get(s.url);
    if (!buffer) continue;
    const length = (s.trimEnd ?? buffer.duration) - s.trimStart;
    if (s.kind === "sfx") {
      const scene = s.sceneId ? byId.get(s.sceneId) : undefined;
      if (!scene) continue;
      const plays = Math.min(length, scene.durationSec - s.atSec);
      place(buffer, (starts.get(scene.id) ?? 0) + s.atSec, s.trimStart, plays, s.volume, { length, fadeIn: s.fadeIn, fadeOut: s.fadeOut });
    } else {
      const plays = Math.min(length, Math.max(0, duration - s.atSec));
      place(buffer, s.atSec, s.trimStart, plays, s.volume, { length: plays, fadeIn: s.fadeIn, fadeOut: s.fadeOut });
    }
  }

  const mix = await ctx.startRendering();
  // Copies (not views), so they can be transferred to the sandbox.
  return { sampleRate: SAMPLE_RATE, channels: [new Float32Array(mix.getChannelData(0)), new Float32Array(mix.getChannelData(1))] };
}
