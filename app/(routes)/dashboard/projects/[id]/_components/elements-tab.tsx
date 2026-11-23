"use client";

import { useCallback, useEffect, useState } from "react";

import { RenderCanvas } from "@/components/studio/render-canvas";
import { Badge } from "@/components/ui/badge";
import { ELEMENTS } from "@/lib/render/elements";
import { M } from "@/lib/render/helpers";
import type { Box, RenderFonts } from "@/lib/render/types";

/** Preview space for one element card: a 16:10 stage. */
const PW = 1080;
const PH = 675;
const LOOP = 3.6; // seconds each preview loops over

const FALLBACK_SPEC = { box: { x: 40, y: 40, w: PW - 80, h: PH - 80 } };

/** Where each element sits in its preview card, and the params it shows off with. */
const PREVIEW: Record<string, { box: Box; params?: Record<string, unknown>; bg?: string }> = {
  background: { box: { x: 0, y: 0, w: PW, h: PH }, params: { color: "#EEEBE3", grid: "rgba(20,20,20,0.06)" } },
  text: { box: { x: 40, y: 180, w: 1000, h: 300 }, params: { text: "NO *EDITOR*", underline: true, size: 200 } },
  chip: { box: { x: 80, y: 300, w: 900, h: 80 }, params: { size: 44 } },
  counter: { box: { x: 80, y: 290, w: 920, h: 100 }, params: { align: "center", size: 64, to: 150, duration: 2.4, label: "FRAMES" } },
  stamp: { box: { x: 290, y: 190, w: 500, h: 300 }, params: { size: 72 } },
  terminal: { box: { x: 90, y: 90, w: 900, h: 500 }, params: { lines: ["$ claude mcp add motionstudio", "✓ connected", "$ build scene 1"] } },
};

/**
 * Elements tab: the element library Claude Code builds with — today the built-in elements
 * (lib/render/elements.ts), later also the project's saved elements. Each card loops a live preview
 * drawn by the same renderer as the video.
 */
export function ElementsTab() {
  const t = useLoopClock(LOOP);
  const elements = Object.values(ELEMENTS);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          Elements ({elements.length})
          <Badge variant="outline">Built-in</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          The building blocks Claude Code places in scenes. Anything that appears twice becomes a saved element and shows here too.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4">
        {elements.map((element) => (
          <li key={element.name} className="overflow-hidden rounded-xl border bg-card">
            <ElementPreview name={element.name} t={t} />
            <div className="flex flex-col gap-1 border-t p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{element.name}</span>
                <span className="font-mono text-[11px] text-faint">{Object.keys(element.defaultParams).length} params</span>
              </div>
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground" title={element.description}>{element.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ElementPreview({ name, t }: { name: string; t: number }) {
  const element = ELEMENTS[name]!;
  const spec = PREVIEW[name] ?? FALLBACK_SPEC;
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, fonts: RenderFonts) => {
      ctx.fillStyle = spec.bg ?? "#F7F6F2";
      ctx.fillRect(0, 0, PW, PH);
      ctx.save();
      ctx.translate(spec.box.x, spec.box.y);
      element.draw(ctx, t, t / LOOP, spec.box.w, spec.box.h, { ...element.defaultParams, ...spec.params }, M, fonts);
      ctx.restore();
    },
    [element, spec, t],
  );
  return <RenderCanvas width={PW} height={PH} draw={draw} label={`${name} preview`} className="block w-full" />;
}

/** A looping clock for previews (0 → seconds, repeat). Paused when the tab is hidden. */
function useLoopClock(seconds: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT(((now - start) / 1000) % seconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seconds]);
  return t;
}
