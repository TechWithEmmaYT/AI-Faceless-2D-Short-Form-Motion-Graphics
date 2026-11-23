import "server-only";

import type { CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { CloudinaryError } from "@/lib/cloudinary";
import { StudioError } from "@/lib/db/queries/studio";

import { currentTool } from "./activity";

/** Shared input fields. `.describe()` text is the only documentation the model sees for an argument. */
export const projectIdField = z
  .string()
  .min(1)
  .max(64)
  .describe(
    'The project id from the handoff prompt, e.g. "9ea24d2a-00d1-4611-a4e2-98163a6ef15b".',
  );

export const sceneIdField = z
  .string()
  .min(1)
  .max(64)
  .describe("A scene id from get_project.");
export const layerIdField = z
  .string()
  .min(1)
  .max(64)
  .describe("A layer id from get_project.");

export const responseFormatField = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe(
    "'markdown' for readable text (default), 'json' for structured data.",
  );

export const boxField = z
  .strictObject({
    x: z
      .number()
      .min(-1080)
      .max(2160)
      .describe("Left edge in px on the 1080×1920 canvas."),
    y: z.number().min(-1920).max(3840).describe("Top edge in px."),
    w: z.number().positive().max(2160).describe("Width in px."),
    h: z.number().positive().max(3840).describe("Height in px."),
  })
  .describe(
    "Where the layer draws, in px on the 1080×1920 canvas. The layer draws inside this box.",
  );

export const joinField = z
  .enum(["cut", "dissolve", "swap"])
  .describe(
    "How the scene enters: 'cut' (instant), 'dissolve' (fades in from blank), 'swap' (slides up from blank). Scenes never blend into each other.",
  );

/** Plain text result. */
export function text(body: string): CallToolResult {
  return { content: [{ type: "text", text: body }] };
}

/** Structured result: the data as structuredContent and its JSON as the text, per the MCP spec. */
export function json(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** Text in markdown mode, or structured JSON in json mode. */
export function formatted(
  format: "markdown" | "json",
  markdown: string,
  data: Record<string, unknown>,
): CallToolResult {
  return format === "json" ? json(data) : text(markdown);
}

/**
 * One readable line for the agent. Drizzle wraps driver errors as "Failed query: <sql>", which hides
 * the reason — so report the underlying cause instead, and name database outages as such.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 300);
  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : "";
  if (error.message.startsWith("Failed query")) {
    return `MotionStudio's database didn't answer (${(cause || "connection error").split("\n")[0]!.slice(0, 200)})`;
  }
  return error.message.split("\n")[0]!.slice(0, 300);
}

/**
 * Wraps every tool handler:
 * - runs it with the tool's name in context, so the project gets its "Agent is working" stamp;
 * - always reports errors back to the agent as tool errors (isError results) it can read and act on:
 *   StudioError messages as written, anything else as its first line (no stack traces).
 * Zod input-validation errors never reach here — the SDK returns them to the agent itself.
 */
export function safely<A>(
  name: string,
  handler: (args: A) => Promise<CallToolResult>,
) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await currentTool.run({ tool: name }, () => handler(args));
    } catch (error) {
      if (error instanceof StudioError || error instanceof CloudinaryError)
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      // Always tell the agent what went wrong — the first line of the message, never a stack trace.
      console.error(
        `[mcp] ${name} failed`,
        error,
        error instanceof Error ? error.cause : undefined,
      );
      const message = describeError(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `${name} failed: ${message}. Try once more; if it fails again, tell the user what happened and stop.`,
          },
        ],
      };
    }
  };
}
