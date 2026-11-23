"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { RenderHostHandle } from "@/components/studio/render-host";
import { projectKeys, savePosterMutationFn, type ProjectState } from "@/lib/api";
import { FPS } from "@/lib/render/types";

/** The project must sit unchanged this long before its poster is re-taken (Claude Code may still be editing). */
const STABLE_MS = 10_000;
/** The default poster frame: 1 s in (past the first scene's entrance), or the middle of a shorter video. */
const DEFAULT_T = 1;
const POSTER_LONG_EDGE = 960;

/** The frame to use: the one the user picked (kept inside the video if it got shorter), else 1 s in. */
function posterTime(pickedAt: number | null | undefined, duration: number) {
  if (pickedAt !== null && pickedAt !== undefined) return Math.max(0, Math.min(pickedAt, duration - 1 / FPS));
  return Math.min(DEFAULT_T, duration / 2);
}

/**
 * Keeps the project's poster (Recents, Projects) current. The frame is rendered by the hidden capture
 * host — independent of the preview and of playback — as a 540×960 JPEG and stored on Cloudinary.
 * - Automatically: once the version has been the same for 10 s and the poster shows an older version,
 *   re-take it at the picked frame (or 1 s in). A failure is retried only after the next change.
 * - On request: `setPosterFrame(t)` ("Use this frame as poster") takes frame t now and remembers t.
 */
export function usePoster(projectId: string, state: ProjectState | undefined, host: RefObject<RenderHostHandle | null>) {
  const queryClient = useQueryClient();
  const failedAt = useRef<number | null>(null);

  const version = state?.project.version;
  const posterVersion = state?.project.posterVersion;
  const pickedAt = state?.project.posterTimeSec;
  const duration = state?.project.durationSec ?? 0;
  const hasScenes = (state?.scenes.length ?? 0) > 0;

  /** Renders frame t, stores it, and patches the cache (a poster isn't a content change, so live sync won't bring it). */
  const take = useCallback(
    async (atVersion: number, t: number, picked: boolean) => {
      if (!host.current) throw new Error("The renderer isn't ready yet.");
      const jpeg = await host.current.still(t, POSTER_LONG_EDGE);
      const saved = await savePosterMutationFn({ projectId, version: atVersion, jpeg, pickedAt: picked ? t : undefined });
      queryClient.setQueryData<ProjectState>(projectKeys.state(projectId), (old) =>
        old
          ? { ...old, project: { ...old.project, posterUrl: saved.posterUrl, posterVersion: saved.posterVersion, posterTimeSec: saved.posterTimeSec } }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.list() });
    },
    [host, projectId, queryClient],
  );

  useEffect(() => {
    if (version === undefined || !hasScenes || duration <= 0) return;
    if (posterVersion === version || failedAt.current === version) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      take(version, posterTime(pickedAt, duration), false).catch((error) => {
        failedAt.current = version;
        console.warn("[poster] couldn't refresh the poster:", error);
      });
    }, STABLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [version, posterVersion, pickedAt, duration, hasScenes, take]);

  /** "Use this frame as poster": t is in video seconds. */
  const setPosterFrame = useCallback(
    async (t: number) => {
      if (version === undefined || duration <= 0) throw new Error("There's no video to take a poster from yet.");
      await take(version, posterTime(t, duration), true);
    },
    [version, duration, take],
  );

  return { setPosterFrame };
}
