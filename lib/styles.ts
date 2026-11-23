import type { Brief } from "@/lib/agent/briefs/types";

/**
 * Studio-side presentation of each motion style: the short card copy from the Home design, the card
 * illustration, and one real still from the style's worked example (lib/agent/examples).
 * Keyed by Brief["id"], so adding a brief without adding its art is a type error.
 *
 * Illustrations are normalised copies of public/images/*.png (trimmed, 480×640 WebP); the shots are
 * example stills copied to public/images/shot/.
 */
export type StyleArt = {
  /** One line for the style card, from _design/home-screen.jpg. */
  blurb: string;
  /** 3:4 illustration for the style card. */
  image: string;
  /** 9:16 still of what this style actually renders. */
  shot: string;
};

export const STYLE_ART: Record<Brief["id"], StyleArt> = {
  "story-scene": {
    blurb: "A character living through it, day by day",
    image: "/images/styles/story-scene.webp",
    shot: "/images/shot/story-scene-2.jpg",
  },
  presenter: {
    blurb: "A host at the bottom, cards building above",
    image: "/images/styles/presenter.webp",
    shot: "/images/shot/presenter-1.jpg",
  },
  system: {
    blurb: "A place or system built piece by piece",
    image: "/images/styles/system.webp",
    shot: "/images/shot/system-3.jpg",
  },
  documentary: {
    blurb: "A true story told chapter by chapter",
    image: "/images/styles/documentary.webp",
    shot: "/images/shot/documentary-1.jpg",
  },
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** ISO date → "2h ago", "3d ago", "now". Call from client components only (it reads the clock). */
export function formatRelative(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "now";
}

/** 117.8 → "1:58". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
