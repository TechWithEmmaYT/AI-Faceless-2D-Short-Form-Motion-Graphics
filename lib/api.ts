import { authClient } from "@/lib/auth-client";
import type { InputMode, MotionStyle, TargetSeconds } from "@/lib/db/app-schema";
import type { RenderRequestResult, RenderRequestSpec, VoiceLine } from "@/lib/db/app-schema";
import type { Scene } from "@/lib/render/types";
import type { CreateProjectField, CreateProjectInput } from "@/lib/validation/project";

/**
 * Every client-side call to MotionStudio's own API lives here, as plain functions that TanStack
 * Query uses directly (`queryFn`, `mutationFn`). They go through Better Auth's fetch
 * (`authClient.$fetch`), so the session cookie travels with every request.
 *
 * Errors throw an ApiError, so `query.error` / `mutation.error` carry the status and any field errors.
 */

// ── Types: the JSON the /api routes return ────────────────────────────────────────────────────

export type ProjectSummary = {
  id: string;
  title: string;
  motionStyle: MotionStyle;
  targetSeconds: TargetSeconds;
  durationSec: number;
  posterUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  inputMode: InputMode;
  brief: string;
  script: string | null;
  storyboard: unknown;
  version: number;
  /** The version the poster was captured at (null = none yet); the studio refreshes it when it lags. */
  posterVersion: number | null;
  /** The frame the user picked for the poster (video seconds); null = the default, 1 s in. */
  posterTimeSec: number | null;
  /** What Claude Code last did through MCP, and when (ISO) — the "Agent is working" pill. */
  agentActivity: string | null;
  agentActivityAt: string | null;
};

export type ApiErrorBody = {
  message: string;
  errors?: Partial<Record<CreateProjectField, string>>;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: ApiErrorBody["errors"] = undefined,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Query keys: one place, so invalidation can't drift ──────────────────────────────────────

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, "detail", id] as const,
  state: (id: string) => [...projectKeys.all, "state", id] as const,
};

// ── Transport ─────────────────────────────────────────────────────────────────────────────────

/** Absolute, because Better Auth's fetch would otherwise resolve relative paths under /api/auth. */
function apiUrl(path: string) {
  const origin = typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL ?? "" : window.location.origin;
  return `${origin}/api${path}`;
}

async function request<T>(path: string, init?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }): Promise<T> {
  const { data, error } = await authClient.$fetch<T>(apiUrl(path), {
    method: init?.method ?? "GET",
    body: init?.body as Record<string, unknown> | undefined,
  });
  if (error) {
    const body = error as unknown as Partial<ApiErrorBody> & { status: number; statusText?: string };
    throw new ApiError(body.status, body.message || body.statusText || "Request failed", body.errors);
  }
  return data as T;
}

// ── Projects ──────────────────────────────────────────────────────────────────────────────────

export const getProjectsQueryFn = () => request<{ projects: ProjectSummary[] }>("/projects").then((r) => r.projects);

export const getProjectQueryFn = (id: string) => request<{ project: ProjectDetail }>(`/projects/${encodeURIComponent(id)}`).then((r) => r.project);

export const createProjectMutationFn = (input: CreateProjectInput) =>
  request<{ project: { id: string } }>("/projects", { method: "POST", body: input }).then((r) => r.project);

// ── Editor ────────────────────────────────────────────────────────────────────────────────────

/** The project with its scenes and layers, in the scene contract's shape (lib/render/types.ts). */
export type SavedElementData = {
  name: string;
  role: string;
  code: string;
  codeHash: string;
  defaultParams: Record<string, unknown>;
};

/** A scene's voiceover (one file per scene, hosted on Cloudinary) and its line times. */
export type VoiceClipData = {
  id: string;
  sceneId: string;
  publicId: string;
  url: string;
  durationSec: number;
  voiceName: string;
  lines: VoiceLine[];
  updatedAt: string;
};

