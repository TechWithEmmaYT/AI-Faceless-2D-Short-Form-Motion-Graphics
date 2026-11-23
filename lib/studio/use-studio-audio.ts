"use client";

import { useEffect, useRef } from "react";

import type { SoundData, VoiceClipData } from "@/lib/api";
import { sceneAt } from "@/lib/render/timeline";
import type { Scene } from "@/lib/render/types";

/** How far audio may drift from the picture before it's re-synced (seconds). */
const MAX_DRIFT = 0.2;

type Want = { time: number; volume: number };

/** 0→1 over the first `fadeIn` seconds, 1→0 over the last `fadeOut` seconds of `length`. */
function envelope(
  local: number,
  length: number,
  fadeIn: number,
  fadeOut: number,
) {
  const inK = fadeIn > 0 ? Math.min(1, local / fadeIn) : 1;
  const outK = fadeOut > 0 ? Math.min(1, (length - local) / fadeOut) : 1;
  return Math.max(0, Math.min(inK, outK));
}

/** Brings one element in line with what should be heard now: silent, or at `want.time` and volume. */
function syncAudio(audio: HTMLAudioElement, want: Want | undefined) {
  if (!want) {
    if (!audio.paused) audio.pause();
    return;
  }
  audio.volume = Math.max(0, Math.min(1, want.volume));
  if (Math.abs(audio.currentTime - want.time) > MAX_DRIFT) audio.currentTime = want.time;
  if (audio.paused) void audio.play().catch(() => undefined);
}

/**
 * The studio's audio, driven by the preview clock t:
 * - voice: each scene's file starts with its scene (file time = scene time);
 * - story sounds: in their scene from atSec (scene seconds), trimmed, with their fades;
 * - music: across the video from atSec (video seconds), with its fade in and out.
 * Only what's on at t plays. `timeOffset` is where the shown scenes start in the full video (scene
 * view), so the music stays in place; `videoDuration` is the full video's length (music fade-out).
 */
export function useStudioAudio({
  scenes,
  clips,
  sounds,
  t,
  playing,
  muted,
  timeOffset,
  videoDuration,
}: {
  scenes: Scene[];
  clips: VoiceClipData[];
  sounds: SoundData[];
  t: number;
  playing: boolean;
  muted: boolean;
  timeOffset: number;
  videoDuration: number;
}) {
  const audios = useRef(new Map<string, HTMLAudioElement>());

  // One preloaded <audio> per voice clip and sound; replaced when its file changes.
  useEffect(() => {
    const map = audios.current;
    const wanted = new Map<string, string>([
      ...clips.map((c) => [c.id, c.url] as const),
      ...sounds.map((s) => [s.id, s.url] as const),
    ]);
    for (const [id, audio] of map) {
      if (wanted.get(id) !== audio.src) {
        audio.pause();
        map.delete(id);
      }
    }
    for (const [id, url] of wanted) {
      if (!map.has(id)) {
        const audio = new Audio(url);
        audio.preload = "auto";
        map.set(id, audio);
      }
    }
  }, [clips, sounds]);

  useEffect(() => {
    const wants = new Map<string, Want>();
    const at = sceneAt(scenes, t);

    if (at) {
      const clip = clips.find((c) => c.sceneId === at.scene.id);
      if (clip && at.local < clip.durationSec)
        wants.set(clip.id, { time: at.local, volume: 1 });

      for (const s of sounds) {
        if (s.kind !== "sfx" || s.sceneId !== at.scene.id) continue;
        const length = (s.trimEnd ?? s.durationSec) - s.trimStart;
        const local = at.local - s.atSec;
        if (local >= 0 && local < length)
          wants.set(s.id, {
            time: s.trimStart + local,
            volume: s.volume * envelope(local, length, s.fadeIn, s.fadeOut),
          });
      }
    }

    const music = sounds.find((s) => s.kind === "music");
    if (music) {
      const local = timeOffset + t - music.atSec;
      const length = Math.min(
        (music.trimEnd ?? music.durationSec) - music.trimStart,
        Math.max(0, videoDuration - music.atSec),
      );
      if (local >= 0 && local < length)
        wants.set(music.id, {
          time: music.trimStart + local,
          volume:
            music.volume * envelope(local, length, music.fadeIn, music.fadeOut),
        });
    }

    for (const [id, audio] of audios.current) {
      syncAudio(audio, playing && !muted ? wants.get(id) : undefined);
    }
  }, [scenes, clips, sounds, t, playing, muted, timeOffset, videoDuration]);

  useEffect(() => {
    const map = audios.current;
    return () => {
      for (const audio of map.values()) audio.pause();
    };
  }, []);
}
