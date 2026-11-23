import { PlayIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * DESIGN.md: a sunflower rounded tile with a black play glyph, beside "MotionStudio" in bold.
 * Inside a collapsed (icon) sidebar only the tile shows.
 */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="MotionStudio"
      className={cn("inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand">
        <PlayIcon className="size-4 fill-brand-foreground text-brand-foreground" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">MotionStudio</span>
    </Link>
  );
}
