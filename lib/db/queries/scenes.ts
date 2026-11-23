import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { element, layer, project, scene, sound, voiceClip } from "@/lib/db/schema";
import { demoScenes } from "@/lib/render/seed";
import type { CaptionStyle, Layer, Scene } from "@/lib/render/types";

import { getProject } from "./projects";

/** DB rows → the scene contract (lib/render/types.ts). */
function toLayer(row: typeof layer.$inferSelect): Layer {
  const base = { id: row.id, z: row.z, name: row.name, start: row.start, end: row.end, box: row.box, opacity: row.opacity };
  if (row.kind === "code") return { ...base, kind: "code", code: row.code ?? "", params: row.params, fonts: row.fonts };
  if (row.kind === "caption") return { ...base, kind: "caption", text: row.text ?? "", style: (row.style ?? {}) as CaptionStyle };
  return { ...base, kind: "element", elementRef: row.elementRef ?? "", params: row.params };
}

/** Everything the editor needs to show and play a project. Scoped to the owner. */
export async function getProjectState(userId: string, projectId: string) {
  const detail = await getProject(userId, projectId);
  if (!detail) return null;

  const sceneRows = await db.select().from(scene).where(eq(scene.projectId, projectId)).orderBy(asc(scene.position));
  const layerRows = sceneRows.length
    ? await db
        .select()
        .from(layer)
        .where(inArray(layer.sceneId, sceneRows.map((s) => s.id)))
        .orderBy(asc(layer.z))
    : [];

  const scenes: Scene[] = sceneRows.map((s) => ({
    id: s.id,
    position: s.position,
    shotId: s.shotId,
    title: s.title,
    durationSec: s.durationSec,
    join: s.join,
    // Each scene gets only the layers that belong to it.
    layers: layerRows.filter((l) => l.sceneId === s.id).map(toLayer),
  }));

  // Saved elements travel with the state so the sandboxed renderer can draw them by name.
  const elements = (await db.select().from(element).where(eq(element.projectId, projectId))).map((e) => ({
    name: e.name,
    role: e.role,
    code: e.code,
    codeHash: e.codeHash,
    defaultParams: e.defaultParams,
  }));

  // One voiceover per scene (the Voice tab, the preview's audio, and get_project).
  const voiceClips = (await db.select().from(voiceClip).where(eq(voiceClip.projectId, projectId))).map((v) => ({
    id: v.id,
    sceneId: v.sceneId,
    publicId: v.publicId,
    url: v.url,
    durationSec: v.durationSec,
    voiceName: v.voiceName,
    lines: v.lines,
    updatedAt: v.updatedAt.toISOString(),
  }));

  // Story sounds and the music bed (the Voice tab, the preview's audio, and get_project).
  const sounds = (await db.select().from(sound).where(eq(sound.projectId, projectId))).map((x) => ({
    id: x.id,
    kind: x.kind,
    sceneId: x.sceneId,
    name: x.name,
    atSec: x.atSec,
    url: x.url,
    durationSec: x.durationSec,
    volume: x.volume,
    trimStart: x.trimStart,
    trimEnd: x.trimEnd,
    fadeIn: x.fadeIn,
    fadeOut: x.fadeOut,
    source: x.source,
  }));

  return { project: detail, scenes, elements, voiceClips, sounds };
}

/**
 * The project's render version plus the agent's latest activity (cheap): lets the studio's live sync
 * skip unchanged state while still showing "Agent is working" (activity doesn't bump the version).
 */
export async function getProjectPulse(userId: string, projectId: string) {
  const [row] = await db
    .select({ version: project.version, agentActivity: project.agentActivity, agentActivityAt: project.agentActivityAt })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { version: row.version, agentActivity: row.agentActivity, agentActivityAt: row.agentActivityAt?.toISOString() ?? null };
}

/**
 * Development helper: fills a project that has no scenes with the demo video (lib/render/seed.ts).
 * One atomic batch: scenes, layers, then the project's duration and version.
 */
export async function seedDemoScenes(userId: string, projectId: string): Promise<"ok" | "not-found" | "has-scenes"> {
  const detail = await getProject(userId, projectId);
  if (!detail) return "not-found";
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(scene).where(eq(scene.projectId, projectId));
  if (count > 0) return "has-scenes";

  const demo = demoScenes();
  const sceneValues = demo.map((s, position) => ({
    id: crypto.randomUUID(),
    projectId,
    position,
    shotId: s.shotId,
    title: s.title,
    durationSec: s.durationSec,
    join: s.join,
  }));
  const layerValues = demo.flatMap((s, i) =>
    s.layers.map((l) => ({
      sceneId: sceneValues[i]!.id,
      kind: l.kind,
      name: l.name,
      z: l.z,
      start: l.start,
      end: l.end,
      box: l.box,
      opacity: l.opacity,
      elementRef: l.kind === "element" ? l.elementRef : null,
      params: l.kind === "caption" ? {} : l.params,
      text: l.kind === "caption" ? l.text : null,
      style: l.kind === "caption" ? l.style : null,
      code: l.kind === "code" ? l.code : null,
    })),
  );
  const duration = demo.reduce((sum, s) => sum + s.durationSec, 0);

  const insertScenes = db.insert(scene).values(sceneValues);
  const updateProject = db
    .update(project)
    .set({ durationSec: duration, version: sql`${project.version} + 1` })
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));
  if (layerValues.length) await db.batch([insertScenes, db.insert(layer).values(layerValues), updateProject]);
  else await db.batch([insertScenes, updateProject]);
  return "ok";
}
