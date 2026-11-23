/**
 * Server-side checks for agent-written drawing code (code layers and saved elements), before it is
 * stored. The code is PARSED here, never run: `new Function(...)` only compiles the body; it is
 * not called. Execution happens only inside the sandboxed render host (plan, Phase 3).
 *
 * Messages are written for the agent: say what's wrong and what to use instead.
 */

export const CODE_MAX_BYTES = 64 * 1024;
export const CODE_PARAMS = ["ctx", "t", "u", "w", "h", "p", "M"] as const;

const BANNED: { pattern: RegExp; message: string }[] = [
  { pattern: /\bMath\s*\.\s*random\b/, message: "Math.random makes frames differ between renders — use the seeded M.rnd(i)." },
  { pattern: /\bDate\b/, message: "Date reads the clock — compute everything from t." },
  { pattern: /\bperformance\b/, message: "performance reads the clock — compute everything from t." },
  { pattern: /\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/, message: "Timers aren't allowed — render(t) is pure; derive motion from t." },
  { pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|navigator)\b/, message: "Network access isn't allowed in drawing code." },
  { pattern: /\b(eval|Function)\b|\bimport\s*\(/, message: "eval, Function and dynamic import aren't allowed." },
  { pattern: /\b(window|document|globalThis|self|parent|top|localStorage|sessionStorage|indexedDB)\b/, message: "Page globals aren't available — draw only with ctx and the helpers in M." },
];

export type CodeCheck = { ok: true } | { ok: false; error: string };

export function checkDrawingCode(body: string): CodeCheck {
  if (new TextEncoder().encode(body).length > CODE_MAX_BYTES) {
    return { ok: false, error: `Code is over ${CODE_MAX_BYTES / 1024} KB. Split it into saved elements (save_element) and place them by name.` };
  }
  // Ignore string/comment contents when scanning for banned names.
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  for (const rule of BANNED) {
    if (rule.pattern.test(stripped)) return { ok: false, error: rule.message };
  }
  try {
    // Compile only (syntax check). The returned function is discarded, never invoked.
    new Function(...CODE_PARAMS, body);
  } catch (error) {
    return { ok: false, error: `Syntax error: ${(error as Error).message}. The code is the BODY of function (${CODE_PARAMS.join(", ")}) { … }.` };
  }
  return { ok: true };
}

/** Stable short hash so the renderer can cache compiled code per version. */
export async function codeHash(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}
