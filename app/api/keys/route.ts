import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { ApiErrorBody, ApiKeyInfo } from "@/lib/api";
import { auth } from "@/lib/auth";
import { getApiUser } from "@/lib/session";

/**
 * The signed-in user's MotionStudio API key — the one Claude Code sends to /api/mcp.
 * One key per user: POST replaces it (the old one stops working), DELETE revokes it.
 * The full key is returned ONLY by POST, once; Better Auth stores it hashed.
 */

const unauthorized = () =>
  NextResponse.json<ApiErrorBody>(
    { message: "Sign in to continue." },
    { status: 401 },
  );

type StoredKey = {
  id: string;
  start?: string | null;
  prefix?: string | null;
  createdAt: Date | string;
  lastRequest?: Date | string | null;
};

function toInfo(key: StoredKey): ApiKeyInfo {
  const iso = (d: Date | string | null | undefined) =>
    d ? new Date(d).toISOString() : null;
  return {
    id: key.id,
    start: key.start ?? key.prefix ?? "ms_",
    createdAt: iso(key.createdAt)!,
    lastRequest: iso(key.lastRequest),
  };
}

async function listKeys(): Promise<StoredKey[]> {
  const result = (await auth.api.listApiKeys({
    headers: await headers(),
  })) as unknown as { apiKeys?: StoredKey[] } | StoredKey[];
  return Array.isArray(result) ? result : (result.apiKeys ?? []);
}

/** GET /api/keys — the current key's metadata (never the key itself), or null. */
export async function GET() {
  if (!(await getApiUser())) return unauthorized();
  const [current] = await listKeys();
  return NextResponse.json({ key: current ? toInfo(current) : null });
}

/** POST /api/keys — create a key, replacing any existing one. Returns the full key once. */
export async function POST() {
  if (!(await getApiUser())) return unauthorized();
  const requestHeaders = await headers();
  for (const key of await listKeys()) {
    await auth.api.deleteApiKey({
      body: { keyId: key.id },
      headers: requestHeaders,
    });
  }
  const created = (await auth.api.createApiKey({
    body: { name: "Claude Code" },
    headers: requestHeaders,
  })) as unknown as StoredKey & { key: string };
  return NextResponse.json(
    { key: toInfo(created), secret: created.key },
    { status: 201 },
  );
}

/** DELETE /api/keys — revoke the key; Claude Code loses access until a new one is created. */
export async function DELETE() {
  if (!(await getApiUser())) return unauthorized();
  const requestHeaders = await headers();
  for (const key of await listKeys()) {
    await auth.api.deleteApiKey({
      body: { keyId: key.id },
      headers: requestHeaders,
    });
  }
  return NextResponse.json({ ok: true });
}
