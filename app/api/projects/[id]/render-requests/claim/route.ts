import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { claimRenderRequest } from "@/lib/db/queries/renders";
import { getApiUser } from "@/lib/session";

/** POST /api/projects/:id/render-requests/claim — the open editor takes the next render_frames job (or null). */
export async function POST(_request: Request, { params }: RouteContext<"/api/projects/[id]/render-requests/claim">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });
  const { id } = await params;
  const job = await claimRenderRequest(user.id, id);
  return NextResponse.json({ job });
}
