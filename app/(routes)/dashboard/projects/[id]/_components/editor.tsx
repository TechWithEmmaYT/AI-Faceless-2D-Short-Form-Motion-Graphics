"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, BoxesIcon, CodeXmlIcon, FileQuestionIcon, FilmIcon, MicIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RenderHostFrame, hostSceneData, type RenderHostHandle } from "@/components/studio/render-host";
import { ApiError, completeRenderJobFn, getProjectStateQueryFn, projectKeys, setSelectionMutationFn, type RenderJob } from "@/lib/api";
import { sceneStarts, totalDuration } from "@/lib/render/timeline";
import { usePoster } from "@/lib/studio/use-poster";
import { useStudioSync } from "@/lib/studio/use-studio-sync";

import { ClaudeTab } from "./claude-tab";
import { ElementsTab } from "./elements-tab";
import { ExportButton } from "./export-dialog";
import { PreviewPlayer, type PlayerHandle } from "./preview-player";
import { ScenesTab } from "./scenes-tab";
import { VoiceTab } from "./voice-tab";

const TABS = [
  { value: "claude", label: "Claude Code", icon: CodeXmlIcon },
  { value: "scenes", label: "Scenes", icon: FilmIcon },
  { value: "elements", label: "Elements", icon: BoxesIcon },
  { value: "voice", label: "Voice", icon: MicIcon },
] as const;
type TabValue = (typeof TABS)[number]["value"];

/**
 * The editor (_design/claude-mcp.jpg, scene-tab-editor.jpg, voice-tab-editor.jpg): header, tabs on
 * the left, the 9:16 preview on a dotted stage on the right. No manual timeline editing — Claude Code
 * edits through MCP; this view shows and plays what it builds.
 */
