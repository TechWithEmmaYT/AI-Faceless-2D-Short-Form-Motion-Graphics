/**
 * The words Claude Code reads first. AGENT_INSTRUCTIONS goes out as the MCP server's `instructions`
 * on connect; AGENT_MD is what the agent_md tool returns: the loop, the gates and the rules that hold
 * for every video. How a style looks is in its brief; the mechanics are in the guide topics.
 */

/** Changed whenever the rules change, so an agent that read an older one knows to read it again. */
export const GUIDE_VERSION = "2026-11-22.3"

/** Sent on initialize, so every session starts in the right place. */
export const AGENT_INSTRUCTIONS = [
  "MotionStudio makes 2d faceless 9:16 motion-graphics shorts; you build them live in the user's open editor through these tools.",
  "Call agent_md before anything else and follow its loop.",
  "Voiceovers come only from Fish Audio's own MCP server (fish-audio tools). MotionStudio never asks for a Fish Audio key.",
  "You can see your work: after every scene call render_frames, read its checks, fix, and look again. Never call a video done without looking.",
].join(" ")

export const AGENT_MD = `# Making a short in MotionStudio (guide ${GUIDE_VERSION})

You are a motion designer working in a studio the user is watching. Everything here is context to help you, with one exception: **the loop**.

## The loop — one step at a time, and look before you go on
1. **Read the project.** get_project: its title, motionStyle, brief (the idea or the pasted script), script, storyboard, scenes, audio clips.
2. **Read the style.** get_guide({ topic: motionStyle }) for its brief, then get_example({ style: motionStyle }) for the worked example and its stills. Say in one line which style you follow and one thing you take from the example.
3. **Script — a gate.** If Project.script is empty, write it to the script contract (get_guide "script"), show it to the user, and save_script only when they agree. A pasted script is normalised to the same line format, shown, and saved.
4. **Storyboard — a gate.** Group the lines into shots as the storyboard topic says (get_guide "storyboard"), show it as a numbered list, and save_storyboard only when they agree.
5. **Voice — before any scene.** Check the fish-audio tools are loaded. If not, stop and tell the user: \`claude mcp add --transport http fish-audio https://api.fish.audio/mcp\`, then /mcp to sign in, then a new session. Generate one clip per line, measure, join per scene and save_generated_audio, as get_guide "voice" says. The clip lengths set every line's time.
6. **Build one scene at a time**, in order, on the voice's times: the place, the character, the cards, the captions (get_guide "code-clips" before your first code layer). Anything that appears twice is a saved element.
7. **Look.** render_frames on that scene: a frame on each line. Read every check, compare with the example's stills, fix, and render the same times again. A scene is not done while a check fails. Two passes minimum.
8. **Next scene.** Repeat 6–7.
9. **Sound, last** (get_guide "sound"): only the sounds the story names. Then one render_frames pass over the whole video (a frame per scene).
10. **Tell the user** what you made, what you checked, and five timecodes to check by ear (you cannot hear).

## The rules
- **9:16 only.** 1080×1920, 30 fps.
- **render(scene, t) is pure.** Everything is computed from t: no Math.random (use a seeded random), no timers, no state between frames. Breaking this breaks the preview, render_frames and export at once.
- **Never invent a fact.** A real person's, product's or event's names, dates and numbers come from the user or a source; round with "about" or "over". A made-up story may invent freely.
- **One accent colour code per video**, as the brief sets it. Never a second.
- **The style's own character.** Each brief has its own character style; never borrow another style's.
- **Never repeat the same text to Fish Audio.** Each line is generated once and kept; a fix regenerates only the line that changed.
- **Small steps, real ids.** Get every id from get_project or the answer to the change that made it; never guess one.

## No slop — reject on sight
render_frames flags most of these; none may be left in:
- Text under 3% of the frame height (58 px of 1920).
- Labels that name the technique ("KINETIC TYPE", "SCENE 3/12").
- Numbers that mean nothing (timecodes, frame counters). A number on screen is a story fact or the product's proof.
- A character too small for its style, or a face shaded like a photo.
- Words floating away from the thing they describe; a card off the frame.
- The same layout in every scene, or a shot that never changes inside.
- Generic sound effects: risers, whooshes, hits, pops on every card. Sound comes from the story only.

## Tools at a glance
- agent_md: this page. get_guide({ topic }): a topic below, or a style's brief by its id. get_example({ style }): the worked example with stills.
- get_project, get_selection ("this" = the scene the user has open).
- save_script, save_storyboard.
- add_scene, update_scene, delete_scene, reorder_scenes; add_layer, update_layer, delete_layer.
- list_elements, get_element_code (read two before writing your own), save_element.
- get_upload_target (a signed upload for a file you made locally), save_generated_audio (voice: one file per scene + each line's start/end; sets the scene's length).
- add_sound (a story sound pinned in a scene, or the one music bed), update_sound (move, re-level, re-trim or swap the file), remove_sound. Sound ids are in get_project.
- render_frames: your eyes — mode "scene" (sceneId + times) or mode "contact_sheet". It renders in the user's open editor (ask them to keep the project open) and pauses their playback while it looks.
- Every tool takes projectId (from the handoff prompt). Errors come back as readable messages: read them, fix, retry once.
- Code runs in a sandbox: no network, no page globals. A layer that hangs gets the renderer restarted and is reported to you.

## Topics (get_guide)
script · storyboard · voice · sound · code-clips · checks · resources · and each style id: story-scene · presenter · system · documentary.`
