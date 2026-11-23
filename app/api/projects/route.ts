import { NextResponse } from "next/server";
import { z } from "zod";

import type { ApiErrorBody } from "@/lib/api";
import { createProject, listProjects } from "@/lib/db/queries/projects";
import { getApiUser } from "@/lib/session";
import { createProjectSchema } from "@/lib/validation/project";

const unauthorized = () => NextResponse.json<ApiErrorBody>({ message: "Sign in to continue." }, { status: 401 });

/** GET /api/projects — the signed-in user's projects, most recently updated first. */
export async function GET() {
  const user = await getApiUser();
  if (!user) return unauthorized();

  return NextResponse.json({ projects: await listProjects(user.id) });
}

/** POST /api/projects — create a project from the Create Project form. */
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const json = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return NextResponse.json<ApiErrorBody>(
      {
        message: "Check the highlighted fields.",
        errors: Object.fromEntries(Object.entries(fieldErrors).map(([field, messages]) => [field, messages?.[0]])),
      },
      { status: 400 },
    );
  }

  try {
    const created = await createProject(user.id, parsed.data);
    return NextResponse.json({ project: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects failed", error);
    return NextResponse.json<ApiErrorBody>({ message: "Couldn't create the project. Try again." }, { status: 500 });
  }
}
