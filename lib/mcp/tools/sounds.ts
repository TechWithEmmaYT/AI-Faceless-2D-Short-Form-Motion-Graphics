import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  assetFolder,
  getAudioAsset,
  ownsPublicId,
  uploadFromUrl,
  type AudioAsset,
} from "@/lib/cloudinary";
import {
  StudioError,
  addSound,
  listScenes,
  listSounds,
  removeSound,
  requireProject,
  requireScene,
  requireSound,
  updateSound,
  type SoundRow,
  type SoundValues,
} from "@/lib/db/queries/studio";

import { projectIdField, safely, sceneIdField, text } from "../shared";

type Kind = "sfx" | "music";

/** The guide's rules (get_guide "sound"): sounds sit under the voice; music is a quiet bed. */
const RULES = {
  sfx: {
    volume: { min: 0.2, max: 0.4, default: 0.3 },
    fadeIn: 0,
    fadeOut: 0.05,
    folder: "sound" as const,
  },
  music: {
    volume: { min: 0.01, max: 0.1, default: 0.045 },
    fadeIn: 2,
    fadeOut: 3,
    folder: "music" as const,
  },
};
const STORY_SOUNDS_SOFT_LIMIT = 8;

const soundIdField = z
  .string()
  .min(1)
  .max(64)
  .describe("A sound id from get_project.");
const fileFields = {
  publicId: z
    .string()
    .max(300)
    .optional()
    .describe(
      'An uploaded file\'s publicId (get_upload_target with kind "sound" or "music").',
    ),
  url: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .optional()
    .describe(
      "Or: a public https audio URL (e.g. Fish Audio's sound library, Openverse); it's copied to Cloudinary.",
    ),
};
const timingFields = {
  at_sec: z
    .number()
    .min(0)
    .max(600)
    .describe(
      "sfx: when it starts, in SCENE seconds — the frame the picture shows the thing. music: when it starts, in VIDEO seconds.",
    ),
  volume: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "sfx 0.2–0.4 (default 0.3); music 0.1 or less (default 0.045). Always under the voice.",
    ),
  trim_start: z
    .number()
    .min(0)
    .describe("Skip this many seconds at the start of the file (default 0)."),
  trim_end: z
    .number()
    .positive()
    .nullable()
    .describe(
      "Stop at this point in the file, in seconds; null = the file's end.",
    ),
  fade_in: z
    .number()
    .min(0)
    .max(10)
    .describe("Fade-in seconds (music default 2, sfx 0)."),
  fade_out: z
    .number()
    .min(0)
    .max(10)
    .describe("Fade-out seconds (music default 3, sfx 0.05)."),
};

/** The file: an upload in this project's folder for that kind, or a URL Cloudinary copies in. */
async function resolveFile(
  userId: string,
  projectId: string,
  kind: Kind,
  publicId: string | undefined,
  url: string | undefined,
  label: string,
): Promise<AudioAsset> {
  if (!publicId === !url)
    throw new StudioError(
      "Pass exactly one of publicId (an uploaded file) or url (a public https audio URL).",
    );
  const folderKind = RULES[kind].folder;
  if (publicId) {
    if (!ownsPublicId(publicId, userId, projectId, folderKind)) {
      throw new StudioError(
        `That publicId isn't in this project's ${folderKind} folder. Get an upload target with get_upload_target (kind "${folderKind}") and upload there.`,
      );
    }
    const found = await getAudioAsset(publicId);
    if (!found)
      throw new StudioError(
        `No uploaded file "${publicId}". Check the curl upload succeeded, then try again.`,
      );
    return found;
  }
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "sound";
  return uploadFromUrl(
    url!,
    assetFolder(userId, projectId, folderKind),
    `${slug}-${Date.now().toString(36)}`,
  );
}

/** Checks a sound as it will be stored, against its scene (sfx) or the video (music). */
async function checkSound(
  userId: string,
  projectId: string,
  s: {
    kind: Kind;
    sceneId: string | null;
    atSec: number;
    volume: number;
    trimStart: number;
    trimEnd: number | null;
    /** The file's length; null before the file is fetched (only the checks that need it are skipped). */
    durationSec: number | null;
  },
) {
  const { min, max } = RULES[s.kind].volume;
  if (s.volume < min || s.volume > max) {
    throw new StudioError(
      s.kind === "sfx"
        ? `A story sound's volume must be ${min}–${max} (quiet, under the voice); got ${s.volume}.`
        : `Music must stay under the voice: volume ${max} or less (about 0.045 is right); got ${s.volume}.`,
    );
  }
  const fileLength = s.durationSec && s.durationSec > 0 ? s.durationSec : null;
  if (s.trimEnd !== null && fileLength !== null && s.trimEnd > fileLength + 0.05)
    throw new StudioError(
      `trim_end (${s.trimEnd}s) is past the file's end (${fileLength.toFixed(2)}s).`,
    );
  const end = s.trimEnd ?? fileLength;
  if (end !== null && end - s.trimStart <= 0.05)
    throw new StudioError(
      `Nothing left to play: trim_start ${s.trimStart}s, end ${end.toFixed(2)}s.`,
    );
  const plays = end === null ? 0 : end - s.trimStart;

  if (s.kind === "sfx") {
    const sc = await requireScene(userId, projectId, s.sceneId!);
    if (s.atSec >= sc.durationSec)
      throw new StudioError(
        `at_sec ${s.atSec}s is past the end of "${sc.title}" (${sc.durationSec}s). Times are scene seconds: put it on the frame that shows the thing.`,
      );
    return { scene: sc, plays };
  }
  const total = (await listScenes(projectId)).reduce(
    (sum, sc) => sum + sc.durationSec,
    0,
  );
  if (total > 0 && s.atSec >= total)
    throw new StudioError(
      `at_sec ${s.atSec}s is past the end of the video (${total.toFixed(2)}s). Music times are video seconds.`,
    );
  return { scene: null, plays };
}

