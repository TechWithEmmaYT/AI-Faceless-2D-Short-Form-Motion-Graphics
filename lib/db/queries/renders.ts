import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { project, renderRequest, type RenderRequestResult, type RenderRequestSpec } from "@/lib/db/schema";

/**
 * render_frames relay (plan, Phase 6). The MCP tool creates a request and waits on it; the user's
 * open editor claims it, renders, and completes it. Ownership always goes through project.userId.
 */

/** Requests older than this are dead (no editor answered, or a tab closed mid-render). */
const STALE_MS = 2 * 60 * 1000;

export async function createRenderRequest(projectId: string, spec: RenderRequestSpec) {
  // Sweep this project's stale requests first so they can never be claimed late.
  await db.delete(renderRequest).where(and(eq(renderRequest.projectId, projectId), lt(renderRequest.createdAt, new Date(Date.now() - STALE_MS))));
  const [row] = await db.insert(renderRequest).values({ projectId, request: spec }).returning({ id: renderRequest.id });
  return row!.id;
}

export async function getRenderRequest(id: string) {
  const [row] = await db.select().from(renderRequest).where(eq(renderRequest.id, id)).limit(1);
  return row ?? null;
}

export async function deleteRenderRequest(id: string) {
  await db.delete(renderRequest).where(eq(renderRequest.id, id));
}

/**
 * The open editor asks "anything for me?": atomically claims this project's oldest pending request
 * (one statement, so two open tabs can never both take it). Null when there's nothing to do.
 */
export async function claimRenderRequest(userId: string, projectId: string) {
  const { rows } = await db.execute<{ id: string; request: RenderRequestSpec }>(sql`
    update ${renderRequest}
       set status = 'claimed', claimed_at = now()
     where id = (
       select r.id from ${renderRequest} r
         join ${project} p on p.id = r.project_id
        where r.project_id = ${projectId}
          and p.user_id = ${userId}
          and r.status = 'pending'
          and r.created_at > now() - interval '2 minutes'
        order by r.created_at
        limit 1
     )
    returning id, request`);
  return rows[0] ?? null;
}

/** The editor hands back the frames (or why it couldn't render). Only a claimed request of the user's own project. */
export async function completeRenderRequest(userId: string, id: string, outcome: { result: RenderRequestResult } | { error: string }) {
  const owned = await db
    .select({ id: renderRequest.id })
    .from(renderRequest)
    .innerJoin(project, eq(project.id, renderRequest.projectId))
    .where(and(eq(renderRequest.id, id), eq(project.userId, userId), eq(renderRequest.status, "claimed")))
    .limit(1);
  if (!owned.length) return false;
  await db
    .update(renderRequest)
    .set("result" in outcome ? { status: "done", result: outcome.result } : { status: "failed", error: outcome.error.slice(0, 1000) })
    .where(eq(renderRequest.id, id));
  return true;
}
