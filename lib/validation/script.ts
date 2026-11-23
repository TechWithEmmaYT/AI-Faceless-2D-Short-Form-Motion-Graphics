import * as z from "zod/v4";

/**
 * The script and storyboard contracts (lib/agent/guide/topics/script.ts, storyboard.ts), shared by
 * the MCP tools (validation) and the studio (display). Lines are numbered 1…N, counting only
 * non-blank lines; a blank line ends a scene.
 */

export const SCRIPT_MAX_CHARS = 20_000;
export const SCRIPT_MAX_LINES = 200;
export const LINE_MAX_CHARS = 120;

export type ScriptLine = { n: number; text: string; sceneBreakBefore: boolean };

export function scriptLines(script: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  let pendingBreak = false;
  for (const raw of script.replace(/\r\n?/g, "\n").split("\n")) {
    const text = raw.trim();
    if (!text) {
      pendingBreak = out.length > 0;
      continue;
    }
    out.push({ n: out.length + 1, text, sceneBreakBefore: pendingBreak });
    pendingBreak = false;
  }
  return out;
}

/** Normalises and checks a script. Hard errors block saving; warnings are reported back to the agent. */
export function checkScript(script: string): { ok: true; normalized: string; lines: ScriptLine[]; warnings: string[] } | { ok: false; error: string } {
  const normalized = script
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = scriptLines(normalized);
  if (lines.length === 0) return { ok: false, error: "The script is empty. Write one line per caption (get_guide topic \"script\")." };
  if (lines.length > SCRIPT_MAX_LINES) return { ok: false, error: `The script has ${lines.length} lines; the limit is ${SCRIPT_MAX_LINES}. Cut it down.` };

  const warnings: string[] = [];
  for (const line of lines) {
    if (line.text.length > LINE_MAX_CHARS) {
      return { ok: false, error: `Line ${line.n} is ${line.text.length} characters — over ${LINE_MAX_CHARS}. One line is one caption: split it.` };
    }
    const marks = (line.text.match(/\*[^*\s][^*]*\*/g) ?? []).length;
    if (marks > 1) return { ok: false, error: `Line ${line.n} marks ${marks} key words; mark at most one (*word*).` };
    const words = line.text.replace(/\*/g, "").split(/\s+/).filter(Boolean).length;
    if (words < 3 || words > 8) warnings.push(`Line ${line.n} has ${words} words (the guide asks for 3–8): "${line.text}"`);
  }
  return { ok: true, normalized, lines, warnings };
}

export const storyboardCardSchema = z.strictObject({
  kind: z.string().min(1).max(40).describe('What lands: "name", "chips", "label", "stamp", "card", … (the style brief lists its cards).'),
  text: z.string().max(200).optional().describe("The card's words, if it has one text."),
  items: z.array(z.string().max(60)).max(8).optional().describe("For chips or lists: the items."),
  from: z.int().min(1).optional().describe("Script line number where it lands."),
  to: z.int().min(1).optional().describe("Script line number where it leaves (omit = end of shot)."),
});

export const storyboardShotSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use a short lowercase slug, e.g. \"meet\" or \"day-2-map\".")
    .describe('A short slug for the shot, e.g. "meet". Scenes reference it as shotId.'),
  place: z.string().min(1).max(200).describe("Where we are, in a few words."),
  lines: z.array(z.int().min(1)).min(1).max(40).describe("The script line numbers (1-based) this shot carries, in order."),
  hud: z.string().max(120).optional().describe("Optional fixed HUD text for the shot."),
  cards: z.array(storyboardCardSchema).max(12).optional().describe("Cards, labels and chips that land in this shot."),
  moves: z.string().max(400).optional().describe("What changes inside the shot."),
  join: z.enum(["cut", "dissolve", "swap"]).optional().describe("How the shot enters (default from the brief)."),
});

export type StoryboardShot = z.infer<typeof storyboardShotSchema>;

/** Every script line in exactly one shot, shots in script order, ids unique. */
export function checkStoryboard(shots: StoryboardShot[], lineCount: number): { ok: true } | { ok: false; error: string } {
  const ids = new Set<string>();
  let expected = 1;
  for (const [i, shot] of shots.entries()) {
    if (ids.has(shot.id)) return { ok: false, error: `Shot id "${shot.id}" is used twice; ids must be unique.` };
    ids.add(shot.id);
    for (const line of shot.lines) {
      if (line > lineCount) return { ok: false, error: `Shot ${i + 1} ("${shot.id}") uses line ${line}, but the saved script has ${lineCount} lines. Check the numbering with get_project.` };
      if (line !== expected) {
        return {
          ok: false,
          error: `Shot ${i + 1} ("${shot.id}") should continue at line ${expected} but has line ${line}. Every line must belong to exactly one shot, in script order.`,
        };
      }
      expected++;
    }
  }
  if (expected !== lineCount + 1) return { ok: false, error: `Lines ${expected}–${lineCount} aren't in any shot. Every script line must belong to exactly one shot.` };
  return { ok: true };
}

export function lineRange(lines: number[]) {
  if (lines.length === 0) return "";
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  return first === last ? `line ${first}` : `lines ${first}–${last}`;
}
