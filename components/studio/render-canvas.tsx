"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { RenderFonts } from "@/lib/render/types";

/**
 * A canvas that draws in a fixed logical space (e.g. 1080×1920) at the element's real pixel size,
 * so frames stay sharp at any zoom or DPR. `draw` gets a context already scaled to logical units.
 * Redraws when `draw` changes (pass a new callback for a new frame) and when fonts finish loading.
 */
export function RenderCanvas({
  width,
  height,
  draw,
  className,
  style,
  label,
}: {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, fonts: RenderFonts) => void;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const fonts = useRenderFonts();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect;
      setSize({ w: box.width, h: box.height, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !size.w || !fonts) return;
    const pw = Math.round(size.w * size.dpr);
    const ph = Math.round(size.h * size.dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pw / width, 0, 0, ph / height, 0, 0);
    draw(ctx, fonts);
  }, [draw, size, fonts, width, height]);

  return <canvas ref={ref} role="img" aria-label={label} className={className} style={{ aspectRatio: `${width} / ${height}`, ...style }} />;
}

/**
 * Inter and JetBrains Mono come from next/font, whose family names are hashed; read them from the CSS
 * variables, and wait until they're loaded so the first frame isn't drawn in a fallback face.
 */
function useRenderFonts(): RenderFonts | null {
  const [fonts, setFonts] = useState<RenderFonts | null>(null);
  useEffect(() => {
    let cancelled = false;
    const css = getComputedStyle(document.documentElement);
    const resolved: RenderFonts = {
      sans: css.getPropertyValue("--font-inter").trim() || "Inter, system-ui, sans-serif",
      mono: css.getPropertyValue("--font-jetbrains-mono").trim() || "ui-monospace, monospace",
    };
    Promise.all([
      document.fonts.load(`800 72px ${resolved.sans}`),
      document.fonts.load(`500 32px ${resolved.mono}`),
    ])
      .catch(() => undefined)
      .then(() => !cancelled && setFonts(resolved));
    return () => {
      cancelled = true;
    };
  }, []);
  return fonts;
}
