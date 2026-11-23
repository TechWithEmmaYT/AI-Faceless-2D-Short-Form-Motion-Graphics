"use client";

import { AudioLinesIcon, CheckIcon, ClockIcon, CopyIcon, MusicIcon, PauseIcon, PlayIcon, ScissorsIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { ProjectState, SoundData, VoiceClipData } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CopyCommand } from "./copy-command";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const seconds = (s: number) => `${Math.round(s * 100) / 100}s`;
const STARS = /\*/g;

/** What the tab can audition: a file, optionally only a window of it. */
type Playable = { id: string; url: string; from?: number; to?: number | null };

/**
 * Voice tab (_design/voice-tab-editor.jpg): the Fish Audio MCP setup, the voiceovers Claude Code saved
 * (save_generated_audio, one file per scene) in scene order, then the story sounds and the music bed
 * (add_sound). Everything is re-hosted on Cloudinary and playable here. Read-only: Claude Code changes
 * audio with its tools.
 */
export function VoiceTab({ state }: { state: ProjectState }) {
  const position = new Map(state.scenes.map((s, i) => [s.id, i]));
  const byScene = (id: string | null) => (id ? (position.get(id) ?? Number.MAX_SAFE_INTEGER) : -1);
  const sceneLabel = (id: string | null) => {
    const index = id ? position.get(id) : undefined;
    if (index === undefined) return "Scene";
    return `${String(index + 1).padStart(2, "0")} · ${state.scenes[index]?.title.split(" — ")[0] ?? "Scene"}`;
  };

  const clips = state.voiceClips.toSorted((a, b) => byScene(a.sceneId) - byScene(b.sceneId));
  const music = state.sounds.find((s) => s.kind === "music") ?? null;
  const sfx = state.sounds.filter((s) => s.kind === "sfx").toSorted((a, b) => byScene(a.sceneId) - byScene(b.sceneId) || a.atSec - b.atSec);
  const player = useAuditionPlayer();

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Fish Audio MCP</CardTitle>
          <CardAction>
            <Badge variant={clips.length ? "brand" : "outline"} className="h-7 gap-1.5 px-3">
              {clips.length ? <span className="size-1.5 rounded-full bg-brand" aria-hidden /> : null}
              {clips.length ? `${clips.length} clip${clips.length === 1 ? "" : "s"} received` : "No clips yet"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <CopyCommand variant="light" command="claude mcp add --transport http fish-audio https://api.fish.audio/mcp" />
          <p className="text-xs text-muted-foreground">
            Then run /mcp in Claude Code to sign in with your Fish Audio account. MotionStudio never stores a Fish Audio key; the clips are re-hosted on Cloudinary.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Generated Audio"
          hint={
            clips.length
              ? `${clips.length} voiceover${clips.length === 1 ? "" : "s"} pushed via Fish Audio MCP — one per scene`
              : "Voiceover clips pushed by Claude Code via Fish Audio MCP"
          }
        />
        {clips.length === 0 ? (
          <Empty className="rounded-xl border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AudioLinesIcon />
              </EmptyMedia>
              <EmptyTitle>No voiceovers yet</EmptyTitle>
              <EmptyDescription>After you approve the storyboard, Claude Code voices each line and the clips appear here, one per scene.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {clips.map((clip) => (
              <li key={clip.id}>
                <ClipCard
                  clip={clip}
                  sceneLabel={sceneLabel(clip.sceneId)}
                  playing={player.playingId === clip.id}
                  progress={player.playingId === clip.id ? player.progress : 0}
                  onToggle={() => player.toggle(clip)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Sounds & Music"
          hint={
            sfx.length || music
              ? `${sfx.length} story sound${sfx.length === 1 ? "" : "s"}${music ? " and a music bed" : ""}, mixed under the voice`
              : "Story sounds and an optional music bed, added by Claude Code"
          }
        />
        {sfx.length === 0 && !music ? (
          <Empty className="rounded-xl border bg-card py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MusicIcon />
              </EmptyMedia>
              <EmptyTitle>No sounds yet</EmptyTitle>
              <EmptyDescription>Claude Code adds a sound only where the script names one, and a quiet music bed if you ask for it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {music ? (
              <li>
                <SoundCard
                  sound={music}
                  label="Music bed · whole video"
                  playing={player.playingId === music.id}
                  progress={player.playingId === music.id ? player.progress : 0}
                  onToggle={() => player.toggle({ id: music.id, url: music.url, from: music.trimStart, to: music.trimEnd })}
                />
              </li>
            ) : null}
            {sfx.map((s) => (
              <li key={s.id}>
                <SoundCard
                  sound={s}
                  label={sceneLabel(s.sceneId)}
                  playing={player.playingId === s.id}
                  progress={player.playingId === s.id ? player.progress : 0}
                  onToggle={() => player.toggle({ id: s.id, url: s.url, from: s.trimStart, to: s.trimEnd })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function PlayButton({ playing, label, onToggle }: { playing: boolean; label: string; onToggle: () => void }) {
  return (
    <Button size="icon-lg" className="size-11 shrink-0 rounded-full" onClick={onToggle} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
      {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
    </Button>
  );
}

function ProgressPill({ progress, durationSec }: { progress: number; durationSec: number }) {
  return (
    <div className="flex h-8 w-56 max-w-full items-center gap-2 rounded-md border bg-well px-2">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{clock(durationSec)}</span>
    </div>
  );
}

function ClipCard({
  clip,
  sceneLabel,
  playing,
  progress,
  onToggle,
}: {
  clip: VoiceClipData;
  sceneLabel: string;
  playing: boolean;
  progress: number;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const fileName = `${clip.publicId.split("/").pop()}.${clip.url.split(".").pop()?.split("?")[0] ?? "mp3"}`;
  const firstLine = clip.lines[0]?.text.replace(STARS, "") ?? "";

  async function copyLines() {
    try {
      await navigator.clipboard.writeText(clip.lines.map((l) => l.text.replace(STARS, "")).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the lines.");
    }
  }

  return (
    <div className={cn("flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors", playing && "border-2 border-brand p-[15px]")}>
      <PlayButton playing={playing} label={fileName} onToggle={onToggle} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-[14px] font-semibold">{fileName}</p>
            <p className="truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground/70">{sceneLabel}</span> · “{firstLine}
              {clip.lines.length > 1 ? "…" : ""}”
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" className="shrink-0 text-faint" onClick={copyLines} aria-label="Copy the lines">
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProgressPill progress={progress} durationSec={clip.durationSec} />
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Volume2Icon className="size-4" aria-hidden />
            {clip.voiceName}
          </span>
          <Badge variant="outline" className="h-6">
            {clip.lines.length} line{clip.lines.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function SoundCard({
  sound,
  label,
  playing,
  progress,
  onToggle,
}: {
  sound: SoundData;
  label: string;
  playing: boolean;
  progress: number;
  onToggle: () => void;
}) {
  const end = sound.trimEnd ?? sound.durationSec;
  const trimmed = sound.trimStart > 0 || sound.trimEnd !== null;

  return (
    <div className={cn("flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors", playing && "border-2 border-brand p-[15px]")}>
      <PlayButton playing={playing} label={sound.name} onToggle={onToggle} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{sound.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground/70">{label}</span> · {sound.source}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProgressPill progress={progress} durationSec={end - sound.trimStart} />
          <Badge variant="outline" className="h-6 gap-1">
            <ClockIcon aria-hidden />
            {sound.kind === "music" ? `from ${seconds(sound.atSec)} of the video` : `at ${seconds(sound.atSec)}`}
          </Badge>
          <Badge variant="outline" className="h-6 gap-1 tabular-nums">
            <Volume2Icon aria-hidden />
            {Math.round(sound.volume * 100)}%
          </Badge>
          {trimmed ? (
            <Badge variant="outline" className="h-6 gap-1 tabular-nums">
              <ScissorsIcon aria-hidden />
              {seconds(sound.trimStart)}–{seconds(end)}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One audio element for the tab: auditions one file at a time (at full volume, within its trim),
 * and reports progress through the part that plays.
 */
function useAuditionPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const windowRef = useRef<{ from: number; to: number | null }>({ from: 0, to: null });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => audioRef.current?.pause(), []);

  function stop() {
    audioRef.current?.pause();
    setPlayingId(null);
    setProgress(0);
  }

  function getAudio() {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => {
      const { from, to } = windowRef.current;
      const end = to ?? audio.duration;
      if (!end) return;
      if (audio.currentTime >= end) return stop();
      setProgress(Math.max(0, (audio.currentTime - from) / (end - from)));
    });
    audio.addEventListener("ended", stop);
    audioRef.current = audio;
    return audio;
  }

  function toggle(item: Playable) {
    const audio = getAudio();
    if (playingId === item.id) return stop();
    windowRef.current = { from: item.from ?? 0, to: item.to ?? null };
    audio.src = item.url;
    audio.currentTime = item.from ?? 0;
    setProgress(0);
    setPlayingId(item.id);
    audio.play().catch(() => {
      setPlayingId(null);
      toast.error("Couldn't play this file.");
    });
  }

  return { playingId, progress, toggle };
}
