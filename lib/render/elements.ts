import { M, type Helpers } from "./helpers";
import type { RenderFonts } from "./types";

/**
 * Built-in elements: drawing functions with params, the same shape as a code layer
 * (ctx, t, u, w, h, p, M) plus the resolved fonts. They draw in their own box (0,0 → w,h) and are
 * pure functions of t. Briefs name the ones they use (Brief.elements); list_elements serves them.
 */
export type ElementDraw = (
  ctx: CanvasRenderingContext2D,
  t: number,
  u: number,
  w: number,
  h: number,
  p: Record<string, unknown>,
  m: Helpers,
  fonts: RenderFonts,
) => void;

export type BuiltInElement = {
  name: string;
  description: string;
  defaultParams: Record<string, unknown>;
  draw: ElementDraw;
};

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Sets a font and shrinks it until `text` fits `maxW`. Returns the size used. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, size: number, maxW: number, min = 58) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

const background: BuiltInElement = {
  name: "background",
  description: "Fills the box: a flat colour, an optional top-to-bottom gradient, and an optional fine grid.",
  defaultParams: { color: "#EEEBE3", to: null, grid: null },
  draw(ctx, _t, _u, w, h, p) {
    const to = p.to;
    if (typeof to === "string") {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, str(p.color, "#EEEBE3"));
      g.addColorStop(1, to);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = str(p.color, "#EEEBE3");
    }
    ctx.fillRect(0, 0, w, h);
    if (typeof p.grid === "string") {
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 1;
      const step = num(p.gridStep, 40);
      ctx.beginPath();
      for (let x = step; x < w; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = step; y < h; y += step) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();
    }
  },
};

const text: BuiltInElement = {
  name: "text",
  description: "A one-line lockup centred in its box. *word* takes the accent colour. anim: pop | rise | none.",
  defaultParams: { text: "HEADLINE", size: 180, weight: 900, color: "#141414", accent: "#D63A2F", font: "sans", anim: "pop", underline: false },
  draw(ctx, t, _u, w, h, p, m, fonts) {
    const words = m.marked(str(p.text, ""));
    if (!words.length) return;
    const family = p.font === "mono" ? fonts.mono : fonts.sans;
    const weight = num(p.weight, 900);
    const plain = words.map((x) => x.w).join(" ");
    const size = fitFont(ctx, plain, family, weight, num(p.size, 180), w * 0.94);
    const k = p.anim === "none" ? 1 : m.pg(t, 0, 0.45);
    const scale = p.anim === "pop" ? 0.6 + 0.4 * m.eback(k) : 1;
    const rise = p.anim === "rise" ? (1 - m.eo(k)) * 60 : 0;

    ctx.save();
    ctx.globalAlpha *= m.clamp(k * 1.6, 0, 1);
    ctx.translate(w / 2, h / 2 + rise);
    ctx.scale(scale, scale);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const space = ctx.measureText(" ").width;
    const total = ctx.measureText(plain).width;
    let x = -total / 2;
    for (const word of words) {
      const ww = ctx.measureText(word.w).width;
      ctx.fillStyle = word.key ? str(p.accent, "#D63A2F") : str(p.color, "#141414");
      ctx.fillText(word.w, x, 0);
      if (word.key && p.underline) {
        // A hand-drawn underline that draws itself after the word lands.
        const d = m.eo(m.pg(t, 0.45, 0.85));
        ctx.strokeStyle = str(p.accent, "#D63A2F");
        ctx.lineWidth = Math.max(6, size * 0.06);
        ctx.lineCap = "round";
        ctx.beginPath();
        const y = size * 0.62;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (ww * d) / 2, y + 14, x + ww * d, y - 4);
        ctx.stroke();
      }
      x += ww + space;
    }
    ctx.restore();
  },
};

const chip: BuiltInElement = {
  name: "chip",
  description: "A small mono section label (e.g. // 01 · the hook) that slides in from the left.",
  defaultParams: { text: "// 01 · the hook", color: "#8A877F", size: 30 },
  draw(ctx, t, _u, _w, h, p, m, fonts) {
    const k = m.eo(m.pg(t, 0, 0.35));
    ctx.globalAlpha *= k;
    ctx.font = `500 ${num(p.size, 30)}px ${fonts.mono}`;
    ctx.fillStyle = str(p.color, "#8A877F");
    ctx.textBaseline = "middle";
    ctx.fillText(str(p.text, ""), (1 - k) * -40, h / 2);
  },
};

