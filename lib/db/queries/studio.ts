import "server-only";

import { and, asc, eq, gt, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { element, layer, project, scene, sound, voiceClip, type VoiceLine } from "@/lib/db/schema";
import { activityLabel } from "@/lib/mcp/activity";
import type { Join } from "@/lib/render/types";

/**
 * Writes Claude Code makes through MCP (and reads it needs). Every function is scoped by the owner's
 * userId — ownership is checked through the project — and every write runs as ONE atomic batch that
 * also bumps project.version (the studio polls it) and recomputes project.durationSec.
 *
 * Errors are thrown as StudioError with a message written for the agent (what to do next).
 */
export class StudioError extends Error {}

/** project.version + 1 and the duration recomputed from its scenes — the tail of every write batch. */
function touchProject(projectId: string) {
  return db
    .update(project)
    .set({
      version: sql`${project.version} + 1`,
      durationSec: sql`(select coalesce(sum(${scene.durationSec}), 0) from ${scene} where ${scene.projectId} = ${projectId})`,
      updatedAt: new Date(),
    })
    .where(eq(project.id, projectId));
}

export async function requireProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!row) throw new StudioError(`Project "${projectId}" not found for this API key. Use the projectId from the handoff prompt (Claude Code tab → Copy for Claude Code).`);
  stampActivity(row.id);
  return row;
}

/**
 * Inside an MCP tool call, record what the agent is doing on this (already ownership-checked)
 * project for the studio's "Agent is working" pill. Fire-and-forget: never slows or fails the tool.
 */
function stampActivity(projectId: string) {
  const label = activityLabel();
  if (!label) return; // not called from an MCP tool (e.g. the studio's own routes)
  void db
    .update(project)
    .set({ agentActivityAt: new Date(), agentActivity: label })
    .where(eq(project.id, projectId))
    .catch((error: unknown) => console.error("[mcp] activity stamp failed", error));
}

export async function requireScene(userId: string, projectId: string, sceneId: string) {
  await requireProject(userId, projectId);
  const [row] = await db
    .select()
    .from(scene)
    .where(and(eq(scene.id, sceneId), eq(scene.projectId, projectId)))
    .limit(1);
  if (!row) throw new StudioError(`Scene "${sceneId}" not found in this project. Call get_project for the scene ids.`);
  return row;
}

export async function requireLayer(userId: string, projectId: string, layerId: string) {
  await requireProject(userId, projectId);
  const [row] = await db
    .select({ layer, sceneProjectId: scene.projectId, sceneDuration: scene.durationSec })
    .from(layer)
    .innerJoin(scene, eq(scene.id, layer.sceneId))
    .where(and(eq(layer.id, layerId), eq(scene.projectId, projectId)))
    .limit(1);
  if (!row) throw new StudioError(`Layer "${layerId}" not found in this project. Call get_project for the layer ids.`);
  return row;
}

export async function listScenes(projectId: string) {
  return db.select().from(scene).where(eq(scene.projectId, projectId)).orderBy(asc(scene.position));
}

// ── Script & storyboard ──────────────────────────────────────────────────────────────────────

export async function saveScript(userId: string, projectId: string, script: string) {
  await requireProject(userId, projectId);
  await db.batch([db.update(project).set({ script }).where(eq(project.id, projectId)), touchProject(projectId)]);
}

export async function saveStoryboard(userId: string, projectId: string, shots: unknown[]) {
  await requireProject(userId, projectId);
  await db.batch([db.update(project).set({ storyboard: shots }).where(eq(project.id, projectId)), touchProject(projectId)]);
}

export async function setSelection(userId: string, projectId: string, sceneId: string | null) {
  if (sceneId) await requireScene(userId, projectId, sceneId);
  else await requireProject(userId, projectId);
  // Selection is UI state: it doesn't change what renders, so no version bump.
  await db.update(project).set({ selectedSceneId: sceneId }).where(and(eq(project.id, projectId), eq(project.userId, userId)));
}

// ── Scenes ───────────────────────────────────────────────────────────────────────────────────

export type SceneInput = { title: string; durationSec: number; join: Join; shotId: string | null };

/** Inserts at `position` (0-based; default = end), shifting later scenes down. */
export async function addScene(userId: string, projectId: string, input: SceneInput, position?: number) {
  await requireProject(userId, projectId);
  const count = (await listScenes(projectId)).length;
  const at = position === undefined ? count : Math.min(Math.max(0, position), count);
  const id = crypto.randomUUID();
  await db.batch([
    db
      .update(scene)
      .set({ position: sql`${scene.position} + 1` })
      .where(and(eq(scene.projectId, projectId), gte(scene.position, at))),
    db.insert(scene).values({ id, projectId, position: at, ...input }),
    touchProject(projectId),
  ]);
  return { id, position: at };
}

export async function updateScene(userId: string, projectId: string, sceneId: string, patch: Partial<SceneInput>) {
  await requireScene(userId, projectId, sceneId);
  await db.batch([db.update(scene).set(patch).where(eq(scene.id, sceneId)), touchProject(projectId)]);
}

export async function deleteScene(userId: string, projectId: string, sceneId: string) {
  const row = await requireScene(userId, projectId, sceneId);
  await db.batch([
    db.delete(scene).where(eq(scene.id, sceneId)), // layers cascade
    db
      .update(scene)
      .set({ position: sql`${scene.position} - 1` })
      .where(and(eq(scene.projectId, projectId), gt(scene.position, row.position))),
    db.update(project).set({ selectedSceneId: null }).where(and(eq(project.id, projectId), eq(project.selectedSceneId, sceneId))),
    touchProject(projectId),
  ]);
}

