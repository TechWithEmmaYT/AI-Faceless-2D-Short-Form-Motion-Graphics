import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { workspacePath } from "@/lib/agent/guide/workspace";
import { getProjectState } from "@/lib/db/queries/scenes";
import {
  StudioError,
  listProjectElements,
  requireProject,
  saveScript,
  saveStoryboard,
} from "@/lib/db/queries/studio";
import { ELEMENTS } from "@/lib/render/elements";
import { sceneStarts, totalDuration } from "@/lib/render/timeline";
import type { Layer } from "@/lib/render/types";
import {
  checkScript,
  checkStoryboard,
  lineRange,
  scriptLines,
  storyboardShotSchema,
  type StoryboardShot,
} from "@/lib/validation/script";

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
const s = (n: number) => `${Math.round(n * 100) / 100}s`;

function layerLine(layer: Layer) {
  const when = `${s(layer.start)}–${layer.end === null ? "end" : s(layer.end)}`;
  const box = `box ${layer.box.x},${layer.box.y} ${layer.box.w}×${layer.box.h}`;
  const what =
    layer.kind === "element"
      ? `element "${layer.elementRef}"`
      : layer.kind === "caption"
        ? `caption "${layer.text}"`
        : `code (${layer.code.length} chars)`;
  return `  - z${layer.z} **${layer.name}** — ${what}, ${when}, ${box} (layer id: ${layer.id})`;
}

