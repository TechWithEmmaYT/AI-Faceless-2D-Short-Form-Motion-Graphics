import Image from "next/image";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Brief } from "@/lib/agent/briefs/types";
import { STYLE_ART } from "@/lib/styles";

/**
 * A motion-style quick card (DESIGN.md §4, Home's top row): title and one-line blurb on the left,
 * the style's illustration in a rounded inset frame on the right. The whole card is the link.
 */
export function StyleCard({ brief, href, priority }: { brief: Pick<Brief, "id" | "name">; href: string; priority?: boolean }) {
  const art = STYLE_ART[brief.id];

  return (
    <Link
      href={href}
      className="group/style rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`${brief.name}: ${art.blurb}`}
    >
      <Card className="h-full flex-row items-center gap-3 py-4 pr-4 transition-colors group-hover/style:bg-muted/40 group-hover/style:ring-foreground/20">
        <CardHeader className="flex-1 gap-1.5 self-start pr-0">
          <CardTitle className="text-[17px] font-semibold">{brief.name}</CardTitle>
          <CardDescription className="text-sm leading-snug">{art.blurb}</CardDescription>
        </CardHeader>
        <div className="relative aspect-[3/4] w-[84px] shrink-0 overflow-hidden rounded-[10px] bg-muted">
          <Image
            src={art.image}
            alt=""
            fill
            sizes="84px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover/style:scale-[1.04]"
          />
        </div>
      </Card>
    </Link>
  );
}
