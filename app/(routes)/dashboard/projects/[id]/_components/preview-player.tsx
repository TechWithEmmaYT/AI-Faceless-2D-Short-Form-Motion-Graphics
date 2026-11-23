"use client";

import { MaximizeIcon, MinimizeIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { RenderHostFrame, hostSceneData, type RenderHostHandle } from "@/components/studio/render-host";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SavedElementData, SoundData, VoiceClipData } from "@/lib/api";
import { formatTimecode, sceneAt, totalDuration } from "@/lib/render/timeline";
import { useStudioAudio } from "@/lib/studio/use-studio-audio";
import { cn } from "@/lib/utils";
import { FPS, type Scene } from "@/lib/render/types";

export type PlayerHandle = {
  seek: (t: number) => void;
  pause: () => void;
  /** Switching between the full video and a scene: pause, start at `t`, and fade the new frame in. */
  switchTo: (t: number) => void;
};

/**
 * The 9:16 preview on the dotted stage, and its playback bar. The page owns the clock; the frame is
 * render(scenes, t), drawn inside the sandboxed render host (agent code runs only there) — pure, so
 * pausing, scrubbing and replaying always show the same pixels for a t.
 * Audio arrives with the voice phase; the volume button already holds the mute state for it.
 */
export function PreviewPlayer({
  scenes,
  elements,
  voiceClips,
  sounds,
  timeOffset = 0,
  videoDuration,
  onSceneChange,
  onLayerErrors,
  banner,
  ref,
}: {
  scenes: Scene[];
  elements: SavedElementData[];
  /** Scene voiceovers — played in step with the picture. */
  voiceClips: VoiceClipData[];
  /** Story sounds and the music bed. */
  sounds: SoundData[];
  /** Where the shown scenes start in the full video (scene view), so music stays in place. */
  timeOffset?: number;
  /** The full video's length (for the music fade-out). Defaults to what's shown. */
  videoDuration?: number;
  onLayerErrors?: (errors: { layer: string; message: string }[]) => void;
  /** Shown above the canvas (e.g. the scene-view chip). */
  banner?: ReactNode;
  onSceneChange?: (sceneId: string | null) => void;
  ref?: Ref<PlayerHandle>;
}) {
  const duration = totalDuration(scenes);
  const [rawT, setT] = useState(0);
  // Clamped, not corrected in an effect: if the video gets shorter, t simply never exceeds it.
  const t = Math.min(rawT, duration);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const seek = useCallback((next: number) => setT(Math.min(Math.max(0, next), duration)), [duration]);

  // A soft dip instead of a hard cut when the preview switches what it shows. The sandbox is never
  // reloaded for a switch (that was the black flash); the frame just changes under a quick fade.
  const [dimmed, setDimmed] = useState(false);
  const switchTo = useCallback((next: number) => {
    setPlaying(false);
    setT(Math.max(0, next));
    setDimmed(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDimmed(false)));
  }, []);
  useImperativeHandle(ref, () => ({ seek, pause: () => setPlaying(false), switchTo }), [seek, switchTo]);

  // The clock: advance t by real elapsed time while playing; stop at the end.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  // Tell the Scenes tab which scene is on screen (only when it changes).
  const currentSceneId = sceneAt(scenes, t)?.scene.id ?? null;
  useEffect(() => onSceneChange?.(currentSceneId), [currentSceneId, onSceneChange]);

  const togglePlay = useCallback(() => {
    if (duration <= 0) return;
    setPlaying((p) => {
      if (!p && t >= duration) setT(0); // replay from the start
      return !p;
    });
  }, [duration, t]);

  // Space toggles play when focus isn't in a text field or on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, button, [role=slider], [role=tab], [contenteditable=true]")) return;
      e.preventDefault();
      togglePlay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  };

  // The sandbox draws; we just tell it the time and keep its scenes current.
  const host = useRef<RenderHostHandle>(null);
  const hostData = useMemo(() => hostSceneData(scenes, elements), [scenes, elements]);
  useEffect(() => host.current?.draw(t), [t, hostData]);

  useStudioAudio({ scenes, clips: voiceClips, sounds, t, playing, muted, timeOffset, videoDuration: videoDuration ?? duration });

  const empty = scenes.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-4">
      {banner}
      <div
        ref={stageRef}
        className="group/stage relative flex min-h-0 w-full flex-1 items-center justify-center data-[fullscreen=true]:bg-black"
        data-fullscreen={fullscreen}
        onDoubleClick={toggleFullscreen}
      >
        <RenderHostFrame
          ref={host}
          data={hostData}
          onLayerErrors={onLayerErrors}
          label={empty ? "Empty preview" : `Preview at ${formatTimecode(t)}`}
          className={cn(
            "pointer-events-none aspect-9/16 h-full max-h-full max-w-full rounded-2xl bg-black shadow-[0_12px_32px_rgba(17,24,39,0.10)] group-data-[fullscreen=true]/stage:rounded-none",
            dimmed ? "opacity-40 transition-none" : "opacity-100 transition-opacity duration-300 ease-out",
          )}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="max-w-48 text-center text-sm text-white/70">The preview plays here once Claude Code builds scenes.</p>
          </div>
        )}
      </div>

      {/* Playback bar (DESIGN.md: floating white pill under the canvas). */}
      <div className="flex w-full max-w-md items-center gap-2 rounded-full border bg-card px-2 py-1.5 shadow-sm">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={togglePlay} disabled={empty} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
        </Button>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          <span className="text-foreground">{formatTimecode(t)}</span> / {formatTimecode(duration)}
        </span>
        <Slider
          className="mx-2 flex-1"
          min={0}
          max={Math.max(duration, 0.001)}
          step={1 / FPS}
          value={[t]}
          disabled={empty}
          onValueChange={(value) => {
            setPlaying(false);
            seek(Array.isArray(value) ? value[0]! : value);
          }}
          aria-label="Seek"
        />
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="rounded-full" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} />}
          >
            {muted ? <VolumeXIcon /> : <Volume2Icon />}
          </TooltipTrigger>
          <TooltipContent>{voiceClips.length || sounds.length ? (muted ? "Unmute" : "Mute") : "No voice or sound yet"}</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </div>
    </div>
  );
}
