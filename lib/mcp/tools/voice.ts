import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  assetFolder,
  getAudioAsset,
  ownsPublicId,
  signedUpload,
  uploadFromUrl,
  type AssetKind,
} from "@/lib/cloudinary";
import {
  StudioError,
  requireProject,
  requireScene,
  saveVoiceClip,
} from "@/lib/db/queries/studio";
import type { VoiceLine } from "@/lib/db/schema";
import { scriptLines, type StoryboardShot } from "@/lib/validation/script";

import { projectIdField, safely, sceneIdField, text } from "../shared";

const fileName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,59}$/, 'Use a lowercase slug, e.g. "scene-01".')
  .describe(
    'The file\'s name in the project folder, without extension, e.g. "scene-01".',
  );

const lineSchema = z.strictObject({
  line: z
    .int()
    .min(1)
    .describe("The script line number (1-based, as in get_project)."),
  start: z
    .number()
    .min(0)
    .describe("Where the line starts inside the file, in seconds."),
  end: z
    .number()
    .positive()
    .describe("Where the line ends inside the file, in seconds."),
  text: z
    .string()
    .max(200)
    .optional()
    .describe("The line's text — only needed if no script is saved."),
  words: z
    .array(
      z.strictObject({
        w: z.string().max(60),
        start: z.number().min(0),
        end: z.number().positive(),
      }),
    )
    .max(40)
    .optional()
    .describe(
      "Word times inside the file (from Fish Audio speech_to_text or Whisper), if you have them.",
    ),
});

/** The voiceover file: an upload checked against this project's voice folder, or a URL copied into it. */
async function resolveVoiceFile(
  userId: string,
  projectId: string,
  publicId: string | undefined,
  url: string | undefined,
  name: string,
) {
  if (publicId) {
    if (!ownsPublicId(publicId, userId, projectId, "voice")) {
      throw new StudioError(
        `That publicId isn't in this project's voice folder. Get an upload target with get_upload_target (kind "voice") and upload there.`,
      );
    }
    const found = await getAudioAsset(publicId);
    if (!found)
      throw new StudioError(
        `No uploaded file "${publicId}". Check the curl upload succeeded, then try again.`,
      );
    return found;
  }
  return uploadFromUrl(url!, assetFolder(userId, projectId, "voice"), name);
}

