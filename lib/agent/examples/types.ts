import type { Brief } from "../briefs/types"

/**
 * A worked example: one finished video in a style, kept as data so the agent can read how it was
 * made before writing its own storyboard. The standard is taught by example, not by prose.
 *
 * Every field is real: taken from the prototype that rendered the example's stills. The drawing
 * code uses the small helpers in `helpers` (rr, circ, glow, pg, eo, eback, rnd…); inside a code
 * clip, define the ones you use at the top of the body.
 */
export type Example = {
  style: Brief["id"]
  title: string
  format: "9:16"
  /** Rendered length, seconds. */
  seconds: number
  /** What to copy from this example, in one paragraph. */
  notes: string
  /** The script and storyboard as real data: every shot, its place, its lines with their colours or poses, its cards. */
  shots: string
  /** The drawing standard: the character and one or two places or cards, as working code. */
  drawing: Record<string, string>
  /** The helpers the drawing code calls. */
  helpers: string
  /** Six stills of what "right" looks like, relative to this folder. */
  stills: string[]
}
