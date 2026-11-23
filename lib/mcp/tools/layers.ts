import "server-only";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  StudioError,
  addLayer,
  deleteLayer,
  getProjectElement,
  requireLayer,
  requireScene,
  updateLayer,
  type LayerRow,
} from "@/lib/db/queries/studio";
import { ELEMENTS } from "@/lib/render/elements";
import { checkDrawingCode, codeHash } from "@/lib/validate/code";

import {
  boxField,
  layerIdField,
  projectIdField,
  safely,
  sceneIdField,
  text,
} from "../shared";

const captionStyleField = z
  .strictObject({
    color: z
      .string()
      .max(40)
      .optional()
      .describe('Text colour, e.g. "#FFFFFF".'),
    accent: z
      .string()
      .max(40)
      .optional()
      .describe("Colour of the *key* word — the video's one accent."),
    size: z
      .number()
      .min(58)
      .max(240)
      .optional()
      .describe("Font size in px. Minimum 58 (3% of the height)."),
    weight: z.int().min(300).max(900).optional(),
    align: z.enum(["center", "left"]).optional(),
    font: z.enum(["sans", "mono"]).optional(),
    uppercase: z.boolean().optional(),
  })
  .describe("Caption look; the style brief sets the band and colours.");

const kindField = z
  .enum(["element", "caption", "code"])
  .describe(
    "'element' = a built-in or saved element by name; 'caption' = one script line; 'code' = drawing code (body of function (ctx,t,u,w,h,p,M)).",
  );

const fields = {
  name: z
    .string()
    .min(1)
    .max(80)
    .describe('A short name, e.g. "hero", "name card", "caption: line 3".'),
  z: z
    .int()
    .min(0)
    .max(999)
    .describe(
      "Draw order inside the scene: lower draws first (background 0, captions on top).",
    ),
  start: z
    .number()
    .min(0)
    .max(120)
    .describe("When the layer appears, in scene seconds."),
  end: z
    .number()
    .positive()
    .max(120)
    .nullable()
    .describe(
      "When it disappears, in scene seconds; null = until the scene ends. Never past the scene's end.",
    ),
  box: boxField,
  opacity: z.number().min(0).max(1).describe("0–1."),
  elementRef: z
    .string()
    .max(40)
    .describe(
      'kind "element": the element name (list_elements), e.g. "chip" or a saved "hero".',
    ),
  params: z
    .record(z.string(), z.unknown())
    .describe(
      "kind element/code: parameters passed to the drawing function as p.",
    ),
  text: z
    .string()
    .min(1)
    .max(200)
    .describe('kind "caption": the script line, with at most one *key* word.'),
  style: captionStyleField,
  code: z
    .string()
    .min(1)
    .max(64 * 1024)
    .describe(
      'kind "code": the BODY of function (ctx, t, u, w, h, p, M). Pure: no Math.random, Date or timers — compute from t.',
    ),
  fonts: z
    .array(z.string().max(60))
    .max(4)
    .describe('kind "code": Google Fonts families it uses, e.g. ["Oswald"].'),
  pinTo: z
    .string()
    .max(64)
    .nullable()
    .describe(
      "The layer id this label belongs to (for the words-float check), or null.",
    ),
};

type LayerInput = {
  kind?: "element" | "caption" | "code";
  name?: string;
  z?: number;
  start?: number;
  end?: number | null;
  box?: { x: number; y: number; w: number; h: number };
  opacity?: number;
  elementRef?: string;
  params?: Record<string, unknown>;
  text?: string;
  style?: z.infer<typeof captionStyleField>;
  code?: string;
  fonts?: string[];
  pinTo?: string | null;
};

/** Checks a layer as it will be stored (after merging a patch), against its scene. Returns the row values. */
async function prepare(
  projectId: string,
  sceneDuration: number,
  kind: "element" | "caption" | "code",
  l: LayerInput,
): Promise<Partial<LayerRow>> {
  const start = l.start ?? 0;
  if (start >= sceneDuration)
    throw new StudioError(
      `start ${start}s is at or past the scene's end (${sceneDuration}s). Lengthen the scene with update_scene, or start earlier.`,
    );
  if (l.end != null && l.end <= start)
    throw new StudioError(
      `end (${l.end}s) must be after start (${start}s), or null for "until the scene ends".`,
    );

  if (kind === "element") {
    if (!l.elementRef)
      throw new StudioError(
        'kind "element" needs elementRef — a built-in name or a saved element (list_elements).',
      );
    if (
      !ELEMENTS[l.elementRef] &&
      !(await getProjectElement(projectId, l.elementRef))
    ) {
      throw new StudioError(
        `No element named "${l.elementRef}". Built-in: ${Object.keys(ELEMENTS).join(", ")}. Saved ones come from list_elements; create one with save_element.`,
      );
    }
    return {
      elementRef: l.elementRef,
      params: l.params ?? {},
      text: null,
      style: null,
      code: null,
      codeHash: null,
    };
  }
  if (kind === "caption") {
    if (!l.text)
      throw new StudioError('kind "caption" needs text — one script line.');
    if ((l.text.match(/\*[^*\s][^*]*\*/g) ?? []).length > 1)
      throw new StudioError("Mark at most one *key* word per caption.");
    return {
      text: l.text,
      style: l.style ?? {},
      elementRef: null,
      code: null,
      codeHash: null,
      params: {},
    };
  }
  if (!l.code)
    throw new StudioError(
      'kind "code" needs code — the body of function (ctx, t, u, w, h, p, M).',
    );
  const checked = checkDrawingCode(l.code);
  if (!checked.ok) throw new StudioError(checked.error);
  return {
    code: l.code,
    codeHash: await codeHash(l.code),
    params: l.params ?? {},
    fonts: l.fonts ?? [],
    elementRef: null,
    text: null,
    style: null,
  };
}

