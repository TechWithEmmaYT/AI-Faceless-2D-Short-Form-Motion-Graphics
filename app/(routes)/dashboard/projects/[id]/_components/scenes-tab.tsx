"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BoxIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  ClockIcon,
  CodeIcon,
  FileTextIcon,
  LayoutListIcon,
  MicIcon,
  ShuffleIcon,
  SparklesIcon,
  TrashIcon,
  TypeIcon,
} from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/studio/confirm-button";
import { RenderCanvas } from "@/components/studio/render-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, deleteSceneMutationFn, projectKeys, seedDemoScenesMutationFn, type ProjectState } from "@/lib/api";
import { renderScene } from "@/lib/render/render";
import { formatTimecode, totalDuration } from "@/lib/render/timeline";
import { CANVAS_H, CANVAS_W, type Layer, type RenderFonts, type Scene } from "@/lib/render/types";
import { cn } from "@/lib/utils";
import { lineRange, scriptLines, type StoryboardShot } from "@/lib/validation/script";

const JOIN_LABEL = { cut: "Cut", dissolve: "Smooth Fade", swap: "Slide Up" } as const;

/**
 * Scenes tab (_design/scene-tab-editor.jpg). Read-only — Claude Code does the editing.
 * One click on a scene selects it: the preview switches to that scene alone (scene view) and its own
 * elements open underneath; click it again to go back to the full video. Clicking an element jumps
 * the preview to the moment it appears.
 */
