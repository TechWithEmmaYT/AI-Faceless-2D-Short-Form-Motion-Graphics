import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { getProjectPulse, getProjectState } from "@/lib/db/queries/scenes";
import { getApiUser } from "@/lib/session";

/**
 * GET /api/projects/:id/state — the project plus its scenes, layers and saved elements.
 * Live sync: with ?since=<version>, answers { unchanged, version, agentActivity, agentActivityAt }
 * when nothing that renders has changed, so the open editor can poll every second cheaply and still
 * show what the agent is doing.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/projects/[id]/state">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

  const { id } = await params;
  const since = Number(new URL(request.url).searchParams.get("since"));
  if (Number.isFinite(since) && since > 0) {
    const pulse = await getProjectPulse(user.id, id);
    if (!pulse) return NextResponse.json<ApiErrorBody>({ message: "Project not found." }, { status: 404 });
    if (pulse.version === since) return NextResponse.json({ unchanged: true, ...pulse });
  }

  const state = await getProjectState(user.id, id);
  if (!state) return NextResponse.json<ApiErrorBody>({ message: "Project not found." }, { status: 404 });
  return NextResponse.json(state);
}
