import "server-only";

import { McpServer } from "@modelcontextprotocol/server";

import { AGENT_INSTRUCTIONS, GUIDE_VERSION } from "@/lib/agent/guide";

import { registerElementTools } from "./tools/elements";
import { registerFrameTools } from "./tools/frames";
import { registerGuideTools } from "./tools/guide";
import { registerLayerTools } from "./tools/layers";
import { registerProjectTools } from "./tools/project";
import { registerSceneTools } from "./tools/scenes";
import { registerSoundTools } from "./tools/sounds";
import { registerVoiceTools } from "./tools/voice";

/**
 * The MotionStudio MCP server, built fresh for every request (createMcpHandler calls this per request)
 * and bound to the one user whose API key authenticated it. Tools read and write only that user's
 * projects. Words the agent reads live in lib/agent; this folder is only the wiring.
 */
export function createMotionStudioServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "motionstudio-mcp-server", version: GUIDE_VERSION },
    { instructions: AGENT_INSTRUCTIONS },
  );
  registerGuideTools(server);
  registerProjectTools(server, userId);
  registerSceneTools(server, userId);
  registerLayerTools(server, userId);
  registerElementTools(server, userId);
  registerFrameTools(server, userId);
  registerVoiceTools(server, userId);
  registerSoundTools(server, userId);
  return server;
}

/** The tool names this server exposes — kept in one place for tests and the guide check. */
export const MCP_TOOL_NAMES = [
  "agent_md",
  "get_guide",
  "get_example",
  "get_project",
  "get_selection",
  "save_script",
  "save_storyboard",
  "add_scene",
  "update_scene",
  "delete_scene",
  "reorder_scenes",
  "add_layer",
  "update_layer",
  "delete_layer",
  "save_element",
  "list_elements",
  "get_element_code",
  "render_frames",
  "get_upload_target",
  "save_generated_audio",
  "add_sound",
  "update_sound",
  "remove_sound",
] as const;