const describe = (
  row: Pick<SoundRow, "kind" | "name" | "atSec" | "volume">,
  sceneTitle?: string,
) =>
  row.kind === "sfx"
    ? `story sound "${row.name}" in "${sceneTitle ?? "its scene"}" at ${row.atSec}s, volume ${row.volume}`
    : `music "${row.name}" from ${row.atSec}s, volume ${row.volume}`;

/** add_sound, update_sound, remove_sound — story sounds only where the script names one; an optional quiet music bed. */
export function registerSoundTools(server: McpServer, userId: string) {
  server.registerTool(
    "add_sound",
    {
      title: "Add a story sound or music",
      description:
        'Adds a sound. kind "sfx": a story sound the script names (a phone buzzes → a buzz), in one scene, starting at_sec scene seconds — on the frame the picture shows it, quiet (0.2–0.4). kind "music": the optional music bed across the video (only if the user asked), very quiet (≤ 0.1), one per project. Pass publicId (uploaded via get_upload_target) or url (copied to Cloudinary). Never generic whooshes, risers or hits. Returns the sound id — change it later with update_sound, delete it with remove_sound.',
      inputSchema: z.strictObject({
        projectId: projectIdField,
        kind: z
          .enum(["sfx", "music"])
          .describe(
            '"sfx" (a story sound in one scene) or "music" (the bed across the video).',
          ),
        sceneId: sceneIdField
          .optional()
          .describe('kind "sfx": the scene it belongs to. Omit for music.'),
        name: z
          .string()
          .min(1)
          .max(80)
          .describe(
            'A short label, e.g. "phone buzz", "door knock", "night ambience bed".',
          ),
        source: z
          .string()
          .min(1)
          .max(120)
          .describe(
            'Where the file came from, e.g. "Fish Audio sound library", "Openverse".',
          ),
        ...fileFields,
        at_sec: timingFields.at_sec.default(0),
        volume: timingFields.volume.optional(),
        trim_start: timingFields.trim_start.default(0),
        trim_end: timingFields.trim_end.default(null),
        fade_in: timingFields.fade_in.optional(),
        fade_out: timingFields.fade_out.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "add_sound",
      async (a: {
        projectId: string;
        kind: Kind;
        sceneId?: string;
        name: string;
        source: string;
        publicId?: string;
        url?: string;
        at_sec: number;
        volume?: number;
        trim_start: number;
        trim_end: number | null;
        fade_in?: number;
        fade_out?: number;
      }) => {
        await requireProject(userId, a.projectId);
        const rules = RULES[a.kind];
        if (a.kind === "sfx" && !a.sceneId)
          throw new StudioError(
            'A story sound ("sfx") needs sceneId — the scene where the thing happens.',
          );
        if (a.kind === "music" && a.sceneId)
          throw new StudioError(
            "Music runs across the whole video: omit sceneId (use at_sec in video seconds).",
          );
        const existing = await listSounds(a.projectId);
        if (a.kind === "music") {
          const bed = existing.find((x) => x.kind === "music");
          if (bed)
            throw new StudioError(
              `This project already has a music bed ("${bed.name}", sound id: ${bed.id}). Change it with update_sound (a new publicId/url replaces the file) or remove it with remove_sound.`,
            );
        }
        const volume = a.volume ?? rules.volume.default;
        // Validate everything we can BEFORE touching Cloudinary.
        await checkSound(userId, a.projectId, {
          kind: a.kind,
          sceneId: a.sceneId ?? null,
          atSec: a.at_sec,
          volume,
          trimStart: a.trim_start,
          trimEnd: a.trim_end,
          durationSec: null,
        });
        const file = await resolveFile(
          userId,
          a.projectId,
          a.kind,
          a.publicId,
          a.url,
          a.name,
        );
        const values: SoundValues = {
          kind: a.kind,
          sceneId: a.kind === "sfx" ? a.sceneId! : null,
          name: a.name,
          source: a.source,
          atSec: a.at_sec,
          publicId: file.publicId,
          url: file.url,
          durationSec: file.durationSec,
          volume,
          trimStart: a.trim_start,
          trimEnd: a.trim_end,
          fadeIn: a.fade_in ?? rules.fadeIn,
          fadeOut: a.fade_out ?? rules.fadeOut,
        };
        const { scene, plays } = await checkSound(userId, a.projectId, {
          kind: a.kind,
          sceneId: values.sceneId ?? null,
          atSec: a.at_sec,
          volume,
          trimStart: a.trim_start,
          trimEnd: a.trim_end,
          durationSec: file.durationSec,
        });
        const { id } = await addSound(userId, a.projectId, values);
        const storySounds =
          existing.filter((x) => x.kind === "sfx").length +
          (a.kind === "sfx" ? 1 : 0);
        return text(
          [
            `Added ${describe({ kind: a.kind, name: a.name, atSec: a.at_sec, volume }, scene?.title)} — plays ${plays.toFixed(2)}s (sound id: ${id}).`,
            scene && a.at_sec + plays > scene.durationSec
              ? `Note: it runs past the scene's end (${scene.durationSec}s) and is cut there.`
              : "",
            storySounds > STORY_SOUNDS_SOFT_LIMIT
              ? `Note: ${storySounds} story sounds — the guide says a handful per video. Keep only the ones the script names.`
              : "",
            "You can't hear it: give the user timecodes to check by ear.",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      },
    ),
  );

  server.registerTool(
    "update_sound",
    {
      title: "Update a sound",
      description:
        "Changes a sound: its time (at_sec), volume, trim, fades, name or source — and/or REPLACES its file (pass a new publicId or url) while keeping its place. Only the fields you pass change; kind and scene stay (to move a story sound to another scene, remove it and add it there).",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        soundId: soundIdField,
        name: z.string().min(1).max(80).optional(),
        source: z.string().min(1).max(120).optional(),
        ...fileFields,
        at_sec: timingFields.at_sec.optional(),
        volume: timingFields.volume.optional(),
        trim_start: timingFields.trim_start.optional(),
        trim_end: timingFields.trim_end.optional(),
        fade_in: timingFields.fade_in.optional(),
        fade_out: timingFields.fade_out.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "update_sound",
      async (a: {
        projectId: string;
        soundId: string;
        name?: string;
        source?: string;
        publicId?: string;
        url?: string;
        at_sec?: number;
        volume?: number;
        trim_start?: number;
        trim_end?: number | null;
        fade_in?: number;
        fade_out?: number;
      }) => {
        const current = await requireSound(userId, a.projectId, a.soundId);
        const changed = (Object.keys(a) as (keyof typeof a)[]).filter(
          (k) => k !== "projectId" && k !== "soundId" && a[k] !== undefined,
        );
        if (changed.length === 0)
          throw new StudioError(
            "Nothing to change: pass at least one field to update.",
          );
        const merged = {
          kind: current.kind,
          sceneId: current.sceneId,
          atSec: a.at_sec ?? current.atSec,
          volume: a.volume ?? current.volume,
          trimStart: a.trim_start ?? current.trimStart,
          trimEnd: a.trim_end !== undefined ? a.trim_end : current.trimEnd,
          durationSec: current.durationSec,
        };
        // Check the timing first — against the current file, or (when swapping) without a length —
        // before touching Cloudinary; a new file is checked again once its length is known.
        const swapping = Boolean(a.publicId || a.url);
        await checkSound(userId, a.projectId, swapping ? { ...merged, durationSec: null } : merged);
        const file =
          a.publicId || a.url
            ? await resolveFile(
                userId,
                a.projectId,
                current.kind,
                a.publicId,
                a.url,
                a.name ?? current.name,
              )
            : null;
        if (file)
          await checkSound(userId, a.projectId, {
            ...merged,
            durationSec: file.durationSec,
          });
        await updateSound(userId, a.projectId, a.soundId, {
          name: a.name ?? current.name,
          source: a.source ?? current.source,
          atSec: merged.atSec,
          volume: merged.volume,
          trimStart: merged.trimStart,
          trimEnd: merged.trimEnd,
          fadeIn: a.fade_in ?? current.fadeIn,
          fadeOut: a.fade_out ?? current.fadeOut,
          ...(file
            ? {
                publicId: file.publicId,
                url: file.url,
                durationSec: file.durationSec,
              }
            : {}),
        });
        return text(
          `Updated ${current.kind === "sfx" ? "story sound" : "music"} "${a.name ?? current.name}": ${changed.map((k) => (k === "publicId" || k === "url" ? "file replaced" : k)).join(", ")}.`,
        );
      },
    ),
  );

  server.registerTool(
    "remove_sound",
    {
      title: "Remove a sound",
      description:
        "Deletes a story sound or the music bed from the project. Can't be undone.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        soundId: soundIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "remove_sound",
      async ({
        projectId,
        soundId,
      }: {
        projectId: string;
        soundId: string;
      }) => {
        const current = await requireSound(userId, projectId, soundId);
        await removeSound(userId, projectId, soundId);
        return text(
          `Removed ${current.kind === "sfx" ? "story sound" : "music"} "${current.name}".`,
        );
      },
    ),
  );
}
