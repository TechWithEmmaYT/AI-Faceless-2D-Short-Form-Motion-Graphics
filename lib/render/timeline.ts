import type { Scene } from "./types";

/** Scenes in play order. */
export function ordered(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.position - b.position);
}

/** Total video length in seconds. */
export function totalDuration(scenes: Scene[]): number {
  return scenes.reduce((sum, s) => sum + Math.max(0, s.durationSec), 0);
}

/** Where each scene starts in the video, by id. */
export function sceneStarts(scenes: Scene[]): Map<string, number> {
  const starts = new Map<string, number>();
  let at = 0;
  for (const s of ordered(scenes)) {
    starts.set(s.id, at);
    at += Math.max(0, s.durationSec);
  }
  return starts;
}

/**
 * The one scene on screen at video time t, and t inside it. Half-open intervals [start, end), so a
 * boundary frame belongs to the NEXT scene; the very last instant clamps to the last scene's end.
 */
export function sceneAt(scenes: Scene[], t: number): { scene: Scene; index: number; local: number } | null {
  const list = ordered(scenes);
  if (list.length === 0) return null;
  let at = 0;
  for (let i = 0; i < list.length; i++) {
    const d = Math.max(0, list[i]!.durationSec);
    if (t < at + d) return { scene: list[i]!, index: i, local: Math.max(0, t - at) };
    at += d;
  }
  const last = list[list.length - 1]!;
  return { scene: last, index: list.length - 1, local: Math.max(0, last.durationSec) };
}

/** 7.25 → "00:07"; 75 → "01:15". */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
