/**
 * The agent's working folder on the user's machine, one per project. MotionStudio stores what is
 * SAVED (script, scenes, layers, audio on Cloudinary); this folder holds the agent's own files — the
 * raw voice clips, downloaded sounds, drafts — and its notes, so any later session (or a new agent)
 * picks up exactly where the last one stopped instead of regenerating paid audio.
 */
export const WORKSPACE_ROOT = "~/motionstudio";

export const workspacePath = (projectId: string) => `${WORKSPACE_ROOT}/${projectId}`;

/** The folder layout, as the agent is told it (agent_md "Your workspace"). */
export const WORKSPACE_LAYOUT = `\`\`\`
~/motionstudio/<projectId>/
  progress.md   ← read first, update after every step: what's saved, what's next, the voice and its settings, decisions
  vo/           one clip per line (scene-01-01.mp3 …), the joined scene files (scene-01.mp3), durations.txt
  sound/        story sounds as downloaded, and the trimmed cuts you uploaded
  music/        the music bed, if the user asked for one
  scenes/       drafts of layer code before add_layer (scene-01-hero.js …)
  elements/     drafts of saved elements before save_element
\`\`\``;
