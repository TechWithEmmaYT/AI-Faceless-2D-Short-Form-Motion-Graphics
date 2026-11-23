import type { Metadata } from "next";

import { StyleCard } from "@/components/studio/style-card";
import { BRIEFS } from "@/lib/agent/briefs";
import { EXAMPLES } from "@/lib/agent/examples";

import { HeroBanner } from "./_components/hero-banner";
import { Recents } from "./_components/recents";

export const metadata: Metadata = { title: "Home" };

/**
 * Home (_design/home-screen.jpg): the four motion styles, the hero banner, then Recents.
 * Static today; Recents will read the user's projects (behind a Suspense boundary) in Phase 2.
 */
export default function DashboardHome() {
  return (
    <div className="@container mx-auto flex w-full max-w-300 flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="sr-only">Home</h1>

      <section aria-labelledby="quick-start-heading" className="flex flex-col gap-4">
        <h2 id="quick-start-heading" className="section-heading text-xl">
          Quick Start
        </h2>
        <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
          {BRIEFS.map((brief, index) => (
            <StyleCard key={brief.id} brief={brief} href={`/dashboard/projects/new?style=${brief.id}`} priority={index < 4} />
          ))}
        </div>
      </section>

      <HeroBanner />

      {/* Only the fields the tiles need — EXAMPLES also carries long agent-facing text. */}
      <Recents examples={EXAMPLES.map(({ style, title, seconds }) => ({ style, title, seconds }))} />
    </div>
  );
}