/** add_layer, update_layer, delete_layer. A layer belongs to exactly one scene and draws only in it. */
export function registerLayerTools(server: McpServer, userId: string) {
  server.registerTool(
    "add_layer",
    {
      title: "Add a layer to a scene",
      description:
        "Adds one thing to a scene, drawn inside its box from start to end: an element by name (built-in or saved), a caption (one script line), or drawing code. A layer only ever shows in its own scene. Anything that appears twice should be a saved element (save_element) placed by name. Returns the layer id.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        sceneId: sceneIdField,
        kind: kindField,
        name: fields.name,
        z: fields.z.default(10),
        start: fields.start.default(0),
        end: fields.end.default(null),
        box: fields.box,
        opacity: fields.opacity.default(1),
        elementRef: fields.elementRef.optional(),
        params: fields.params.optional(),
        text: fields.text.optional(),
        style: fields.style.optional(),
        code: fields.code.optional(),
        fonts: fields.fonts.optional(),
        pinTo: fields.pinTo.default(null),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "add_layer",
      async (
        a: LayerInput & {
          projectId: string;
          sceneId: string;
          kind: "element" | "caption" | "code";
          name: string;
          box: NonNullable<LayerInput["box"]>;
        },
      ) => {
        const sc = await requireScene(userId, a.projectId, a.sceneId);
        const kindValues = await prepare(
          a.projectId,
          sc.durationSec,
          a.kind,
          a,
        );
        const { id } = await addLayer(userId, a.projectId, {
          sceneId: a.sceneId,
          kind: a.kind,
          name: a.name,
          z: a.z ?? 10,
          start: a.start ?? 0,
          end: a.end ?? null,
          box: a.box,
          opacity: a.opacity ?? 1,
          pinTo: a.pinTo ?? null,
          ...kindValues,
        });
        const note =
          a.end != null && a.end > sc.durationSec
            ? ` Note: end ${a.end}s is past the scene's ${sc.durationSec}s — it's clipped at the scene end.`
            : "";
        return text(
          `Added ${a.kind} layer "${a.name}" (layer id: ${id}) to "${sc.title}".${note} Look at it with render_frames when the scene is built.`,
        );
      },
    ),
  );

  server.registerTool(
    "update_layer",
    {
      title: "Update a layer",
      description:
        "Changes a layer: its timing, box, opacity, z, name, or its content (params/elementRef for elements, text/style for captions, code/fonts for code). Only the fields you pass change; the kind can't change — delete and add instead.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        layerId: layerIdField,
        name: fields.name.optional(),
        z: fields.z.optional(),
        start: fields.start.optional(),
        end: fields.end.optional(),
        box: fields.box.optional(),
        opacity: fields.opacity.optional(),
        elementRef: fields.elementRef.optional(),
        params: fields.params.optional(),
        text: fields.text.optional(),
        style: fields.style.optional(),
        code: fields.code.optional(),
        fonts: fields.fonts.optional(),
        pinTo: fields.pinTo.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safely(
      "update_layer",
      async (a: LayerInput & { projectId: string; layerId: string }) => {
        const { layer: current, sceneDuration } = await requireLayer(
          userId,
          a.projectId,
          a.layerId,
        );
        const patchKeys = (Object.keys(a) as (keyof typeof a)[]).filter(
          (k) => k !== "projectId" && k !== "layerId" && a[k] !== undefined,
        );
        if (patchKeys.length === 0)
          throw new StudioError(
            "Nothing to change: pass at least one field to update.",
          );
        // Validate the layer as it will be after the patch.
        const merged: LayerInput = {
          name: a.name ?? current.name,
          start: a.start ?? current.start,
          end: a.end !== undefined ? a.end : current.end,
          elementRef: a.elementRef ?? current.elementRef ?? undefined,
          params: a.params ?? current.params,
          text: a.text ?? current.text ?? undefined,
          style: (a.style ?? current.style ?? undefined) as LayerInput["style"],
          code: a.code ?? current.code ?? undefined,
          fonts: a.fonts ?? current.fonts,
        };
        const kindValues = await prepare(
          a.projectId,
          sceneDuration,
          current.kind,
          merged,
        );
        await updateLayer(userId, a.projectId, a.layerId, {
          name: merged.name,
          z: a.z ?? current.z,
          start: merged.start,
          end: merged.end ?? null,
          box: a.box ?? current.box,
          opacity: a.opacity ?? current.opacity,
          pinTo: a.pinTo !== undefined ? a.pinTo : current.pinTo,
          ...kindValues,
        });
        return text(
          `Updated layer "${merged.name}" (${a.layerId}): ${patchKeys.join(", ")}.`,
        );
      },
    ),
  );

  server.registerTool(
    "delete_layer",
    {
      title: "Delete a layer",
      description: "Removes one layer from its scene. Can't be undone.",
      inputSchema: z.strictObject({
        projectId: projectIdField,
        layerId: layerIdField,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    safely(
      "delete_layer",
      async ({
        projectId,
        layerId,
      }: {
        projectId: string;
        layerId: string;
      }) => {
        const { layer: current } = await requireLayer(
          userId,
          projectId,
          layerId,
        );
        await deleteLayer(userId, projectId, layerId);
        return text(`Deleted layer "${current.name}".`);
      },
    ),
  );
}
