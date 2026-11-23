import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { seedDemoScenes } from "@/lib/db/queries/scenes";
import { getApiUser } from "@/lib/session";

/**
 * POST /api/projects/:id/seed — DEVELOPMENT ONLY. Loads the demo video (lib/render/seed.ts) into an
 * empty project so the renderer and player can be seen working before Claude Code builds scenes.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/projects/[id]/seed">) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json<ApiErrorBody>({ message: "Not available." }, { status: 404 });
  }
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

  const { id } = await params;
  const result = await seedDemoScenes(user.id, id);
  if (result === "not-found") return NextResponse.json<ApiErrorBody>({ message: "Project not found." }, { status: 404 });
  if (result === "has-scenes") return NextResponse.json<ApiErrorBody>({ message: "This project already has scenes." }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
