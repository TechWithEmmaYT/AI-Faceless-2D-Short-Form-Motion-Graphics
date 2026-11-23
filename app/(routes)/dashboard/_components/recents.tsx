"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, PlayIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { NewProjectTile, ProjectTile, ProjectTileSkeleton } from "@/components/studio/project-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Example } from "@/lib/agent/examples/types";
import { getProjectsQueryFn, projectKeys } from "@/lib/api";
import { STYLE_ART, formatDuration } from "@/lib/styles";

const ROW = 5;
type ExampleInfo = Pick<Example, "style" | "title" | "seconds">;

/**
 * Home's Recents row: the user's latest projects (useQuery → GET /api/projects), skeleton tiles
 * while loading. A studio with no projects yet shows a "start" tile and the four worked examples
 * instead — real stills of what each style renders.
 */
export function Recents({ examples }: { examples: ExampleInfo[] }) {
  const { data: projects, isPending } = useQuery({ queryKey: projectKeys.list(), queryFn: getProjectsQueryFn });

  return (
    <section aria-labelledby="recents-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 id="recents-heading" className="section-heading text-xl">
          Recents
        </h2>
        <Button variant="ghost" render={<Link href="/dashboard/projects" />} nativeButton={false} className="font-semibold">
          See all
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>

      <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-3 @4xl:grid-cols-5" aria-busy={isPending}>
        {isPending ? (
          Array.from({ length: ROW }, (_, i) => (
            <li key={i}>
              <ProjectTileSkeleton />
            </li>
          ))
        ) : projects && projects.length > 0 ? (
          <>
            {/* The "+" tile always leads the row; the latest projects fill the rest. */}
            <li>
              <NewProjectTile hasProjects />
            </li>
            {projects.slice(0, ROW - 1).map((project) => (
              <li key={project.id}>
                <ProjectTile project={project} />
              </li>
            ))}
          </>
        ) : (
          <>
            <li>
              <NewProjectTile hasProjects={false} />
            </li>
            {examples.map((example) => (
              <li key={example.style}>
                <ExampleTile example={example} />
              </li>
            ))}
          </>
        )}
      </ul>
    </section>
  );
}


function ExampleTile({ example }: { example: ExampleInfo }) {
  return (
    <Link
      href={`/dashboard/projects/new?style=${example.style}`}
      className="group/tile relative block aspect-4/5 overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`Example: ${example.title}. Start a project in this style`}
    >
      <Image
        src={STYLE_ART[example.style].shot}
        alt=""
        fill
        sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
        className="object-cover transition-transform duration-300 group-hover/tile:scale-[1.04]"
      />
      <div className="absolute inset-x-2 top-2 flex items-center justify-between">
        <Badge variant="overlay">
          <PlayIcon data-icon="inline-start" className="fill-current" />
          {formatDuration(example.seconds)}
        </Badge>
        <Badge variant="overlay">Example</Badge>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 pb-2.5">
        <p className="line-clamp-2 text-sm leading-tight font-semibold text-white">{example.title}</p>
      </div>
    </Link>
  );
}
