import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { getProject } from "@/lib/db/queries/projects";
import { getApiUser } from "@/lib/session";

/** GET /api/projects/:id — one project, only if the signed-in user owns it (404 otherwise, never 403). */
export async function GET(_request: Request, { params }: RouteContext<"/api/projects/[id]">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json<ApiErrorBody>({ message: "Project not found." }, { status: 404 });

  return NextResponse.json({ project });
}
