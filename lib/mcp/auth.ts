import "server-only";

import { auth, MCP_API_KEY_HEADER } from "@/lib/auth";

export type McpCaller = { userId: string; keyId: string };
export type McpAuthResult =
  | { ok: true; caller: McpCaller }
  | { ok: false; status: 401 | 429; message: string };

/**
 * Claude Code sends the user's MotionStudio API key on every MCP request:
 *   claude mcp add --transport http motionstudio <APP_URL>/api/mcp --header "x-api-key: ms_…"
 * Better Auth verifies it (hashed lookup, expiry, per-key rate limit) and tells us whose it is.
 */
export async function authenticateMcpRequest(
  request: Request,
): Promise<McpAuthResult> {
  const key =
    request.headers.get(MCP_API_KEY_HEADER)?.trim() || bearerToken(request);
  if (!key) {
    return {
      ok: false,
      status: 401,
      message: `Missing API key. Send it in the "${MCP_API_KEY_HEADER}" header — copy the full command from MotionStudio → your project → Claude Code tab.`,
    };
  }

  const result = await auth.api
    .verifyApiKey({ body: { key } })
    .catch(() => null);
  if (!result?.valid || !result.key) {
    const code = result?.error?.code ?? "";
    if (/RATE_LIMIT/i.test(String(code))) {
      return {
        ok: false, 
        status: 429,
        message:
          "Too many requests for this API key. Wait a minute, then continue.",
      };
    }
    return {
      ok: false,
      status: 401,
      message:
        "Invalid or revoked API key. Get a new one in MotionStudio → your project → Claude Code tab, then run the claude mcp add command again.",
    };
  }
  return {
    ok: true,
    caller: { 
      userId: result.key.referenceId,
       keyId: result.key.id },
  };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