export function Editor() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab");
  const tab: TabValue = TABS.some((t) => t.value === tabParam) ? (tabParam as TabValue) : "claude";

  useCollapsedSidebar();

  // Loaded once; afterwards live sync (useStudioSync) keeps it current as Claude Code edits.
  const { data: state, isPending, error } = useQuery({
    queryKey: projectKeys.state(id),
    queryFn: () => getProjectStateQueryFn(id),
    staleTime: Infinity,
  });
  // Tell the server which scene is open, so get_selection can resolve "this scene".
  const saveSelection = useMutation({ mutationFn: setSelectionMutationFn });

  const player = useRef<PlayerHandle>(null);

  // render_frames: Claude Code asks to see frames → pause playback, render them in the sandbox
  // (a hidden capture host with the full video), and hand them back.
  const captureHost = useRef<RenderHostHandle>(null);
  const [capturing, setCapturing] = useState(false);
  const onRenderJob = useCallback(async (job: RenderJob) => {
    player.current?.pause();
    setCapturing(true);
    try {
      if (!captureHost.current) throw new Error("The studio's renderer isn't ready yet.");
      const result = await captureHost.current.capture(job.request);
      // Hand the frames back; a network blip shouldn't cost the agent its frames, so retry twice.
      for (let attempt = 0; ; attempt++) {
        try {
          await completeRenderJobFn({ jobId: job.id, outcome: { result } });
          break;
        } catch (error) {
          if (attempt >= 2) throw error;
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    } catch (error) {
      await completeRenderJobFn({ jobId: job.id, outcome: { error: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
    } finally {
      setCapturing(false);
    }
  }, []);
  useStudioSync(id, onRenderJob);
  const { setPosterFrame } = usePoster(id, state, captureHost);
  const now = useNow(1000);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const onSceneChange = useCallback((sceneId: string | null) => setPlayingSceneId(sceneId), []);

  // Stable references, so the sandboxes only reload when the project actually changes.
  const scenesAll = state?.scenes;
  const soloScene = scenesAll?.find((s) => s.id === selectedSceneId) ?? null;
  const playerScenes = useMemo(() => (soloScene ? [soloScene] : (scenesAll ?? [])), [soloScene, scenesAll]);
  const elements = state?.elements;
  const captureData = useMemo(() => hostSceneData(scenesAll ?? [], elements ?? []), [scenesAll, elements]);

  const setTab = (value: TabValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  if (isPending) return <EditorSkeleton />;
  if (error) return <EditorError notFound={error instanceof ApiError && error.status === 404} />;

  const { project, scenes } = state;
  // Scene view: a selected scene plays on its own; otherwise the full video plays.
  const soloIndex = scenes.findIndex((s) => s.id === selectedSceneId);
  const solo = soloIndex >= 0 ? scenes[soloIndex]! : null;

  const selectScene = (sceneId: string | null) => {
    setSelectedSceneId(sceneId);
    saveSelection.mutate({ projectId: id, sceneId });
    // Same player, same sandbox — no reload, so no black flash; it starts the new view at 0 with a soft fade.
    player.current?.switchTo(0);
  };
  const seekScene = (sceneId: string, local: number) => {
    if (sceneId !== selectedSceneId) {
      setSelectedSceneId(sceneId);
      saveSelection.mutate({ projectId: id, sceneId });
      player.current?.switchTo(local);
      return;
    }
    player.current?.seek(local);
  };

  const activityAge = project.agentActivityAt ? now - Date.parse(project.agentActivityAt) : Infinity;
  const agentLabel = capturing ? "Looking at frames" : activityAge < AGENT_ACTIVE_MS ? (project.agentActivity ?? "Working") : null;

  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col">
      {agentLabel && <AgentStatus label={agentLabel} />}
      {/* Renders render_frames jobs with the full video, whatever the preview is showing. */}
      <RenderHostFrame ref={captureHost} data={captureData} hidden label="Frame capture" />
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Button
          variant="outline"
          size="icon-lg"
          className="size-10 shrink-0 rounded-full"
          render={<Link href="/dashboard/projects" aria-label="Back to Projects" />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 truncate text-lg font-bold">{project.title}</h1>
        <span className="shrink-0 text-sm text-faint">Saved</span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden h-9 rounded-lg px-3 text-sm @2xl:inline-flex">
            9:16 Portrait
          </Badge>
          <ExportButton state={state} hostData={captureData} onStart={() => player.current?.pause()} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_minmax(400px,48%)]">
        {/* Left: tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="flex min-h-0 flex-col gap-0 border-r bg-card">
          {/* The divider is an inset line on the list itself, so the active tab's underline sits exactly on it. */}
          <div className="no-scrollbar shrink-0 overflow-x-auto px-5 shadow-[inset_0_-1px_0_var(--border)]">
            <TabsList variant="line" className="justify-start gap-8 p-0 group-data-horizontal/tabs:h-14">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-full flex-none gap-2 px-1.5 text-[15px] group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
                >
                  <Icon />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="@container min-h-0 flex-1 overflow-y-auto bg-background p-5 @4xl:bg-card">
            <TabsContent value="claude" className="h-full">
              <ClaudeTab state={state} />
            </TabsContent>
            <TabsContent value="scenes">
              <ScenesTab
                state={state}
                selectedSceneId={selectedSceneId}
                playingSceneId={solo ? solo.id : playingSceneId}
                onSelectScene={selectScene}
                onSeekScene={seekScene}
              />
            </TabsContent>
            <TabsContent value="elements">
              <ElementsTab />
            </TabsContent>
            <TabsContent value="voice">
              <VoiceTab state={state} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Right: the preview on the dotted stage */}
        <section aria-label="Preview" className="dot-grid min-h-[70svh] p-5 @4xl:min-h-0">
          <PreviewPlayer
            ref={player}
            scenes={playerScenes}
            elements={state.elements}
            voiceClips={state.voiceClips}
            sounds={state.sounds}
            timeOffset={solo ? (sceneStarts(scenes).get(solo.id) ?? 0) : 0}
            videoDuration={totalDuration(scenes)}
            onSceneChange={solo ? undefined : onSceneChange}
            onUseAsPoster={setPosterFrame}
            banner={
              solo ? (
                <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-full border bg-card py-1 pr-1 pl-4 text-sm shadow-sm">
                  <span className="truncate">
                    <span className="font-semibold">Scene {soloIndex + 1}</span>
                    <span className="text-muted-foreground"> of {scenes.length} · {solo.title.split(" — ")[0]}</span>
                  </span>
                  <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => selectScene(null)}>
                    <XIcon data-icon="inline-start" />
                    Full video
                  </Button>
                </div>
              ) : null
            }
          />
        </section>
      </div>
    </div>
  );
}

/** How long after its last MCP call the agent still counts as "working". */
const AGENT_ACTIVE_MS = 15_000;

/** Floating status at the top of the editor while Claude Code is working on this project. */
function AgentStatus({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute top-20 left-1/2 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-2.5 rounded-full border border-brand-border bg-card py-1.5 pr-4 pl-3 text-sm shadow-lg">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
        </span>
        <span className="font-semibold">Agent is working</span>
        <span className="text-muted-foreground">· {label}</span>
      </div>
    </div>
  );
}

/** Current time, refreshed every `ms` — for UI that expires (the agent pill). */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** The editor needs the room: collapse the sidebar to its icon rail on open, restore it on leave. */
function useCollapsedSidebar() {
  const { open, setOpen } = useSidebar();
  const wasOpen = useRef(open);
  useEffect(() => {
    const restore = wasOpen.current;
    setOpen(false);
    return () => setOpen(restore);
    // Run once per editor visit, not on every toggle the user makes while in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function EditorSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy>
      <div className="flex h-16 items-center gap-3 border-b bg-card px-4">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="ml-auto h-10 w-28 rounded-lg" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_48%]">
        <div className="flex flex-col gap-4 border-r bg-card p-5">
          <div className="flex gap-5 border-b pb-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-24" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <div className="dot-grid hidden flex-col items-center justify-center gap-4 p-5 lg:flex">
          <Skeleton className="aspect-9/16 h-[75%] rounded-2xl" />
          <Skeleton className="h-11 w-full max-w-md rounded-full" />
        </div>
      </div>
    </div>
  );
}

function EditorError({ notFound }: { notFound: boolean }) {
  return (
    <div className="p-6">
      <Empty className="rounded-xl border bg-card py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>{notFound ? "Project not found" : "Couldn't load this project"}</EmptyTitle>
          <EmptyDescription>{notFound ? "It may have been deleted, or it belongs to another account." : "Check your connection and try again."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" render={<Link href="/dashboard/projects" />} nativeButton={false}>
            Back to Projects
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export { EditorSkeleton };
