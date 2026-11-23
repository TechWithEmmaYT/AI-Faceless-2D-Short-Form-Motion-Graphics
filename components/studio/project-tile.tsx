"use client";

import { ClockIcon, PlayIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectSummary } from "@/lib/api";
import { cloudinaryLoader, isCloudinaryImage } from "@/lib/cloudinary-loader";
import { STYLE_ART, formatDuration, formatRelative } from "@/lib/styles";

const TILE_SIZES = "(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw";
const TILE_IMAGE = "object-cover transition-transform duration-300 group-hover/tile:scale-[1.04]";

/** The project's poster, straight from Cloudinary's CDN (resized there, never proxied through our server). */
function Poster({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      loader={isCloudinaryImage(src) ? cloudinaryLoader : undefined}
      alt=""
      fill
      sizes={TILE_SIZES}
      onLoad={() => setLoaded(true)}
      className={cn(TILE_IMAGE, "transition-[opacity,transform]", loaded ? "opacity-100" : "opacity-0")}
    />
  );
}

/**
 * A project in the Recents row / Projects grid (DESIGN.md "Recents tiles"): thumbnail, frosted
 * duration + age pills, title on a dark gradient. Until a poster is rendered, the style's art stands in.
 */
export function ProjectTile({ project }: { project: ProjectSummary }) {
  const art = STYLE_ART[project.motionStyle];
  const hasVideo = project.durationSec > 0;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="group/tile relative block aspect-4/5 overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Image src={art.image} alt="" fill sizes={TILE_SIZES} className={TILE_IMAGE} />
      {/* The poster fades in over the style art once it arrives: a slow CDN never leaves a blank tile. */}
      {project.posterUrl ? <Poster key={project.posterUrl} src={project.posterUrl} /> : null}
      <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
        <Badge variant="overlay">
          {hasVideo ? <PlayIcon data-icon="inline-start" className="fill-current" /> : null}
          {hasVideo ? formatDuration(project.durationSec) : "Draft"}
        </Badge>
        <Badge variant="overlay">
          <ClockIcon data-icon="inline-start" />
          {formatRelative(project.updatedAt)}
        </Badge>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 pb-2.5">
        <p className="line-clamp-2 text-sm leading-tight font-semibold text-white">{project.title}</p>
      </div>
    </Link>
  );
}

/** The dashed "+" tile that always leads Home's Recents row (not the Projects grid). */
export function NewProjectTile({ hasProjects }: { hasProjects: boolean }) {
  return (
    <Link
      href="/dashboard/projects/new"
      className="flex aspect-4/5 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card text-center outline-none transition-colors hover:border-brand hover:bg-brand-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <PlusIcon className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col gap-0.5 px-3">
        <span className="text-sm font-semibold text-foreground">{hasProjects ? "New short" : "Start your first short"}</span>
        <span className="text-xs text-muted-foreground">Pick a style, then hand it to Claude Code</span>
      </span>
    </Link>
  );
}

export function ProjectTileSkeleton() {
  return <Skeleton className="aspect-4/5 rounded-xl" />;
}