/** `sceneIds` must list every scene of the project exactly once, in the new order. */
export async function reorderScenes(userId: string, projectId: string, sceneIds: string[]) {
  await requireProject(userId, projectId);
  const current = await listScenes(projectId);
  const known = new Set(current.map((s) => s.id));
  if (sceneIds.length !== current.length || new Set(sceneIds).size !== sceneIds.length || !sceneIds.every((id) => known.has(id))) {
    throw new StudioError(`sceneIds must list all ${current.length} scene ids of the project exactly once. Call get_project for the current ids.`);
  }
  // Two passes keep positions unique at every step: park everything at negative positions, then place.
  await db.batch([
    db
      .update(scene)
      .set({ position: sql`-1 - ${scene.position}` })
      .where(eq(scene.projectId, projectId)),
    ...sceneIds.map((id, position) => db.update(scene).set({ position }).where(eq(scene.id, id))),
    touchProject(projectId),
  ]);
}

// ── Layers ───────────────────────────────────────────────────────────────────────────────────

export type LayerRow = typeof layer.$inferInsert;

export async function addLayer(userId: string, projectId: string, values: Omit<LayerRow, "id">) {
  await requireScene(userId, projectId, values.sceneId);
  const id = crypto.randomUUID();
  await db.batch([db.insert(layer).values({ id, ...values }), touchProject(projectId)]);
  return { id };
}

export async function updateLayer(userId: string, projectId: string, layerId: string, patch: Partial<LayerRow>) {
  await requireLayer(userId, projectId, layerId);
  await db.batch([db.update(layer).set(patch).where(eq(layer.id, layerId)), touchProject(projectId)]);
}

export async function deleteLayer(userId: string, projectId: string, layerId: string) {
  await requireLayer(userId, projectId, layerId);
  await db.batch([db.delete(layer).where(eq(layer.id, layerId)), touchProject(projectId)]);
}

// ── Saved elements ───────────────────────────────────────────────────────────────────────────

export async function listProjectElements(projectId: string) {
  return db.select().from(element).where(eq(element.projectId, projectId)).orderBy(asc(element.name));
}

export async function getProjectElement(projectId: string, name: string) {
  const [row] = await db
    .select()
    .from(element)
    .where(and(eq(element.projectId, projectId), eq(element.name, name)))
    .limit(1);
  return row ?? null;
}

/** Insert or replace by name. Layers that reference the name pick up the new code. */
export async function saveElement(
  userId: string,
  projectId: string,
  values: { name: string; role: typeof element.$inferInsert.role; description: string; code: string; codeHash: string; defaultParams: Record<string, unknown> },
) {
  await requireProject(userId, projectId);
  const existing = await getProjectElement(projectId, values.name);
  await db.batch([
    db
      .insert(element)
      .values({ projectId, ...values })
      .onConflictDoUpdate({
        target: [element.projectId, element.name],
        set: { role: values.role, description: values.description, code: values.code, codeHash: values.codeHash, defaultParams: values.defaultParams, updatedAt: new Date() },
      }),
    touchProject(projectId),
  ]);
  return { created: !existing };
}

// ── Voiceovers ───────────────────────────────────────────────────────────────────────────────

export async function listVoiceClips(projectId: string) {
  return db.select().from(voiceClip).where(eq(voiceClip.projectId, projectId));
}

/**
 * Saves (or replaces) a scene's voiceover and sets the scene's length from it: the end of its last
 * line plus a tail (the breath before the next scene). One atomic batch, then the version bump.
 */
export async function saveVoiceClip(
  userId: string,
  projectId: string,
  sceneId: string,
  values: { publicId: string; url: string; durationSec: number; voiceName: string; lines: VoiceLine[] },
  sceneDurationSec: number,
) {
  await requireScene(userId, projectId, sceneId);
  await db.batch([
    db
      .insert(voiceClip)
      .values({ projectId, sceneId, ...values })
      .onConflictDoUpdate({
        target: voiceClip.sceneId,
        set: { publicId: values.publicId, url: values.url, durationSec: values.durationSec, voiceName: values.voiceName, lines: values.lines, updatedAt: new Date() },
      }),
    db.update(scene).set({ durationSec: sceneDurationSec }).where(eq(scene.id, sceneId)),
    touchProject(projectId),
  ]);
}

// ── Story sounds & music ─────────────────────────────────────────────────────────────────────

export type SoundRow = typeof sound.$inferSelect;
export type SoundValues = Omit<typeof sound.$inferInsert, "id" | "projectId" | "createdAt" | "updatedAt">;

export async function listSounds(projectId: string) {
  return db.select().from(sound).where(eq(sound.projectId, projectId));
}

export async function requireSound(userId: string, projectId: string, soundId: string) {
  await requireProject(userId, projectId);
  const [row] = await db
    .select()
    .from(sound)
    .where(and(eq(sound.id, soundId), eq(sound.projectId, projectId)))
    .limit(1);
  if (!row) throw new StudioError(`Sound "${soundId}" not found in this project. Call get_project for the sound ids.`);
  return row;
}

export async function addSound(userId: string, projectId: string, values: SoundValues) {
  await requireProject(userId, projectId);
  const id = crypto.randomUUID();
  await db.batch([db.insert(sound).values({ id, projectId, ...values }), touchProject(projectId)]);
  return { id };
}

export async function updateSound(userId: string, projectId: string, soundId: string, patch: Partial<SoundValues>) {
  await requireSound(userId, projectId, soundId);
  await db.batch([db.update(sound).set(patch).where(eq(sound.id, soundId)), touchProject(projectId)]);
}

export async function removeSound(userId: string, projectId: string, soundId: string) {
  await requireSound(userId, projectId, soundId);
  await db.batch([db.delete(sound).where(eq(sound.id, soundId)), touchProject(projectId)]);
}
