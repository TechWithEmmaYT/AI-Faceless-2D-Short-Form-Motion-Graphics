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
 * POST /api/projects/:id/poster?version=N — body: the JPEG still the studio rendered (in its sandbox)
 * at project version N. Stored on Cloudinary under the user's project folder; saves posterUrl and
 * posterVersion. Never bumps the project's version.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/projects/[id]/poster">) {
  const user = await getApiUser();
  if (!user) return error("Sign in to continue.", 401);

  const { id } = await params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  if (!Number.isInteger(version) || version < 1) return error("Send ?version= (the project version the poster shows).", 400);
  if (request.headers.get("content-type") !== "image/jpeg") return error("Send the poster as image/jpeg.", 415);

  // Ownership first, so nothing is uploaded for a project that isn't this user's.
  if (!(await getProjectPulse(user.id, id))) return error("Project not found.", 404);

  const jpeg = new Uint8Array(await request.arrayBuffer());
  if (jpeg.byteLength > MAX_BYTES) return error("The poster is too large.", 413);
  if (jpeg.byteLength < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) return error("That isn't a JPEG.", 400);

  try {
    const posterUrl = await uploadPoster(jpeg, user.id, id);
    await savePoster(user.id, id, posterUrl, version);
    return NextResponse.json({ posterUrl, posterVersion: version });
  } catch (e) {
    if (e instanceof CloudinaryError) return error(e.message, 502);
    throw e;
  }
}