export function ScenesTab({
  state,
  selectedSceneId,
  playingSceneId,
  onSelectScene,
  onSeekScene,
}: {
  state: ProjectState;
  selectedSceneId: string | null;
  playingSceneId: string | null;
  onSelectScene: (sceneId: string | null) => void;
  /** Seek to a time inside a scene (scene seconds). */
  onSeekScene: (sceneId: string, local: number) => void;
}) {
  const { project, scenes } = state;
  const shots = (Array.isArray(project.storyboard) ? project.storyboard : []) as StoryboardShot[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          Scenes ({scenes.length})
          <Badge variant="secondary" className="font-mono tabular-nums">
            <ClockIcon data-icon="inline-start" />
            {formatTimecode(totalDuration(scenes))}
          </Badge>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <StatusCard icon={FileTextIcon} title="Script" ready={!!project.script} readyText="Approved and saved" waitingText="Claude Code writes it; you approve it in chat." />
        <StatusCard icon={LayoutListIcon} title="Storyboard" ready={!!project.storyboard} readyText="Approved and saved" waitingText="Shots, lines and cards — approved before any scene is built." />
      </div>

      {scenes.length === 0 && shots.length > 0 ? (
        <StoryboardShots shots={shots} script={project.script} projectId={project.id} />
      ) : scenes.length === 0 ? (
        <NoScenes projectId={project.id} />
      ) : (
        <ol className="flex flex-col gap-3">
          {scenes.map((scene, index) => {
            const selected = scene.id === selectedSceneId;
            return (
              <li key={scene.id}>
                <SceneCard
                  scene={scene}
                  number={index + 1}
                  selected={selected}
                  onScreen={scene.id === playingSceneId}
                  hasVoice={state.voiceClips.some((clip) => clip.sceneId === scene.id)}
                  onToggle={() => onSelectScene(selected ? null : scene.id)}
                  onSeekLayer={(layer) => onSeekScene(scene.id, layer.start)}
                  deleteAction={<DeleteSceneButton projectId={project.id} scene={scene} number={index + 1} onDeleted={() => onSelectScene(null)} />}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function SceneCard({
  scene,
  number,
  selected,
  onScreen,
  hasVoice,
  onToggle,
  onSeekLayer,
  deleteAction,
}: {
  scene: Scene;
  number: number;
  selected: boolean;
  onScreen: boolean;
  hasVoice: boolean;
  onToggle: () => void;
  onSeekLayer: (layer: Layer) => void;
  deleteAction: ReactNode;
}) {
  const [main, ...rest] = scene.title.split(" — ");
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors",
        selected && "border-2 border-brand shadow-[inset_4px_0_0_var(--brand)]",
        !selected && onScreen && "border-brand-border",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={selected}
        className="flex w-full items-center gap-4 p-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SceneThumb scene={scene} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="truncate text-[15px] font-semibold">
            {String(number).padStart(2, "0")} · {main}
            {rest.length > 0 && <span className="font-normal text-muted-foreground"> — {rest.join(" — ")}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-6">
              <ClockIcon data-icon="inline-start" />
              {formatTimecode(scene.durationSec).slice(1)}
            </Badge>
            <Badge variant="outline" className="h-6">
              <ShuffleIcon data-icon="inline-start" />
              {JOIN_LABEL[scene.join]}
            </Badge>
            {hasVoice ? (
              <Badge variant="brand" className="h-6">
                <MicIcon data-icon="inline-start" />
                Voiceover Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="h-6 text-muted-foreground">
                <MicIcon data-icon="inline-start" />
                No voice yet
              </Badge>
            )}
            {onScreen && <Badge variant="brand" className="h-6">On screen</Badge>}
          </div>
        </div>
        <ChevronDownIcon className={cn("size-5 shrink-0 text-faint transition-transform", selected && "rotate-180")} aria-hidden />
      </button>

      {selected && (
        <div className="border-t bg-well px-3 py-2">
          {scene.layers.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No elements — this scene plays as a blank frame. Nothing from other scenes shows here.
            </p>
          ) : (
            <ul className="flex flex-col" aria-label={`Elements in scene ${number}`}>
              {[...scene.layers].sort((a, b) => a.z - b.z).map((layer) => (
                <li key={layer.id}>
                  <button
                    type="button"
                    onClick={() => onSeekLayer(layer)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <LayerIcon layer={layer} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{layer.name}</span>
                      <span className="ml-2 text-muted-foreground">{layerDetail(layer)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {layer.start.toFixed(1)}–{Math.min(layer.end ?? scene.durationSec, scene.durationSec).toFixed(1)}s
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex justify-end border-t pt-2">{deleteAction}</div>
        </div>
      )}
    </div>
  );
}

/** Deletes a scene after the user confirms; the dialog says how many layers go with it. */
function DeleteSceneButton({ projectId, scene, number, onDeleted }: { projectId: string; scene: Scene; number: number; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: deleteSceneMutationFn,
    onSuccess: async () => {
      // Refresh first: the dialog keeps its spinner until the scene is actually gone from the list.
      await queryClient.invalidateQueries({ queryKey: projectKeys.state(projectId) });
      onDeleted();
      toast.success(`Deleted scene ${number}.`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't delete the scene."),
  });
  const layers = scene.layers.length;
  return (
    <ConfirmButton
      label="Delete scene"
      icon={TrashIcon}
      destructive
      title={`Delete scene ${number}, “${scene.title}”?`}
      description={
        layers > 0
          ? `This removes the scene and all ${layers} of its layer${layers === 1 ? "" : "s"} (${scene.layers
              .slice(0, 3)
              .map((l) => l.name)
              .join(", ")}${layers > 3 ? ", …" : ""}). It can't be undone.`
          : "This removes the scene. It has no layers. It can't be undone."
      }
      confirm="Delete scene"
      onConfirm={() => remove.mutateAsync({ projectId, sceneId: scene.id })}
    />
  );
}

/** A live thumbnail: the scene drawn at 40% of its length, on its own. */
function SceneThumb({ scene }: { scene: Scene }) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, fonts: RenderFonts) => renderScene(ctx, scene, scene.durationSec * 0.4, { fonts, blank: "#000000" }),
    [scene],
  );
  return (
    <RenderCanvas width={CANVAS_W} height={CANVAS_H} draw={draw} label={`${scene.title} thumbnail`} className="h-24 w-auto shrink-0 rounded-lg bg-black ring-1 ring-foreground/10" />
  );
}

function LayerIcon({ layer }: { layer: Layer }) {
  const Icon = layer.kind === "caption" ? TypeIcon : layer.kind === "code" ? CodeIcon : BoxIcon;
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function layerDetail(layer: Layer) {
  if (layer.kind === "caption") return `“${layer.text.replace(/\*/g, "")}”`;
  if (layer.kind === "element") return layer.elementRef;
  return "code";
}

function StatusCard({
  icon: Icon,
  title,
  ready,
  readyText,
  waitingText,
}: {
  icon: typeof FileTextIcon;
  title: string;
  ready: boolean;
  readyText: string;
  waitingText: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant={ready ? "brand" : "outline"} className="h-5">
            {ready ? "Ready" : "Waiting"}
          </Badge>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{ready ? readyText : waitingText}</p>
      </div>
    </div>
  );
}

/**
 * The approved storyboard, shown until scenes exist: one card per shot — place, the script lines it
 * carries (with their text), its cards and moves. Read-only; Claude Code builds a scene per shot.
 */
function StoryboardShots({ shots, script, projectId }: { shots: StoryboardShot[]; script: string | null; projectId: string }) {
  const lineText = new Map((script ? scriptLines(script) : []).map((l) => [l.n, l.text.replace(/\*/g, "")]));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="storyboard-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="storyboard-heading" className="section-heading text-[15px] font-semibold">
          Storyboard · {shots.length} shots
        </h3>
        <span className="text-xs text-muted-foreground">Scenes replace this as Claude Code builds them</span>
      </div>
      <ol className="flex flex-col gap-2.5">
        {shots.map((shot, i) => (
          <li key={shot.id} className="rounded-xl border bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[15px] font-semibold">{shot.id}</span>
              <span className="min-w-0 text-sm text-muted-foreground">— {shot.place}</span>
              <Badge variant="outline" className="ml-auto h-6">
                {lineRange(shot.lines)}
              </Badge>
              {shot.join && (
                <Badge variant="outline" className="h-6">
                  {JOIN_LABEL[shot.join]}
                </Badge>
              )}
            </div>
            <ul className="mt-2 flex flex-col gap-0.5 border-l-2 border-brand-border pl-3 text-sm">
              {shot.lines.map((n) => (
                <li key={n}>
                  <span className="mr-2 font-mono text-xs text-faint tabular-nums">{n}</span>
                  {lineText.get(n) ?? ""}
                </li>
              ))}
            </ul>
            {(shot.cards?.length || shot.moves || shot.hud) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {shot.hud && (
                  <Badge variant="secondary" className="font-mono">
                    {shot.hud}
                  </Badge>
                )}
                {shot.cards?.map((card, j) => (
                  <Badge key={j} variant="brand">
                    {card.kind}
                    {card.text ? `: ${card.text}` : card.items?.length ? `: ${card.items.join(" · ")}` : ""}
                  </Badge>
                ))}
                {shot.moves && <span className="basis-full pt-0.5">Moves: {shot.moves}</span>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {process.env.NODE_ENV !== "production" && <NoScenes projectId={projectId} />}
    </section>
  );
}

function NoScenes({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const seed = useMutation({
    mutationFn: () => seedDemoScenesMutationFn(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.state(projectId) });
      toast.success("Demo scenes loaded. Press play.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't load the demo."),
  });

  return (
    <Empty className="rounded-xl border bg-card py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClapperboardIcon />
        </EmptyMedia>
        <EmptyTitle>Waiting for Claude Code</EmptyTitle>
        <EmptyDescription>Scenes appear here as Claude Code builds them, one at a time, and the preview updates live.</EmptyDescription>
      </EmptyHeader>
      {process.env.NODE_ENV !== "production" && (
        <EmptyContent>
          <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
            {seed.isPending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
            Load demo scenes
          </Button>
          <p className="text-xs text-faint">Development only</p>
        </EmptyContent>
      )}
    </Empty>
  );
}
