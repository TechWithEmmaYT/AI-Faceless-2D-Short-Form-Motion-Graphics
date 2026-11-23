import { documentaryExample } from "./documentary"
import { presenterExample } from "./presenter"
import { storySceneExample } from "./story-scene"
import { systemExample } from "./system"
import type { Example } from "./types"

/**
 * One worked example per motion style: the script and storyboard as real data, the character and
 * places as working drawing code, and six stills of what "right" looks like. The agent reads the
 * example for the project's style before it writes its own storyboard — get_example({ style }).
 *
 * Generated from the prototypes; to change one, change its prototype and regenerate.
 */
export const EXAMPLES: Example[] = [storySceneExample, presenterExample, systemExample, documentaryExample]

export function findExample(style: string): Example | undefined {
  return EXAMPLES.find((example) => example.style === style)
}

export type { Example } from "./types"
