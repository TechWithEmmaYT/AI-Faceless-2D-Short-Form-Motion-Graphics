import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { StyleCard } from "@/components/studio/style-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BRIEFS } from "@/lib/agent/briefs";

const PROMISES = ["Writes faceless scripts & scenes", "Generates 2D motion via Claude Code MCP", "Voiceovers powered by Fish Audio"];

/** Public landing. Fully static — no session read — so it prerenders whole. */
export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="lg" render={<Link href="/auth/sign-in" />} nativeButton={false}>
              Sign in
            </Button>
            <Button size="lg" render={<Link href="/auth/sign-up" />} nativeButton={false}>
              Get started
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 sm:px-8 sm:py-16">
        <Card className="relative grid grid-cols-1 items-center gap-10 px-8 py-10 sm:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="flex max-w-xl flex-col gap-6">
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.02em] text-foreground sm:text-5xl">
              Build faceless 2D <span className="highlight">motion</span> shorts from a prompt
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Claude Code writes the script, storyboards it, voices it with Fish Audio and builds every scene. You approve the
              plan and watch the preview update live. Then export a 9:16 MP4 for Shorts, TikTok and Reels.
            </p>
            <ul className="flex flex-col gap-3">
              {PROMISES.map((line) => (
                <li key={line} className="flex items-center gap-3 text-[15px] text-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <Button size="lg" className="h-12 w-fit px-6 text-[15px]" render={<Link href="/auth/sign-up" />} nativeButton={false}>
              Create a Project
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>

          <div aria-hidden className="relative hidden min-h-80 lg:block">
            <div className="absolute top-1/3 -right-40 h-[360px] w-[600px] -rotate-12 rounded-[50%] bg-brand" />
            <Image
              src="/images/banner.webp"
              alt=""
              width={880}
              height={561}
              priority
              sizes="440px"
              className="absolute inset-x-0 top-1/2 h-auto w-full -translate-y-1/2"
            />
          </div>
        </Card>

        <section className="flex flex-col gap-5">
          <h2 className="section-heading text-xl">Four motion styles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BRIEFS.map((brief) => (
              <StyleCard key={brief.id} brief={brief} href="/auth/sign-up" />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">MotionStudio — the studio for Claude Code.</footer>
    </div>
  );
}
