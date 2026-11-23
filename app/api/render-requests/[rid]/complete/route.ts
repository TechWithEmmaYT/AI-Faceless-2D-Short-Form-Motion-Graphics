import { NextResponse } from "next/server";
import * as z from "zod/v4";

import type { ApiErrorBody } from "@/lib/api";
import { completeRenderRequest } from "@/lib/db/queries/renders";
import { getApiUser } from "@/lib/session";

const checkSchema = z.object({
  check: z.string().max(60),
  scene: z.string().max(200).optional(),
  layer: z.string().max(200).optional(),
  at: z.number().optional(),
  message: z.string().max(600),
});

const bodySchema = z.union([
  z.strictObject({
    result: z.strictObject({
      frames: z.array(z.strictObject({ label: z.string().max(300), data: z.string().max(2_000_000) })).min(1).max(8),
      checks: z.array(checkSchema).max(200),
      notes: z.array(z.string().max(600)).max(50),
    }),
  }),
  z.strictObject({ error: z.string().min(1).max(1000) }),
]);

/** POST /api/render-requests/:rid/complete — the editor returns rendered frames (or an error) to render_frames. */
export async function POST(request: Request, { params }: RouteContext<"/api/render-requests/[rid]/complete">) {
  const user = await getApiUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<ApiErrorBody>({ message: "Invalid render result." }, { status: 400 });

  const { rid } = await params;
  const ok = await completeRenderRequest(user.id, rid, parsed.data);
  if (!ok) return NextResponse.json<ApiErrorBody>({ message: "Render request not found or not claimed." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
