"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderIcon, PlusIcon, RotateCwIcon, SearchIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { ProjectTile, ProjectTileSkeleton } from "@/components/studio/project-tile";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProjectsQueryFn, projectKeys, type ProjectSummary } from "@/lib/api";
import type { MotionStyle } from "@/lib/db/app-schema";

/**
 * Projects (_design/all-project-screen.jpg): title, search, Create Project, then line tabs over the
 * grid. Tabs filter by motion style — every tab works with today's data; Starred / Archived from the
 * mock-up wait until projects can be starred or archived.
 */
const TABS: { value: "all" | MotionStyle; label: string }[] = [
  { value: "all", label: "All Projects" },
  { value: "story-scene", label: "Story Scene" },
  { value: "presenter", label: "Presenter" },
  { value: "system", label: "System" },
  { value: "documentary", label: "Documentary" },
];

const GRID = "grid grid-cols-2 gap-4 @2xl:grid-cols-3 @4xl:grid-cols-5";

export function ProjectsBrowser() {
  const { data: projects, isPending, isError, refetch } = useQuery({ queryKey: projectKeys.list(), queryFn: getProjectsQueryFn });
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());

  const counts = useMemo(() => {
    const byStyle: Record<string, number> = { all: projects?.length ?? 0 };
    for (const p of projects ?? []) byStyle[p.motionStyle] = (byStyle[p.motionStyle] ?? 0) + 1;
    return byStyle;
  }, [projects]);

  const visible = useMemo(
    () =>
      (projects ?? []).filter(
        (p: ProjectSummary) => (tab === "all" || p.motionStyle === tab) && (!query || p.title.toLowerCase().includes(query)),
      ),
    [projects, tab, query],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage and edit your 2D motion projects generated with Claude Code</p>
        </div>
        <div className="flex items-center gap-3">
          <InputGroup className="h-11 w-full bg-card @3xl:w-72">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
            />
          </InputGroup>
          <Button size="lg" className="h-11 shrink-0 px-4" render={<Link href="/dashboard/projects/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            Create Project
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="gap-6">
        <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
          <TabsList variant="line" className="w-full justify-start gap-8 p-0 shadow-[inset_0_-1px_0_var(--border)] group-data-horizontal/tabs:h-12">
            {TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="h-full flex-none px-1 text-[15px] group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold">
                {label}
                {!isPending && (
                  <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{counts[value] ?? 0}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={tab}>
          {isPending ? (
            <ul className={GRID} aria-busy>
              {Array.from({ length: 10 }, (_, i) => (
                <li key={i}>
                  <ProjectTileSkeleton />
                </li>
              ))}
            </ul>
          ) : isError ? (
            <Empty className="rounded-xl border bg-card py-16">
              <EmptyHeader>
                <EmptyTitle>Couldn&apos;t load your projects</EmptyTitle>
                <EmptyDescription>Check your connection and try again.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => refetch()}>
                  <RotateCwIcon data-icon="inline-start" />
                  Try again
                </Button>
              </EmptyContent>
            </Empty>
          ) : projects.length === 0 ? (
            <Empty className="rounded-xl border bg-card py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderIcon />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>Every short you make with Claude Code will be listed here.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="lg" render={<Link href="/dashboard/projects/new" />} nativeButton={false}>
                  <PlusIcon data-icon="inline-start" />
                  Create Project
                </Button>
              </EmptyContent>
            </Empty>
          ) : visible.length === 0 ? (
            <Empty className="rounded-xl border bg-card py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchXIcon />
                </EmptyMedia>
                <EmptyTitle>No matching projects</EmptyTitle>
                <EmptyDescription>
                  {query ? `Nothing here matches “${search.trim()}”.` : "No projects in this style yet."}
                </EmptyDescription>
              </EmptyHeader>
              {query && (
                <EmptyContent>
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <ul className={GRID}>
              {visible.map((project) => (
                <li key={project.id}>
                  <ProjectTile project={project} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
