import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { StudioError, deleteScene } from "@/lib/db/queries/studio";
import { getApiUser } from "@/lib/session";

/** DELETE /api/projects/:id/scenes/:sceneId — the user deletes a scene and its layers (after confirming). */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/projects/[id]/scenes/[sceneId]">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });
  const { id, sceneId } = await params;
  try {
    await deleteScene(user.id, id, sceneId);
  } catch (error) {
    if (error instanceof StudioError) return NextResponse.json<ApiErrorBody>({ message: "Scene not found." }, { status: 404 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
