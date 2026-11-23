import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BRIEFS } from "@/lib/agent/briefs";
import { EXAMPLES } from "@/lib/agent/examples";
import { MOTION_STYLES, type MotionStyle } from "@/lib/db/app-schema";

import { CreateProjectForm } from "./_components/create-project-form";

export const metadata: Metadata = { title: "Create Project" };

/** Create Project (_design/create-screen.jpg). The header is static; the form reads ?style= so it streams. */
export default function NewProjectPage({ searchParams }: PageProps<"/dashboard/projects/new">) {
  return (
    <div className="@container mx-auto flex w-full max-w-300 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon-lg"
          className="size-11 shrink-0 rounded-full"
          render={<Link href="/dashboard" aria-label="Back to Home" />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Create Project</h1>
          <p className="text-sm text-muted-foreground">Turn your idea into a 2D motion project with Claude Code MCP &amp; Fish Audio</p>
        </div>
      </header>

      <Suspense fallback={<FormSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/dashboard/projects/new">, "searchParams">) {
  const { style } = await searchParams;
  const initialStyle: MotionStyle = MOTION_STYLES.includes(style as MotionStyle) ? (style as MotionStyle) : "story-scene";

  return (
    <CreateProjectForm
      initialStyle={initialStyle}
      // Only what the client needs: briefs and examples carry long agent-facing text.
      styles={BRIEFS.map(({ id, name }) => ({ id, name }))}
      examples={EXAMPLES.map(({ style, title, seconds }) => ({ style, title, seconds }))}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-[640px] rounded-xl" />
    </div>
  );
}
