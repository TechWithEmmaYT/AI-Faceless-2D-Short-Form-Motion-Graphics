import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  StudioError,
  getProjectElement,
  listProjectElements,
  requireProject,
  saveElement,
} from "@/lib/db/queries/studio";
import { ELEMENTS } from "@/lib/render/elements";
import { checkDrawingCode, codeHash } from "@/lib/validate/code";

import {
  formatted,
  projectIdField,
  responseFormatField,
  safely,
  text,
} from "../shared";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** save_element, list_elements, get_element_code. Built-ins live in code; saved elements belong to one project. */
export function registerElementTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_elements",
    {
      title: "List elements",
      description:
        'Lists the elements you can place with add_layer (kind "element"): the built-in ones (chip, stamp, counter, terminal, …) and this project\'s saved elements, with their params. Read two with get_element_code before writing your own.',
      inputSchema: z.strictObject({
        projectId: projectIdField,
        response_format: responseFormatField,
      }),
      annotations: READ_ONLY,
    },
    safely(
      "list_elements",
      async ({
        projectId,
        response_format,
      }: {
        projectId: string;
        response_format: "markdown" | "json";
      }) => {
        await requireProject(userId, projectId);
        const saved = await listProjectElements(projectId);
        const builtIn = Object.values(ELEMENTS).map((e) => ({
          name: e.name,
          description: e.description,
          defaultParams: e.defaultParams,
        }));
        const data = {
          builtIn,
          saved: saved.map((e) => ({
            name: e.name,
            role: e.role,
            description: e.description,
            defaultParams: e.defaultParams,
            updatedAt: e.updatedAt.toISOString(),
          })),
        };
        const md = [
          "## Built-in",
          ...builtIn.map(
            (e) =>
              `- **${e.name}** — ${e.description}\n  params: ${JSON.stringify(e.defaultParams)}`,
          ),
          "",
          "## Saved in this project",
          ...(saved.length
            ? saved.map(
                (e) =>
                  `- **${e.name}** (${e.role}) — ${e.description || "no description"}\n  params: ${JSON.stringify(e.defaultParams)}`,
              )
            : [
                "_None yet._ Anything that appears twice should be saved with save_element.",
              ]),
        ].join("\n");
        return formatted(response_format, md, data);
      },
    ),
  );

  server.registerTool(
    "get_element_code",
    {
      title: "Read an element's code",
      description:
        "Returns the drawing code of one element (built-in or saved) so you can copy its way of drawing — few right shapes, detail at the silhouette, every move a function of t. Read two before writing your own code layer or element.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        name: z
          .string()
          .min(1)
          .max(40)
          .describe('The element name, e.g. "terminal" or a saved "hero".'),
      }),
      annotations: READ_ONLY,
    },
    safely(
      "get_element_code",
      async ({ projectId, name }: { projectId: string; name: string }) => {
        await requireProject(userId, projectId);
        const builtIn = ELEMENTS[name];
        if (builtIn) {
          return text(
            `# ${builtIn.name} (built-in)\n${builtIn.description}\n\ndefaultParams: ${JSON.stringify(builtIn.defaultParams, null, 2)}\n\nSignature: draw(ctx, t, u, w, h, p, M, fonts)\n\n\`\`\`js\n${builtIn.draw.toString()}\n\`\`\``,
          );
        }
        const saved = await getProjectElement(projectId, name);
        if (!saved)
          throw new StudioError(
            `No element named "${name}". Call list_elements for the names.`,
          );
        return text(
          `# ${saved.name} (saved, ${saved.role})\n${saved.description}\n\ndefaultParams: ${JSON.stringify(saved.defaultParams, null, 2)}\n\nBody of function (ctx, t, u, w, h, p, M):\n\n\`\`\`js\n${saved.code}\n\`\`\``,
        );
      },
    ),
  );

  server.registerTool(
    "save_element",
    {
      title: "Save a reusable element",
      description:
        'Saves drawing code as a named element of this project, so the same thing (the hero, a room, a card) is identical wherever it appears; place it with add_layer kind "element" and elementRef = name. Saving an existing name replaces its code everywhere it\'s used. The code is the BODY of function (ctx, t, u, w, h, p, M) and must be pure (no Math.random, Date or timers).',
      inputSchema: z.strictObject({
        projectId: projectIdField,
        name: z
          .string()
          .regex(
            /^[a-z][a-z0-9-]{1,39}$/,
            'Use a lowercase slug, e.g. "hero" or "dispatch-card".',
          )
          .describe('A lowercase slug, e.g. "hero".'),
        role: z
          .enum(["hero", "place", "card", "prop", "other"])
          .default("other")
          .describe("What it is in the video."),
        description: z
          .string()
          .max(300)
          .default("")
          .describe("One line: what it draws and its key params."),
        code: z
          .string()
          .min(1)
          .max(64 * 1024)
          .describe("The BODY of function (ctx, t, u, w, h, p, M)."),
        defaultParams: z
          .record(z.string(), z.unknown())
          .default({})
          .describe(
            'Default params, e.g. { "pose": "wave", "face": "smile" }.',
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "save_element",
      async (a: {
        projectId: string;
        name: string;
        role: "hero" | "place" | "card" | "prop" | "other";
        description: string;
        code: string;
        defaultParams: Record<string, unknown>;
      }) => {
        if (ELEMENTS[a.name])
          throw new StudioError(
            `"${a.name}" is a built-in element name. Pick another name.`,
          );
        const checked = checkDrawingCode(a.code);
        if (!checked.ok) throw new StudioError(checked.error);
        const { created } = await saveElement(userId, a.projectId, {
          name: a.name,
          role: a.role,
          description: a.description,
          code: a.code,
          codeHash: await codeHash(a.code),
          defaultParams: a.defaultParams,
        });
        return text(
          `${created ? "Saved" : "Replaced"} element "${a.name}" (${a.role}). Place it with add_layer kind "element", elementRef "${a.name}".`,
        );
      },
    ),
  );
}
