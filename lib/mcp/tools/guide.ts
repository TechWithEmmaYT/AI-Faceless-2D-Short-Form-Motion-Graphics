import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { listBriefs } from "@/lib/agent/briefs";
import { findExample } from "@/lib/agent/examples";
import { AGENT_MD, GUIDE_TOPICS, guide } from "@/lib/agent/guide";
import { MOTION_STYLES } from "@/lib/db/app-schema";
import { StudioError } from "@/lib/db/queries/studio";

import { safely, text } from "../shared";

/** The stills ship with the server (next.config outputFileTracingIncludes for /api/mcp). */
const EXAMPLES_DIR = path.join(process.cwd(), "lib", "agent", "examples");

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** agent_md and get_guide: the words Claude Code reads before and while it builds (lib/agent). */
export function registerGuideTools(server: McpServer) {
  server.registerTool(
    "agent_md",
    {
      title: "Read the MotionStudio loop",
      description:
        "Returns the MotionStudio working guide: the step-by-step loop (script → storyboard → voice → scenes → look → sound), the approval gates, and the no-slop rules. Call this FIRST in every session, before any other tool.",
      annotations: READ_ONLY,
    },
    safely("agent_md", async () => text(AGENT_MD)),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Read a guide topic or style brief",
      description:
        "Returns one guide topic (script, storyboard, voice, sound, code-clips, checks, resources) or a motion style's brief by its id (story-scene, presenter, system, documentary). Call with no topic to list what exists. Use the project's motionStyle as the topic to read its brief.",
      inputSchema: z.strictObject({
        topic: z
          .string()
          .max(40)
          .optional()
          .describe(
            'A topic or style id, e.g. "storyboard" or "presenter". Omit to list all topics and styles.',
          ),
      }),
      annotations: READ_ONLY,
    },
    safely("get_guide", async ({ topic }: { topic?: string }) => {
      const index = `## Topics\n${Object.keys(GUIDE_TOPICS)
        .map((t) => `- ${t}`)
        .join("\n")}\n\n## Styles (use the id as the topic)\n${listBriefs()}`;
      if (!topic) return text(index);
      const found = guide(topic.trim().toLowerCase());
      return found
        ? text(found)
        : text(`No guide topic "${topic}".\n\n${index}`);
    }),
  );

  server.registerTool(
    "get_example",
    {
      title: "Study a worked example",
      description:
        'Returns the finished worked example for a motion style: what to copy from it, its script and storyboard as data, its character and places as working drawing code, the helpers that code uses, and 6 stills (images) of what "right" looks like. Read it before writing the storyboard and before your first code layer; compare your render_frames output with these stills.',
      inputSchema: z.strictObject({
        style: z
          .enum(MOTION_STYLES)
          .describe("The project's motionStyle (get_project)."),
        include_code: z
          .boolean()
          .default(true)
          .describe(
            "Include the drawing code and helpers (large). Default true.",
          ),
      }),
      annotations: READ_ONLY,
    },
    safely(
      "get_example",
      async ({
        style,
        include_code,
      }: {
        style: (typeof MOTION_STYLES)[number];
        include_code: boolean;
      }) => {
        const example = findExample(style);
        if (!example)
          throw new StudioError(
            `No worked example for "${style}". Styles: ${MOTION_STYLES.join(", ")}.`,
          );
        const body = [
          `# ${example.title} — ${style} (${example.seconds}s, ${example.format})`,
          `## What to copy\n${example.notes}`,
          `## Script and storyboard\n${example.shots}`,
          include_code
            ? `## Drawing code\n${Object.entries(example.drawing)
                .map(([name, code]) => `### ${name}\n\`\`\`js\n${code}\n\`\`\``)
                .join(
                  "\n\n",
                )}\n\n## Helpers (define the ones you use at the top of a code layer)\n\`\`\`js\n${example.helpers}\n\`\`\``
            : "_Drawing code omitted (include_code: false)._",
          `## Stills\nThe ${example.stills.length} images that follow are frames of this example: the standard your frames should meet.`,
        ].join("\n\n");
        const stills = await Promise.all(
          example.stills.map(async (still) => ({
            type: "image" as const,
            data: (await readFile(path.join(EXAMPLES_DIR, still))).toString(
              "base64",
            ),
            mimeType: "image/jpeg",
          })),
        );
        return { content: [{ type: "text", text: body }, ...stills] };
      },
    ),
  );
}