/** get_project, get_selection, save_script, save_storyboard. */
export function registerProjectTools(server: McpServer, userId: string) {
  server.registerTool(
    "get_project",
    {
      title: "Read the project",
      description:
        "Returns everything about one project: title, motionStyle, the user's brief, the saved script (numbered lines), the storyboard shots, every scene with its layers (ids, kinds, times, boxes), the saved elements, and the selected scene. Call it at the start and whenever you need real ids — never guess an id. Code bodies are omitted unless include_code is true.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        include_code: z
          .boolean()
          .default(false)
          .describe(
            "Include the full code of code layers (large). Default false.",
          ),
        response_format: responseFormatField,
      }),
      annotations: READ_ONLY,
    },
    safely(
      "get_project",
      async ({
        projectId,
        include_code,
        response_format,
      }: {
        projectId: string;
        include_code: boolean;
        response_format: "markdown" | "json";
      }) => {
        const state = await getProjectState(userId, projectId);
        if (!state) await requireProject(userId, projectId); // throws the actionable not-found error
        const { project, scenes } = state!;
        const elements = await listProjectElements(projectId);
        const lines = project.script ? scriptLines(project.script) : [];
        const shots = (
          Array.isArray(project.storyboard) ? project.storyboard : []
        ) as StoryboardShot[];
        const starts = sceneStarts(scenes);
        const raw = await requireProject(userId, projectId);

        const music = state!.sounds.find((x) => x.kind === "music") ?? null;
        const scenesOut = scenes.map((sc) => ({
          ...sc,
          startSec: starts.get(sc.id) ?? 0,
          voice: (() => {
            const v = state!.voiceClips.find((clip) => clip.sceneId === sc.id);
            return v ? { voiceName: v.voiceName, durationSec: v.durationSec, lines: v.lines.map((l) => ({ line: l.line, start: l.start, end: l.end })) } : null;
          })(),
          sounds: state!.sounds
            .filter((x) => x.kind === "sfx" && x.sceneId === sc.id)
            .map((x) => ({ id: x.id, name: x.name, atSec: x.atSec, volume: x.volume, trimStart: x.trimStart, trimEnd: x.trimEnd })),
          layers: sc.layers.map((l) =>
            l.kind === "code" && !include_code
              ? {
                  ...l,
                  code: `<${l.code.length} chars — include_code:true to read>`,
                }
              : l,
          ),
        }));

        const data = {
          project: {
            id: project.id,
            title: project.title,
            motionStyle: project.motionStyle,
            targetSeconds: project.targetSeconds,
            inputMode: project.inputMode,
            brief: project.brief,
            version: project.version,
            durationSec: totalDuration(scenes),
            selectedSceneId: raw.selectedSceneId,
            workspace: `${workspacePath(project.id)}/`,
          },
          script: project.script
            ? {
                lines: lines.map((l) => ({
                  n: l.n,
                  text: l.text,
                  sceneBreakBefore: l.sceneBreakBefore,
                })),
              }
            : null,
          storyboard: shots.length ? shots : null,
          scenes: scenesOut,
          music: music ? { id: music.id, name: music.name, atSec: music.atSec, volume: music.volume, fadeIn: music.fadeIn, fadeOut: music.fadeOut } : null,
          elements: {
            builtIn: Object.keys(ELEMENTS),
            saved: elements.map((e) => ({
              name: e.name,
              role: e.role,
              description: e.description,
            })),
          },
        };

        const md = [
          `# ${project.title} (projectId: ${project.id})`,
          `Style **${project.motionStyle}** · target about ${project.targetSeconds}s · 9:16 · version ${project.version} · ${scenes.length} scenes, ${s(totalDuration(scenes))}`,
          `Workspace: \`${workspacePath(project.id)}/\` on the user's machine — create it if missing; read its progress.md first if it exists.`,
          ``,
          `## The user's ${project.inputMode}`,
          project.brief,
          ``,
          `## Script`,
          lines.length
            ? lines
                .map(
                  (l) => `${l.sceneBreakBefore ? "\n" : ""}${l.n}. ${l.text}`,
                )
                .join("\n")
            : '_Not saved yet._ Write it (get_guide "script"), show it to the user, and save_script only after they agree.',
          ``,
          `## Storyboard`,
          shots.length
            ? shots
                .map(
                  (sh, i) =>
                    `${i + 1}. **${sh.id}** — ${sh.place} — ${lineRange(sh.lines)}${sh.cards?.length ? ` — cards: ${sh.cards.map((c) => c.kind).join(", ")}` : ""}${sh.moves ? ` — ${sh.moves}` : ""}`,
                )
                .join("\n")
            : '_Not saved yet._ After the script is saved: group lines into shots (get_guide "storyboard"), show them, save_storyboard after a yes.',
          ``,
          `## Scenes`,
          scenesOut.length
            ? scenesOut
                .map(
                  (sc, i) =>
                    `${i + 1}. **${sc.title}** (scene id: ${sc.id}) — starts ${s(sc.startSec)}, ${s(sc.durationSec)}, join ${sc.join}${sc.shotId ? `, shot ${sc.shotId}` : ""}\n  - voice: ${sc.voice ? `${sc.voice.voiceName}, ${s(sc.voice.durationSec)} — ${sc.voice.lines.map((l) => `line ${l.line} ${s(l.start)}–${s(l.end)}`).join(", ")}` : "_none yet_"}\n${sc.sounds.map((x) => `  - sound "${x.name}" at ${s(x.atSec)}, volume ${x.volume} (sound id: ${x.id})`).join("\n")}${sc.sounds.length ? "\n" : ""}${sc.layers.length ? sc.layers.map(layerLine).join("\n") : "  - _no layers — plays as a blank frame_"}`,
                )
                .join("\n")
            : "_No scenes yet._",
          ``,
          `## Music`,
          music ? `"${music.name}" from ${s(music.atSec)}, volume ${music.volume}, fades ${music.fadeIn}s / ${music.fadeOut}s (sound id: ${music.id})` : "_None._ Only if the user asks (get_guide \"sound\").",
          ``,
          `## Elements`,
          `Built-in: ${Object.keys(ELEMENTS).join(", ")}`,
          `Saved: ${elements.length ? elements.map((e) => `${e.name} (${e.role})`).join(", ") : "none"}`,
          ``,
          `Selected scene: ${raw.selectedSceneId ?? "none"}`,
        ].join("\n");

        return formatted(response_format, md, data);
      },
    ),
  );

  server.registerTool(
    "get_selection",
    {
      title: "Get the scene the user has open",
      description:
        'Returns the scene the user has selected in the studio, so "this scene" / "this" in the user\'s message can be resolved. Returns "nothing selected" when they are viewing the full video.',
      inputSchema: z.strictObject({ projectId: projectIdField }),
      annotations: READ_ONLY,
    },
    safely("get_selection", async ({ projectId }: { projectId: string }) => {
      const project = await requireProject(userId, projectId);
      if (!project.selectedSceneId)
        return text("Nothing selected — the user is viewing the full video.");
      const state = await getProjectState(userId, projectId);
      const index =
        state?.scenes.findIndex((sc) => sc.id === project.selectedSceneId) ??
        -1;
      const sc = index >= 0 ? state!.scenes[index]! : null;
      if (!sc)
        return text("Nothing selected — the user is viewing the full video.");
      return text(
        `Selected: scene ${index + 1} of ${state!.scenes.length} — **${sc.title}** (scene id: ${sc.id}), ${s(sc.durationSec)}, ${sc.layers.length} layers.`,
      );
    }),
  );

  server.registerTool(
    "save_script",
    {
      title: "Save the approved script",
      description:
        "Saves the script — one line per caption, blank line between scenes, at most one *key* word per line. GATE: only call this after the user has approved the script in chat. Replaces any saved script; re-check the storyboard afterwards if line numbers changed. Returns the numbered lines and any style warnings.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        script: z
          .string()
          .min(1)
          .max(20_000)
          .describe(
            'The full script text. Example:\n"If the whole city goes dark\\nand you live on the *fourteenth floor*,\\nthe clock starts now.\\n\\nMeet *Maya*."',
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
      "save_script",
      async ({ projectId, script }: { projectId: string; script: string }) => {
        const checked = checkScript(script);
        if (!checked.ok) throw new StudioError(checked.error);
        const before = await requireProject(userId, projectId);
        await saveScript(userId, projectId, checked.normalized);
        const hadStoryboard =
          Array.isArray(before.storyboard) && before.storyboard.length > 0;
        return text(
          [
            `Saved the script: ${checked.lines.length} lines.`,
            checked.lines
              .map((l) => `${l.sceneBreakBefore ? "\n" : ""}${l.n}. ${l.text}`)
              .join("\n"),
            checked.warnings.length
              ? `\nWarnings (fix if the user agrees):\n- ${checked.warnings.join("\n- ")}`
              : "",
            hadStoryboard
              ? "\nA storyboard was already saved — check its line numbers still match, and save_storyboard again if not."
              : '\nNext: the storyboard (get_guide "storyboard").',
          ].join("\n"),
        );
      },
    ),
  );

  server.registerTool(
    "save_storyboard",
    {
      title: "Save the approved storyboard",
      description:
        "Saves the storyboard: a list of shots, each carrying a run of script lines (place, lines, cards, moves, join). Every script line must belong to exactly one shot, in order. GATE: needs a saved script, and only call it after the user approved the storyboard in chat. Replaces any saved storyboard.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        shots: z
          .array(storyboardShotSchema)
          .min(1)
          .max(40)
          .describe("The shots in play order."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "save_storyboard",
      async ({
        projectId,
        shots,
      }: {
        projectId: string;
        shots: StoryboardShot[];
      }) => {
        const project = await requireProject(userId, projectId);
        if (!project.script)
          throw new StudioError(
            "Save the approved script first (save_script) — shots point at its line numbers.",
          );
        const lineCount = scriptLines(project.script).length;
        const checked = checkStoryboard(shots, lineCount);
        if (!checked.ok) throw new StudioError(checked.error);
        await saveStoryboard(userId, projectId, shots);
        return text(
          `Saved the storyboard: ${shots.length} shots covering all ${lineCount} lines.\n${shots.map((sh, i) => `${i + 1}. ${sh.id} — ${sh.place} — ${lineRange(sh.lines)}`).join("\n")}\n\nNext: the voice (get_guide "voice"), then build scenes with add_scene.`,
        );
      },
    ),
  );
}