/** A story sound (sfx, in one scene, at scene seconds) or the music bed (across the video, at video seconds). */
export type SoundData = {
  id: string;
  kind: "sfx" | "music";
  sceneId: string | null;
  name: string;
  atSec: number;
  url: string;
  durationSec: number;
  volume: number;
  trimStart: number;
  trimEnd: number | null;
  fadeIn: number;
  fadeOut: number;
  source: string;
};

export type ProjectState = {
  project: ProjectDetail;
  scenes: Scene[];
  elements: SavedElementData[];
  voiceClips: VoiceClipData[];
  sounds: SoundData[];
};

export const getProjectStateQueryFn = (id: string) => request<ProjectState>(`/projects/${encodeURIComponent(id)}/state`);

export type ProjectPulse = { unchanged: true; version: number; agentActivity: string | null; agentActivityAt: string | null };

/** Live sync: the full state when the project's version moved past `since`, otherwise just its pulse. */
export const getProjectStateSinceFn = (id: string, since: number) =>
  request<ProjectState | ProjectPulse>(`/projects/${encodeURIComponent(id)}/state?since=${since}`);

// ── render_frames relay ────────────────────────────────────────────────────────────────────────

export type RenderJob = { id: string; request: RenderRequestSpec };

/** The open editor claims the next render request for this project (null when there's none). */
export const claimRenderJobFn = (projectId: string) =>
  request<{ job: RenderJob | null }>(`/projects/${encodeURIComponent(projectId)}/render-requests/claim`, { method: "POST" }).then((r) => r.job);

/** Hands the frames (or the reason it couldn't render) back to the waiting render_frames call. */
export const completeRenderJobFn = ({ jobId, outcome }: { jobId: string; outcome: { result: RenderRequestResult } | { error: string } }) =>
  request<{ ok: true }>(`/render-requests/${encodeURIComponent(jobId)}/complete`, { method: "POST", body: outcome });

/** Stores the poster (a JPEG still from the sandbox) captured at project `version`. */
export async function savePosterMutationFn({ projectId, version, jpeg, pickedAt }: { projectId: string; version: number; jpeg: Blob; pickedAt?: number }) {
  // pickedAt: the user chose this frame ("Use this frame as poster") — remembered for later re-captures.
  const query = `version=${version}${pickedAt === undefined ? "" : `&t=${pickedAt.toFixed(3)}`}`;
  const { data, error } = await authClient.$fetch<{ posterUrl: string; posterVersion: number; posterTimeSec: number | null }>(
    apiUrl(`/projects/${encodeURIComponent(projectId)}/poster?${query}`),
    { method: "POST", body: jpeg, headers: { "content-type": "image/jpeg" } },
  );
  if (error) {
    const body = error as unknown as Partial<ApiErrorBody> & { status: number; statusText?: string };
    throw new ApiError(body.status, body.message || body.statusText || "Couldn't save the poster");
  }
  return data!;
}

/** Deletes a scene and all its layers (the user confirms first). */
export const deleteSceneMutationFn = ({ projectId, sceneId }: { projectId: string; sceneId: string }) =>
  request<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`, { method: "DELETE" });

export const setSelectionMutationFn = ({ projectId, sceneId }: { projectId: string; sceneId: string | null }) =>
  request<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}/selection`, { method: "PUT", body: { sceneId } });

// ── API key (Claude Code ↔ MCP) ─────────────────────────────────────────────────────────────────

/** The user's MotionStudio API key, without the secret. */
export type ApiKeyInfo = { id: string; start: string; createdAt: string; lastRequest: string | null };

export const apiKeyKeys = { current: ["api-key"] as const };

export const getApiKeyQueryFn = () => request<{ key: ApiKeyInfo | null }>("/keys").then((r) => r.key);

/** Creates a key (replacing any old one). `secret` is the full key — shown to the user once. */
export const createApiKeyMutationFn = () => request<{ key: ApiKeyInfo; secret: string }>("/keys", { method: "POST" });

export const revokeApiKeyMutationFn = () => request<{ ok: true }>("/keys", { method: "DELETE" });

/** Development only: load the demo video into an empty project. */
export const seedDemoScenesMutationFn = (id: string) =>
  request<{ ok: true }>(`/projects/${encodeURIComponent(id)}/seed`, { method: "POST" });
