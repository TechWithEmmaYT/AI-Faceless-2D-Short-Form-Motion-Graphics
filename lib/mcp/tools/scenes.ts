import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  StudioError,
  addScene,
  deleteScene,
  listScenes,
  reorderScenes,
  requireScene,
  updateScene,
} from "@/lib/db/queries/studio";

import {
  joinField,
  projectIdField,
  safely,
  sceneIdField,
  text,
} from "../shared";

const title = z
  .string()
  .min(1)
  .max(120)
  .describe('Scene title, "Shot — what happens", e.g. "Hook — No editor".');
const durationSec = z
  .number()
  .min(0.5)
  .max(120)
  .describe(
    "Scene length in seconds. Once the voice exists this comes from its clips (last line end + breath).",
  );
const shotId = z
  .string()
  .max(40)
  .nullable()
  .describe("The storyboard shot this scene builds (its id), or null.");

/** add_scene, update_scene, delete_scene, reorder_scenes. Each scene is drawn on its own — never mixed with another. */
export function registerSceneTools(server: McpServer, userId: string) {
  server.registerTool(
    "add_scene",
    {
      title: "Add a scene",
      description:
        "Adds an empty scene (no layers yet) at the end, or at a 0-based position. One scene per storyboard shot, built in order. Returns the new scene id — then add its layers with add_layer. An empty scene plays as a blank frame.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        title,
        durationSec,
        join: joinField.default("cut"),
        shotId: shotId.default(null),
        position: z
          .int()
          .min(0)
          .optional()
          .describe("0-based index to insert at; omit to append."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "add_scene",
      async (a: {
        projectId: string;
        title: string;
        durationSec: number;
        join: "cut" | "dissolve" | "swap";
        shotId: string | null;
        position?: number;
      }) => {
        const { id, position } = await addScene(
          userId,
          a.projectId,
          {
            title: a.title,
            durationSec: a.durationSec,
            join: a.join,
            shotId: a.shotId,
          },
          a.position,
        );
        return text(
          `Added scene ${position + 1}: "${a.title}" (scene id: ${id}), ${a.durationSec}s, join ${a.join}. Next: add_layer with sceneId "${id}".`,
        );
      },
    ),
  );

  server.registerTool(
    "update_scene",
    {
      title: "Update a scene",
      description:
        "Changes a scene's title, duration, join or shotId. Only the fields you pass change. Layers past a shortened scene's end are clipped when drawn.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        sceneId: sceneIdField,
        title: title.optional(),
        durationSec: durationSec.optional(),
        join: joinField.optional(),
        shotId: shotId.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "update_scene",
      async (a: {
        projectId: string;
        sceneId: string;
        title?: string;
        durationSec?: number;
        join?: "cut" | "dissolve" | "swap";
        shotId?: string | null;
      }) => {
        const patch = Object.fromEntries(
          Object.entries({
            title: a.title,
            durationSec: a.durationSec,
            join: a.join,
            shotId: a.shotId,
          }).filter(([, v]) => v !== undefined),
        );
        if (Object.keys(patch).length === 0)
          throw new StudioError(
            "Nothing to change: pass at least one of title, durationSec, join, shotId.",
          );
        await updateScene(userId, a.projectId, a.sceneId, patch);
        return text(
          `Updated scene ${a.sceneId}: ${Object.entries(patch)
            .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
            .join(", ")}.`,
        );
      },
    ),
  );

  server.registerTool(
    "delete_scene",
    {
      title: "Delete a scene",
      description:
        "Deletes a scene and all of its layers. Later scenes move up. This can't be undone — confirm with the user before deleting work they've seen.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        sceneId: sceneIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "delete_scene",
      async ({
        projectId,
        sceneId,
      }: {
        projectId: string;
        sceneId: string;
      }) => {
        const sc = await requireScene(userId, projectId, sceneId);
        await deleteScene(userId, projectId, sceneId);
        return text(`Deleted scene "${sc.title}" and its layers.`);
      },
    ),
  );

  server.registerTool(
    "reorder_scenes",
    {
      title: "Reorder scenes",
      description:
        "Sets the play order. Pass every scene id of the project exactly once, in the new order (get_project lists them).",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        sceneIds: z
          .array(sceneIdField)
          .min(1)
          .max(200)
          .describe("All scene ids, in the new order."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "reorder_scenes",
      async ({
        projectId,
        sceneIds,
      }: {
        projectId: string;
        sceneIds: string[];
      }) => {
        await reorderScenes(userId, projectId, sceneIds);
        const scenes = await listScenes(projectId);
        return text(
          `New order:\n${scenes.map((sc, i) => `${i + 1}. ${sc.title} (${sc.id})`).join("\n")}`,
        );
      },
    ),
  );
}
