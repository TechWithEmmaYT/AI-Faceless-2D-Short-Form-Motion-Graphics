import { documentary } from "./documentary"
import { presenter } from "./presenter"
import { storyScene } from "./story-scene"
import { system } from "./system"
import type { Brief } from "./types"

/**
 * The motion styles Claude Code can follow, one file each, each with its own look and its own
 * character style. A project's motionStyle is the id of its brief: agent_md tells the agent to call
 * get_guide({ topic: project.motionStyle }), which returns that brief in full.
 *
 * Adding a style = one new file here + one card on Create Project. Nothing else.
 */
export const BRIEFS: Brief[] = [storyScene, presenter, system, documentary]

export function findBrief(id: string): Brief | undefined {
  return BRIEFS.find((brief) => brief.id === id)
}

/** The short list get_guide returns with no topic: one line per style. */
export function listBriefs(): string {
  return BRIEFS.map((b) => `- ${b.id} — ${b.name}: ${b.summary} (${b.formats.join(", ")}, ${b.length}) Character: ${b.character}`).join("\n")
}

export type { Brief } from "./types"
