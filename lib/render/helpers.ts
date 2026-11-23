/**
 * `M`: the helpers every drawing function gets — the same small set the worked examples use
 * (lib/agent/examples/*.ts `helpers`). All pure: the same input gives the same output, always.
 */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0→1 as t goes from a to b. */
export const pg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
export const eo = (k: number) => 1 - Math.pow(1 - k, 3);
export const eio = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const eback = (k: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
/** Seeded 0–1: use instead of Math.random, which would make frames differ between renders. */
export const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function circ(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  if (a <= 0 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Splits "*word*" marks: [{ w, key }]. */
export function marked(text: string): { w: string; key: boolean }[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => ({ w: tok.replace(/\*/g, ""), key: /^\*.*\*[.,:!?]?$/.test(tok) }));
}

export const M = { clamp, lerp, pg, eo, eio, eback, rnd, rr, circ, glow, marked };
export type Helpers = typeof M;
