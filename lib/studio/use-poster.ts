"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type RefObject } from "react";

import type { RenderHostHandle } from "@/components/studio/render-host";
import { projectKeys, savePosterMutationFn, type ProjectState } from "@/lib/api";

/** The project must sit unchanged this long before its poster is taken (Claude Code may still be editing). */
const STABLE_MS = 10_000;
/** The poster frame: 1 s in (past the first scene's entrance), or the middle of a shorter video. */
const POSTER_T = 1;
const POSTER_LONG_EDGE = 960;

/**
 * Keeps the project's poster (Recents, Projects) current: once the version has been the same for
 * 10 s and the poster shows an older version, render the frame at t = 1 s in the sandbox (540×960
 * JPEG) and store it. A failure is retried only after the next change, never in a loop.
 */
export function usePoster(projectId: string, state: ProjectState | undefined, host: RefObject<RenderHostHandle | null>) {
  const queryClient = useQueryClient();
  const failedAt = useRef<number | null>(null);

  const version = state?.project.version;
  const posterVersion = state?.project.posterVersion;
  const duration = state?.project.durationSec ?? 0;
  const hasScenes = (state?.scenes.length ?? 0) > 0;

  useEffect(() => {
    if (version === undefined || !hasScenes || duration <= 0) return;
    if (posterVersion === version || failedAt.current === version) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (!host.current) return;
        const jpeg = await host.current.still(Math.min(POSTER_T, duration / 2), POSTER_LONG_EDGE);
        if (cancelled) return;
        const saved = await savePosterMutationFn({ projectId, version, jpeg });
        // The poster isn't a content change (no version bump), so live sync won't bring it: patch the cache.
        queryClient.setQueryData<ProjectState>(projectKeys.state(projectId), (old) =>
          old ? { ...old, project: { ...old.project, posterUrl: saved.posterUrl, posterVersion: saved.posterVersion } } : old,
        );
        void queryClient.invalidateQueries({ queryKey: projectKeys.list() });
      } catch (error) {
        failedAt.current = version;
        console.warn("[poster] couldn't refresh the poster:", error);
      }
    }, STABLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, version, posterVersion, duration, hasScenes, host, queryClient]);
}
