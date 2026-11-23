import { NextResponse } from "next/server";

import type { ApiErrorBody } from "@/lib/api";
import { CloudinaryError, uploadPoster } from "@/lib/cloudinary";
import { savePoster } from "@/lib/db/queries/projects";
import { getProjectPulse } from "@/lib/db/queries/scenes";
import { getApiUser } from "@/lib/session";

/** A 540×960 JPEG is ~40–150 KB; anything far bigger isn't a poster. */
const MAX_BYTES = 1_500_000;

const error = (message: string, status: number) => NextResponse.json<ApiErrorBody>({ message }, { status });

/**
 * POST /api/projects/:id/poster?version=N[&t=seconds] — body: the JPEG still the studio rendered (in its sandbox)
 * at project version N. Stored on Cloudinary under the user's project folder; saves posterUrl and
 * posterVersion. `t` marks a frame the user picked ("Use this frame as poster"); it is remembered so
 * later automatic re-captures use the same moment. Never bumps the project's version.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/projects/[id]/poster">) {
  const user = await getApiUser();
  if (!user) return error("Sign in to continue.", 401);

  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const version = Number(search.get("version"));
  if (!Number.isInteger(version) || version < 1) return error("Send ?version= (the project version the poster shows).", 400);
  const pickedAt = search.has("t") ? Number(search.get("t")) : undefined;
  if (pickedAt !== undefined && !(Number.isFinite(pickedAt) && pickedAt >= 0 && pickedAt <= 3600)) return error("t must be a time in seconds.", 400);
  if (!request.headers.get("content-type")?.startsWith("image/jpeg")) return error("Send the poster as image/jpeg.", 415);

  // Ownership first, so nothing is uploaded for a project that isn't this user's.
  if (!(await getProjectPulse(user.id, id))) return error("Project not found.", 404);

  const jpeg = new Uint8Array(await request.arrayBuffer());
  if (jpeg.byteLength > MAX_BYTES) return error("The poster is too large.", 413);
  if (jpeg.byteLength < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) return error("That isn't a JPEG.", 400);

  try {
    const posterUrl = await uploadPoster(jpeg, user.id, id);
    const saved = await savePoster(user.id, id, posterUrl, version, pickedAt);
    if (!saved) return error("Project not found.", 404);
    return NextResponse.json({ posterUrl, posterVersion: version, posterTimeSec: saved.posterTimeSec });
  } catch (e) {
    if (e instanceof CloudinaryError) return error(e.message, 502);
    throw e;
  }
}
