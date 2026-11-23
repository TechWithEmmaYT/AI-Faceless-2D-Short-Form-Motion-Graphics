import { findBrief } from "../briefs"
import { AGENT_INSTRUCTIONS, AGENT_MD, GUIDE_VERSION } from "./agent-md"
import { checksTopic } from "./topics/checks"
import { codeClipsTopic } from "./topics/code-clips"
import { resourcesTopic } from "./topics/resources"
import { scriptTopic } from "./topics/script"
import { soundTopic } from "./topics/sound"
import { storyboardTopic } from "./topics/storyboard"
import { voiceTopic } from "./topics/voice"

/**
 * The guide Claude Code reads, one file per topic. agent_md returns AGENT_MD; get_guide({ topic })
 * returns a topic below, or a style's brief when the topic is a motionStyle id.
 */
export const GUIDE_TOPICS = {
  script: scriptTopic,
  storyboard: storyboardTopic,
  voice: voiceTopic,
  sound: soundTopic,
  "code-clips": codeClipsTopic,
  checks: checksTopic,
  resources: resourcesTopic,
} as const

export type GuideTopic = keyof typeof GUIDE_TOPICS

/** get_guide's answer: a topic, a brief by style id, or null (the tool then lists what exists). */
export function guide(topic: string): string | null {
  if (topic in GUIDE_TOPICS) return GUIDE_TOPICS[topic as GuideTopic]
  const brief = findBrief(topic)
  return brief ? `# ${brief.name}\n\n${brief.body}` : null
}

export { AGENT_INSTRUCTIONS, AGENT_MD, GUIDE_VERSION }