/** get_upload_target, save_generated_audio — the voice comes first and sets every time in the video. */
export function registerVoiceTools(server: McpServer, userId: string) {
  server.registerTool(
    "get_upload_target",
    {
      title: "Get an upload target",
      description:
        "Returns a signed, single-use Cloudinary upload (valid 1 hour) for one audio file in this project's folder, with a ready-to-run curl command. Use it to upload a file you made locally — e.g. a scene's joined voiceover (vo/scene-01.mp3) — then pass the returned publicId to save_generated_audio. Uploading the same name again replaces the file.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        kind: z
          .enum(["voice", "sound", "music"])
          .default("voice")
          .describe("What the file is."),
        name: fileName,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "get_upload_target",
      async ({
        projectId,
        kind,
        name,
      }: {
        projectId: string;
        kind: AssetKind;
        name: string;
      }) => {
        await requireProject(userId, projectId);
        const target = await signedUpload(
          assetFolder(userId, projectId, kind),
          name,
        );
        const form = Object.entries(target.fields)
          .map(([k, v]) => `-F "${k}=${v}"`)
          .join(" ");
        return text(
          [
            `Upload target for "${name}" (valid until ${target.expiresAt}):`,
            "",
            "```bash",
            `curl -sS -X POST ${target.url} -F "file=@<path-to-your-file>" ${form}`,
            "```",
            "",
            `Then call save_generated_audio with publicId "${target.publicId}".`,
          ].join("\n"),
        );
      },
    ),
  );

  server.registerTool(
    "save_generated_audio",
    {
      title: "Save a scene's voiceover",
      description:
        "Saves ONE voiceover file for a scene — its lines' clips joined with their breaths — and each line's start/end inside it; the scene's length becomes the last line's end plus tail_sec. Pass publicId (a file you uploaded via get_upload_target) or url (a public https audio URL, e.g. from Fish Audio text_to_speech; it's copied to Cloudinary). Saving again for the same scene replaces it. Build the scene's captions on these times.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        sceneId: sceneIdField,
        publicId: z
          .string()
          .max(300)
          .optional()
          .describe("The uploaded file's publicId (from get_upload_target)."),
        url: z
          .url({ protocol: /^https$/ })
          .max(2000)
          .optional()
          .describe(
            "Or: a public https URL of the audio to copy into the project.",
          ),
        voiceName: z
          .string()
          .min(1)
          .max(80)
          .describe(
            'The Fish Audio voice used, e.g. "Emma". Use the same voice for every scene.',
          ),
        lines: z
          .array(lineSchema)
          .min(1)
          .max(40)
          .describe(
            "The script lines in this file, in order, with their times inside it.",
          ),
        tail_sec: z
          .number()
          .min(0)
          .max(3)
          .default(0.5)
          .describe(
            "Hold after the last line before the next scene (default 0.5 s).",
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
      "save_generated_audio",
      async (a: {
        projectId: string;
        sceneId: string;
        publicId?: string;
        url?: string;
        voiceName: string;
        lines: z.infer<typeof lineSchema>[];
        tail_sec: number;
      }) => {
        if (!a.publicId === !a.url)
          throw new StudioError(
            "Pass exactly one of publicId (an uploaded file) or url (a public https audio URL).",
          );
        const project = await requireProject(userId, a.projectId);
        const sc = await requireScene(userId, a.projectId, a.sceneId);

        // Lines: in order, non-overlapping, and (when there's a script) real lines of it.
        const script = project.script
          ? new Map(scriptLines(project.script).map((l) => [l.n, l.text]))
          : null;
        const shots = (
          Array.isArray(project.storyboard) ? project.storyboard : []
        ) as StoryboardShot[];
        const shotLines = sc.shotId
          ? shots.find((s) => s.id === sc.shotId)?.lines
          : undefined;
        let previousEnd = 0;
        const lines: VoiceLine[] = a.lines.map((l, i) => {
          if (l.end <= l.start)
            throw new StudioError(
              `Line ${l.line}: end (${l.end}s) must be after start (${l.start}s).`,
            );
          if (l.start < previousEnd - 0.01)
            throw new StudioError(
              `Line ${l.line} starts at ${l.start}s, before the previous line ends (${previousEnd}s). Lines must be in order without overlapping.`,
            );
          if (i > 0 && l.line <= a.lines[i - 1]!.line)
            throw new StudioError(
              `Lines must be in script order: line ${l.line} comes after line ${a.lines[i - 1]!.line}.`,
            );
          if (script && !script.has(l.line))
            throw new StudioError(
              `Line ${l.line} isn't in the saved script (it has ${script.size} lines).`,
            );
          if (shotLines && !shotLines.includes(l.line)) {
            throw new StudioError(
              `Line ${l.line} isn't in this scene's shot "${sc.shotId}" (lines ${shotLines.join(", ")}). Save each scene's own lines with its scene.`,
            );
          }
          const text = script?.get(l.line) ?? l.text;
          if (!text)
            throw new StudioError(
              `Line ${l.line} needs text — no script is saved yet.`,
            );
          previousEnd = l.end;
          return {
            line: l.line,
            text,
            start: l.start,
            end: l.end,
            ...(l.words?.length ? { words: l.words } : {}),
          };
        });

        // The file: verify an upload is in this project's voice folder, or copy a URL into it.
        const asset = await resolveVoiceFile(
          userId,
          a.projectId,
          a.publicId,
          a.url,
          `scene-${sc.position + 1}-${Date.now().toString(36)}`,
        );

        const lastEnd = lines[lines.length - 1]!.end;
        if (asset.durationSec > 0 && lastEnd > asset.durationSec + 0.05) {
          throw new StudioError(
            `The last line ends at ${lastEnd}s but the file is only ${asset.durationSec.toFixed(2)}s long. Measure the clips again (ffprobe) and resend the times.`,
          );
        }
        const sceneDuration = Math.round((lastEnd + a.tail_sec) * 100) / 100;
        await saveVoiceClip(
          userId,
          a.projectId,
          a.sceneId,
          {
            publicId: asset.publicId,
            url: asset.url,
            durationSec: asset.durationSec,
            voiceName: a.voiceName,
            lines,
          },
          sceneDuration,
        );

        return text(
          [
            `Saved the voiceover for "${sc.title}": ${lines.length} line(s), ${asset.durationSec.toFixed(2)}s file, voice ${a.voiceName}.`,
            `The scene is now ${sceneDuration}s (was ${sc.durationSec}s).`,
            lines
              .map(
                (l) =>
                  `- line ${l.line} ${l.start}–${l.end}s: "${l.text.replace(/\*/g, "")}"`,
              )
              .join("\n"),
            "",
            "Next: put each caption on its line's times (add_layer / update_layer start & end), then render_frames.",
          ].join("\n"),
        );
      },
    ),
  );
}
