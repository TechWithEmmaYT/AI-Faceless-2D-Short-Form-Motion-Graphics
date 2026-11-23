import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const PROMISES = ["Writes faceless scripts & scenes", "Generates 2D motion via Claude Code MCP", "Voiceovers powered by Fish Audio"];

/**
 * Home's hero banner (_design/home-screen.jpg): headline with one highlighted word and the primary
 * CTA, a divider, the three promises, and on wide screens the illustration on a yellow sweep.
 * The art lives in its own right-hand panel (clipped by the card), so it can never cover the text.
 */
export function HeroBanner() {
  return (
    <Card className="relative flex-row items-center gap-0 py-0">
      <div className="relative z-10 flex flex-col gap-6 p-7 @3xl:flex-row @3xl:items-center @3xl:gap-8 @5xl:pr-0">
        <div className="flex flex-col gap-5">
          <h2 className="max-w-85 text-[36px] leading-[1.05] font-extrabold tracking-[-0.02em] text-foreground">
            Build faceless 2D <span className="highlight">motion</span> shorts from a prompt
          </h2>
          <Button size="lg" className="h-12 w-fit px-6 text-[15px]" render={<Link href="/dashboard/projects/new" />} nativeButton={false}>
            Create a Project
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>

        <Separator orientation="vertical" className="hidden self-stretch @3xl:block" />

        <ul className="flex max-w-65 flex-col gap-3.5">
          {PROMISES.map((line) => (
            <li key={line} className="flex items-center gap-3 text-[15px] leading-snug text-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <CheckIcon className="size-4" strokeWidth={3} aria-hidden />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* Decoration only. Takes the space left of the text; hidden where there isn't enough. */}
      <div aria-hidden className="relative hidden min-w-0 flex-1 self-stretch @5xl:block">
        <div className="absolute top-[42%] -right-24 h-75 w-130 -rotate-12 rounded-[50%] bg-brand" />
        <Image
          src="/images/banner.webp"
          alt=""
          width={880}
          height={561}
          priority
          sizes="360px"
          className="absolute right-4 bottom-0 h-[92%] w-auto max-w-none object-contain"
        />
      </div>
    </Card>
  );
}
