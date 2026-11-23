"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { claimRenderJobFn, getProjectStateSinceFn, projectKeys, type ProjectState, type RenderJob } from "@/lib/api";

const TICK_MS = 1000;

/**
 * Live sync (plan, Phase 5). While the editor is open, every second:
 * 1. GET state?since=<version> — the full state only when Claude Code changed something; otherwise
 *    just the pulse (the agent's latest activity), merged into the cached state;
 * 2. claim the next render_frames job for this project, if one is waiting.
 * The clock is a tiny worker, so it keeps ticking in a background tab (page timers get throttled).
 */
export function useStudioSync(projectId: string, onJob: (job: RenderJob) => void) {
  const queryClient = useQueryClient();
  const onJobRef = useRef(onJob);
  useEffect(() => {
    onJobRef.current = onJob;
  }, [onJob]);

  useEffect(() => {
    let busy = false;
    let stopped = false;
    const key = projectKeys.state(projectId);

    const tick = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const current = queryClient.getQueryData<ProjectState>(key);
        if (current) {
          const next = await getProjectStateSinceFn(projectId, current.project.version);
          if ("unchanged" in next) {
            if (next.agentActivityAt !== current.project.agentActivityAt) {
              queryClient.setQueryData<ProjectState>(key, (prev) =>
                prev ? { ...prev, project: { ...prev.project, agentActivity: next.agentActivity, agentActivityAt: next.agentActivityAt } } : prev,
              );
            }
          } else {
            queryClient.setQueryData<ProjectState>(key, next);
          }
          // Only claim render jobs once the editor has state to render them with.
          const job = await claimRenderJobFn(projectId);
          if (job) onJobRef.current(job);
        }
      } catch {
        // Network blips: the next tick tries again.
      } finally {
        busy = false;
      }
    };

    let worker: Worker | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${TICK_MS})`], { type: "text/javascript" })));
      worker.onmessage = () => void tick();
    } catch {
      interval = setInterval(() => void tick(), TICK_MS); // fallback if workers are unavailable
    }
    return () => {
      stopped = true;
      worker?.terminate();
      if (interval) clearInterval(interval);
    };
  }, [projectId, queryClient]);
}
