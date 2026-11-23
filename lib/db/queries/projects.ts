import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import type { ProjectDetail, ProjectSummary } from "@/lib/api";
import { db } from "@/lib/db";
import { project, type Project } from "@/lib/db/schema";
import type { CreateProjectInput } from "@/lib/validation/project";

/**
 * Project data access. Every function takes the owner's userId and scopes by it — callers get the
 * id from the session (or, later, the API key), never from the request body or URL.
 */

const summaryColumns = {
  id: project.id,
  title: project.title,
  motionStyle: project.motionStyle,
  targetSeconds: project.targetSeconds,
  durationSec: project.durationSec,
  posterUrl: project.posterUrl,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};

function toSummary(row: Pick<Project, keyof typeof summaryColumns>): ProjectSummary {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await db.select(summaryColumns).from(project).where(eq(project.userId, userId)).orderBy(desc(project.updatedAt));
  return rows.map(toSummary);
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDetail | null> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    ...toSummary(row),
    inputMode: row.inputMode,
    brief: row.brief,
    script: row.script,
    storyboard: row.storyboard,
    version: row.version,
    posterVersion: row.posterVersion,
    agentActivity: row.agentActivity,
    agentActivityAt: row.agentActivityAt?.toISOString() ?? null,
  };
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const [row] = await db.insert(project).values({ userId, ...input }).returning({ id: project.id });
  return row!;
}

/**
 * Saves the poster the studio captured at `version`. Not a content change: the version and the
 * project's place in Recents (updatedAt) stay as they are. Returns false if the project isn't the user's.
 */
export async function savePoster(userId: string, projectId: string, posterUrl: string, version: number) {
  const rows = await db
    .update(project)
    .set({ posterUrl, posterVersion: version, updatedAt: sql`${project.updatedAt}` })
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .returning({ id: project.id });
  return rows.length > 0;
}
