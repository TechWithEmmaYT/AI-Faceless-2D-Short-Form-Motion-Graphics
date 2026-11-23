/**
 * A brief: one motion style written for Claude Code — when to use it, its look, its character,
 * the beat structure, how to build it with MotionStudio's tools, and what failure looks like.
 * agent_md tells the agent to read the project's brief; get_guide({ topic: motionStyle }) returns it.
 *
 * Project.motionStyle IS the brief id. One name, one brief, no mapping table: adding a style means
 * adding one file here and one card on Create Project.
 */
export type AspectRatio = "9:16" | "16:9" | "1:1"

export type Brief = {
  /** Equals Project.motionStyle. */
  id: "story-scene" | "presenter" | "system" | "documentary"
  name: string
  /** One line for the style card and for list_briefs. */
  summary: string
  /** When to pick it, in the user's words. */
  when: string
  formats: AspectRatio[]
  /** Typical length. */
  length: string
  /** Who appears on screen. Every style has its own character style; never borrow another style's. */
  character: string
  /** Built-in elements it uses (a test checks they exist, so a rename can't break it silently). */
  elements: string[]
  /** MCP tools it relies on. */
  tools: string[]
  /** The brief itself: <inputs> <direction> <character> <structure> <build> <gotchas>. */
  body: string
}
