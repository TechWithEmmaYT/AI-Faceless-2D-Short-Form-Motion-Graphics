import "server-only";

import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { RenderRequestSpec } from "@/lib/db/schema";
import { createRenderRequest, deleteRenderRequest, getRenderRequest } from "@/lib/db/queries/renders";
import { StudioError, listScenes, requireProject, requireScene } from "@/lib/db/queries/studio";

import { projectIdField, safely } from "../shared";

/** How long an open editor has to pick the request up, and to finish rendering it. */
const CLAIM_TIMEOUT_MS = 10_000;
// Under the MCP client's default 60 s request timeout, so the agent always gets a readable answer.
const RENDER_TIMEOUT_MS = 45_000;
const POLL_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * render_frames: the agent's eyes. Frames are drawn by the user's OPEN editor with the same renderer
 * as the preview and export (one code path), so what the agent sees is exactly what plays.
 */
export function registerFrameTools(server: McpServer, userId: string) {
  server.registerTool(
    "render_frames",
    {
      title: "Look at frames",
      description:
        "Renders frames of the video in the user's open MotionStudio editor and returns them as images, plus named checks (text-too-small, off-canvas, caption-outside-band, nothing-moves, layout-repeats, layer-error, …). mode \"scene\": up to 8 times in one scene (default: 4 spread across it) — call after building each scene and after every fix. mode \"contact_sheet\": one frame per scene in a single image — call at the end. Fix every check, then render the same times again. Needs the project open in the studio; playback pauses while it renders.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        mode: z.enum(["scene", "contact_sheet"]).default("scene").describe('"scene" (one scene, several times) or "contact_sheet" (one frame per scene).'),
        sceneId: z.string().max(64).optional().describe('mode "scene": the scene id (get_project).'),
        times: z
          .array(z.number().min(0).max(120))
          .min(1)
          .max(8)
          .optional()
          .describe('mode "scene": scene seconds to render, e.g. [0.5, 2, 3.8] — a frame on each line once the voice exists. Default: 4 spread across the scene.'),
        long_edge: z.int().min(240).max(720).default(480).describe("Frame height in px (9:16). Default 480."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safely(
      "render_frames",
      async (a: { projectId: string; mode: "scene" | "contact_sheet"; sceneId?: string; times?: number[]; long_edge: number }): Promise<CallToolResult> => {
        await requireProject(userId, a.projectId);
        let spec: RenderRequestSpec;
        if (a.mode === "scene") {
          if (!a.sceneId) throw new StudioError('mode "scene" needs sceneId — get_project lists them. For one frame per scene use mode "contact_sheet".');
          const sc = await requireScene(userId, a.projectId, a.sceneId);
          const d = sc.durationSec;
          const times = (a.times ?? [0.15, 0.4, 0.65, 0.9].map((k) => Math.round(d * k * 100) / 100)).map((t) => Math.min(Math.max(0, t), Math.max(0, d - 0.01)));
          spec = { mode: "scene", sceneId: sc.id, times, longEdge: a.long_edge };
        } else {
          if ((await listScenes(a.projectId)).length === 0) throw new StudioError("There are no scenes yet. Add one with add_scene, then render it.");
          spec = { mode: "contact_sheet", longEdge: a.long_edge };
        }

        const id = await createRenderRequest(a.projectId, spec);
        const started = Date.now();
        try {
          while (true) {
            await sleep(POLL_MS);
            const row = await getRenderRequest(id);
            if (!row) throw new StudioError("The render request disappeared. Call render_frames again.");
            if (row.status === "pending" && Date.now() - started > CLAIM_TIMEOUT_MS) {
              const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard/projects/${a.projectId}`;
              throw new StudioError(
                `MotionStudio isn't open for this project, so there's nothing to render with. Ask the user to open ${url} in their browser and keep the tab open, then call render_frames again.`,
              );
            }
            if (row.status === "failed") throw new StudioError(`The studio couldn't render: ${(row.error ?? "unknown error").replace(/\.$/, "")}. Fix it and call render_frames again.`);
            if (row.status === "done" && row.result) {
              const { frames, checks, notes } = row.result;
              const summary = [
                `Rendered ${frames.length} ${a.mode === "contact_sheet" ? "contact sheet" : "frame(s)"}: ${frames.map((f) => f.label).join(" · ")}.`,
                checks.length
                  ? `\n${checks.length} check(s) to fix:\n${checks.map((c) => `- [${c.check}]${c.scene ? ` ${c.scene}` : ""}${c.layer ? ` · layer "${c.layer}"` : ""}${c.at !== undefined ? ` @ ${c.at}s` : ""}: ${c.message}`).join("\n")}`
                  : "\nNo checks failed. Now compare the frames with the example's stills yourself — a frame can pass every check and still be wrong.",
                notes.length ? `\nNotes:\n- ${notes.join("\n- ")}` : "",
              ].join("\n");
              return {
                content: [
                  { type: "text", text: summary },
                  ...frames.map((f) => ({ type: "image" as const, data: f.data, mimeType: "image/jpeg" })),
                ],
              };
            }
            if (Date.now() - started > RENDER_TIMEOUT_MS) throw new StudioError("The studio took too long to render. Ask the user to keep the editor tab in front, then call render_frames again.");
          }
        } finally {
          await deleteRenderRequest(id).catch(() => undefined);
        }
      },
    ),
  );
}
