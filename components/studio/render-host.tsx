"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

import type { RenderRequestResult, RenderRequestSpec } from "@/lib/db/app-schema";
import type { FromHost, HostScene, ToHost } from "@/lib/render/host/protocol";
import { cn } from "@/lib/utils";

export type RenderHostHandle = {
  /** Draw the video at time t (latest wins; the host drops frames it can't keep up with). */
  draw: (t: number) => void;
  /** Render frames for render_frames and run the checks, inside the sandbox. */
  capture: (spec: RenderRequestSpec) => Promise<RenderRequestResult>;
};

/** The two fonts the sandbox uses, fetched once per page (it has no network of its own). */
let fontsPromise: Promise<{ sans: ArrayBuffer; mono: ArrayBuffer }> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all([
    fetch("/render-host/fonts/inter.woff2").then((r) => r.arrayBuffer()),
    fetch("/render-host/fonts/jetbrains-mono.woff2").then((r) => r.arrayBuffer()),
  ]).then(([sans, mono]) => ({ sans, mono }));
  return fontsPromise;
}

/**
 * Embeds the sandboxed render host (public/render-host, built from lib/render/host). Agent-written
 * code (code layers, saved elements) only ever runs in there: an opaque-origin iframe with no network,
 * whose renderer worker is restarted if a layer hangs. Messages are accepted only from this iframe.
 */
export function RenderHostFrame({
  data,
  className,
  label,
  hidden,
  onLayerErrors,
  onRestarted,
  ref,
}: {
  data: HostScene;
  className?: string;
  label?: string;
  /** A capture-only host: present but invisible. */
  hidden?: boolean;
  onLayerErrors?: (errors: { layer: string; message: string }[]) => void;
  onRestarted?: (reason: string) => void;
  ref?: Ref<RenderHostHandle>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const lastT = useRef(0);
  const dataRef = useRef(data);
  const pending = useRef(new Map<string, { resolve: (r: RenderRequestResult) => void; reject: (e: Error) => void }>());
  const callbacks = useRef({ onLayerErrors, onRestarted });
  useEffect(() => {
    callbacks.current = { onLayerErrors, onRestarted };
  }, [onLayerErrors, onRestarted]);

  const send = useCallback((message: ToHost) => frame.current?.contentWindow?.postMessage(message, "*"), []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<FromHost>) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return; // only our sandbox
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready") {
        ready.current = false;
        send({ type: "init", fonts: await loadFonts() });
      } else if (msg.type === "initialized") {
        ready.current = true;
        send({ type: "load", data: dataRef.current });
        send({ type: "frame", t: lastT.current });
      } else if (msg.type === "captured" || msg.type === "capture-failed") {
        const waiter = pending.current.get(msg.id);
        pending.current.delete(msg.id);
        if (msg.type === "captured") waiter?.resolve(msg.result);
        else waiter?.reject(new Error(msg.message));
      } else if (msg.type === "layer-errors") {
        callbacks.current.onLayerErrors?.(msg.errors);
      } else if (msg.type === "restarted") {
        callbacks.current.onRestarted?.(msg.reason);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send]);

  // Keep the sandbox's copy of the scenes current.
  useEffect(() => {
    dataRef.current = data;
    if (ready.current) {
      send({ type: "load", data });
      send({ type: "frame", t: lastT.current });
    }
  }, [data, send]);

  useImperativeHandle(
    ref,
    () => ({
      draw(t) {
        lastT.current = t;
        if (ready.current) send({ type: "frame", t });
      },
      capture(spec) {
        return new Promise<RenderRequestResult>((resolve, reject) => {
          if (!ready.current) return reject(new Error("The renderer is still starting — try again in a moment."));
          const id = crypto.randomUUID();
          pending.current.set(id, { resolve, reject });
          send({ type: "capture", id, spec });
          setTimeout(() => {
            if (pending.current.delete(id)) reject(new Error("Rendering timed out in the studio."));
          }, 30_000);
        });
      },
    }),
    [send],
  );

  return (
    <iframe
      ref={frame}
      src="/render-host/index.html"
      sandbox="allow-scripts"
      title={label ?? "Video preview"}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      // A capture-only host is parked off-screen with inline styles (can't be lost to a missing class);
      // it keeps a real size so its document lays out normally.
      style={hidden ? { position: "fixed", left: -10_000, top: 0, width: 270, height: 480, opacity: 0, pointerEvents: "none", border: 0 } : undefined}
      className={cn(!hidden && "block border-0", className)}
    />
  );
}

/** Builds the sandbox's data from the project state. */
export function hostSceneData(
  scenes: HostScene["scenes"],
  elements: { name: string; role: string; code: string; codeHash: string; defaultParams: Record<string, unknown> }[],
  blank = "#000000",
): HostScene {
  return {
    scenes,
    elements: Object.fromEntries(elements.map((e) => [e.name, { code: e.code, codeHash: e.codeHash, defaultParams: e.defaultParams, role: e.role }])),
    blank,
  };
}
