import type { CaptionStyle, Join, NewLayer } from "./types";

/**
 * A demo video built only from built-in elements and captions (no agent code), so it plays without
 * the sandbox. Three scenes, and the third is EMPTY on purpose: playing it must show a blank frame,
 * proving no layer from scene 1 or 2 leaks into it.
 */
export type SeedScene = { title: string; shotId: string; durationSec: number; join: Join; layers: NewLayer[] };

const FULL = { x: 0, y: 0, w: 1080, h: 1920 };
const INK = "#141414";
const RED = "#D63A2F"; // one accent per video (Presenter's red)

const caption = (text: string, start: number, end: number, style: CaptionStyle, z = 50): NewLayer => ({
  kind: "caption",
  name: `caption: ${text.replace(/\*/g, "")}`,
  z,
  start,
  end,
  box: { x: 70, y: 1480, w: 940, h: 260 },
  opacity: 1,
  text,
  style,
});

export function demoScenes(): SeedScene[] {
  return [
    {
      title: "Hook — No editor",
      shotId: "hook",
      durationSec: 6,
      join: "cut",
      layers: [
        { kind: "element", name: "paper", elementRef: "background", z: 0, start: 0, end: null, box: FULL, opacity: 1, params: { color: "#EEEBE3", grid: "rgba(20,20,20,0.05)" } },
        { kind: "element", name: "section chip", elementRef: "chip", z: 10, start: 0, end: null, box: { x: 70, y: 100, w: 560, h: 60 }, opacity: 1, params: { text: "// 01 · the hook" } },
        { kind: "element", name: "tool counter", elementRef: "counter", z: 10, start: 0.2, end: null, box: { x: 620, y: 100, w: 390, h: 60 }, opacity: 1, params: { label: "TOOLS", from: 0, to: 5, accent: RED } },
        { kind: "element", name: "lockup", elementRef: "text", z: 20, start: 0.4, end: null, box: { x: 40, y: 520, w: 1000, h: 300 }, opacity: 1, params: { text: "NO *EDITOR*", size: 230, color: INK, accent: RED, anim: "pop", underline: true } },
        {
          kind: "element",
          name: "terminal",
          elementRef: "terminal",
          z: 20,
          start: 1.4,
          end: null,
          box: { x: 90, y: 930, w: 900, h: 360 },
          opacity: 1,
          params: { lines: ["$ claude mcp add motionstudio", "✓ connected to MotionStudio", "$ build the hook scene"], title: "claude code" },
        },
        { kind: "element", name: "stamp", elementRef: "stamp", z: 30, start: 4.2, end: null, box: { x: 600, y: 360, w: 440, h: 220 }, opacity: 1, params: { text: "100% CODE", color: RED } },
        caption("You can make *this* video", 0.2, 3, { color: INK, accent: RED, size: 84 }),
        caption("without opening an *editor*", 3, 6, { color: INK, accent: RED, size: 84 }),
      ],
    },
    {
      title: "Proof — It renders itself",
      shotId: "proof",
      durationSec: 5,
      join: "dissolve",
      layers: [
        { kind: "element", name: "night", elementRef: "background", z: 0, start: 0, end: null, box: FULL, opacity: 1, params: { color: "#0E0F12", to: "#1F2330" } },
        { kind: "element", name: "headline", elementRef: "text", z: 20, start: 0.2, end: null, box: { x: 40, y: 560, w: 1000, h: 220 }, opacity: 1, params: { text: "IT *RENDERS* ITSELF", size: 120, color: "#FFFFFF", accent: "#FACC15", anim: "rise" } },
        {
          kind: "element",
          name: "frame counter",
          elementRef: "counter",
          z: 20,
          start: 0.6,
          end: null,
          box: { x: 90, y: 880, w: 900, h: 120 },
          opacity: 1,
          params: { label: "FRAMES", from: 0, to: 150, duration: 4.2, align: "center", size: 64, color: "#9CA3AF", accent: "#FACC15" },
        },
        caption("Every frame is drawn from *t*", 0.4, 5, { color: "#FFFFFF", accent: "#FACC15", size: 80 }),
      ],
    },
    {
      // Deliberately empty: must play as a blank frame (scene isolation).
      title: "Empty scene — isolation check",
      shotId: "empty",
      durationSec: 2.5,
      join: "cut",
      layers: [],
    },
  ];
}