const counter: BuiltInElement = {
  name: "counter",
  description: "A grey label and an accent number that counts from `from` to `to` over `duration` seconds.",
  defaultParams: { label: "TOOLS", from: 0, to: 5, duration: 1.2, color: "#8A877F", accent: "#D63A2F", size: 34, align: "right", suffix: "" },
  draw(ctx, t, _u, w, h, p, m, fonts) {
    const from = num(p.from, 0);
    const to = num(p.to, 5);
    const value = Math.round(m.lerp(from, to, m.eo(m.pg(t, 0, num(p.duration, 1.2)))));
    const size = num(p.size, 34);
    ctx.textBaseline = "middle";
    ctx.font = `500 ${size}px ${fonts.mono}`;
    const label = `${str(p.label, "")} `;
    const lw = ctx.measureText(label).width;
    ctx.font = `700 ${size}px ${fonts.mono}`;
    const numberText = `${value.toLocaleString("en-US")}${str(p.suffix, "")}`;
    const nw = ctx.measureText(numberText).width;
    const x = p.align === "left" ? 0 : p.align === "center" ? (w - lw - nw) / 2 : w - lw - nw;
    ctx.font = `500 ${size}px ${fonts.mono}`;
    ctx.fillStyle = str(p.color, "#8A877F");
    ctx.fillText(label, x, h / 2);
    ctx.font = `700 ${size}px ${fonts.mono}`;
    ctx.fillStyle = str(p.accent, "#D63A2F");
    ctx.fillText(numberText, x + lw, h / 2);
  },
};

const stamp: BuiltInElement = {
  name: "stamp",
  description: "A rotated outlined stamp (e.g. 100% CODE) slammed in with a small overshoot.",
  defaultParams: { text: "100% CODE", color: "#D63A2F", angle: -8, size: 64 },
  draw(ctx, t, _u, w, h, p, m, fonts) {
    const k = m.pg(t, 0, 0.3);
    if (k <= 0) return;
    const scale = 1.7 - 0.7 * m.eback(k);
    const size = num(p.size, 64);
    const label = str(p.text, "");
    ctx.save();
    ctx.globalAlpha *= m.clamp(k * 2, 0, 1);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((num(p.angle, -8) * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.font = `900 ${size}px ${fonts.sans}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + size * 0.9;
    const bh = size * 1.6;
    ctx.strokeStyle = str(p.color, "#D63A2F");
    ctx.lineWidth = size * 0.09;
    m.rr(ctx, -bw / 2, -bh / 2, bw, bh, size * 0.18);
    ctx.stroke();
    ctx.fillStyle = str(p.color, "#D63A2F");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, size * 0.04);
    ctx.restore();
  },
};

const terminal: BuiltInElement = {
  name: "terminal",
  description: "A dark terminal card whose lines type out at `cps` characters a second, with a blinking caret.",
  defaultParams: { lines: ["$ claude mcp add motionstudio"], cps: 34, title: "claude code", size: 34 },
  draw(ctx, t, _u, w, h, p, m, fonts) {
    const lines = Array.isArray(p.lines) ? (p.lines as unknown[]).map(String) : [];
    const size = num(p.size, 34);
    const appear = m.eo(m.pg(t, 0, 0.35));
    ctx.save();
    ctx.globalAlpha *= appear;
    ctx.translate(0, (1 - appear) * 40);
    // Card
    ctx.fillStyle = "#16181D";
    m.rr(ctx, 0, 0, w, h, 28);
    ctx.fill();
    ctx.fillStyle = "#23262D";
    m.rr(ctx, 0, 0, w, 72, 28);
    ctx.fill();
    ctx.fillRect(0, 44, w, 28);
    ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => {
      ctx.fillStyle = c;
      m.circ(ctx, 40 + i * 34, 36, 10);
      ctx.fill();
    });
    ctx.font = `500 26px ${fonts.mono}`;
    ctx.fillStyle = "#9CA3AF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str(p.title, ""), w / 2, 37);
    // Typed lines
    ctx.textAlign = "left";
    ctx.font = `500 ${size}px ${fonts.mono}`;
    let budget = Math.max(0, (t - 0.35) * num(p.cps, 34));
    let y = 72 + size * 1.5;
    let caretX = 40;
    let caretY = y;
    for (const line of lines) {
      if (budget <= 0) break;
      const shown = line.slice(0, Math.floor(budget));
      budget -= line.length + 4; // a short pause between lines
      ctx.fillStyle = line.startsWith("$") ? "#FDE68A" : "#E5E7EB";
      ctx.fillText(shown, 40, y);
      caretX = 40 + ctx.measureText(shown).width + 6;
      caretY = y;
      y += size * 1.55;
    }
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = "#FACC15";
      ctx.fillRect(caretX, caretY - size * 0.5, size * 0.55, size);
    }
    ctx.restore();
  },
};

export const ELEMENTS: Record<string, BuiltInElement> = Object.fromEntries(
  [background, text, chip, counter, stamp, terminal].map((e) => [e.name, e]),
);

export { M };
