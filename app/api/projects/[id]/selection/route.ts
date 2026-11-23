import { NextResponse } from "next/server";
import * as z from "zod/v4";

import type { ApiErrorBody } from "@/lib/api";
import { StudioError, setSelection } from "@/lib/db/queries/studio";
import { getApiUser } from "@/lib/session";

const bodySchema = z.strictObject({ sceneId: z.string().min(1).max(64).nullable() });

/** PUT /api/projects/:id/selection — the scene the user has open, so get_selection can resolve "this". */
export async function PUT(request: Request, { params }: RouteContext<"/api/projects/[id]/selection">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ message: "Send { sceneId: string | null }." }, { status: 400 });

  const { id } = await params;
  try {
    await setSelection(user.id, id, parsed.data.sceneId);
  } catch (error) {
    if (error instanceof StudioError) return NextResponse.json<ApiErrorBody>({ message: "Project or scene not found." }, { status: 404 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
