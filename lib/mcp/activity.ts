import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which MCP tool is running in this async context. `safely` (lib/mcp/shared.ts) sets it; the project
 * ownership check (requireProject) reads it to stamp "Agent is working · <label>" on the project.
 */
export const currentTool = new AsyncLocalStorage<{ tool: string }>();

/** What the studio's "Agent is working" pill says for each tool. */
export const TOOL_ACTIVITY: Record<string, string> = {
  agent_md: "Reading the guide",
  get_guide: "Reading the guide",
  get_project: "Reading the project",
  get_selection: "Checking your selection",
  save_script: "Saving the script",
  save_storyboard: "Saving the storyboard",
  add_scene: "Adding a scene",
  update_scene: "Updating a scene",
  delete_scene: "Deleting a scene",
  reorder_scenes: "Reordering scenes",
  add_layer: "Adding a layer",
  update_layer: "Updating a layer",
  delete_layer: "Removing a layer",
  save_element: "Saving an element",
  list_elements: "Browsing elements",
  get_element_code: "Studying an element",
  render_frames: "Looking at frames",
  get_upload_target: "Preparing an upload",
  save_generated_audio: "Saving a voiceover",
  add_sound: "Adding a sound",
  update_sound: "Adjusting a sound",
  remove_sound: "Removing a sound",
};

export function activityLabel(): string | null {
  const tool = currentTool.getStore()?.tool;
  return tool ? (TOOL_ACTIVITY[tool] ?? "Working") : null;
}
