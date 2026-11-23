import {
  createMcpHandler,
  originValidationResponse,
} from "@modelcontextprotocol/server";

import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { createMotionStudioServer } from "@/lib/mcp/server";

/**
 * POST/GET/DELETE /api/mcp — MotionStudio's MCP server (Streamable HTTP, stateless JSON).
 * Claude Code connects with:
 *   claude mcp add --transport http motionstudio <APP_URL>/api/mcp --header "x-api-key: ms_…"
 * Thin on purpose: auth here, everything else in lib/mcp.
 */
export const maxDuration = 60;

const handler = createMcpHandler(
  ({ authInfo }) => {
    const userId = authInfo?.extra?.userId;
    if (typeof userId !== "string")
      throw new Error(
        "MCP request reached the server without a verified user.",
      );
    return createMotionStudioServer(userId);
  },
  {
    responseMode: "json",
    onerror: (error) => console.error("[mcp]", error.message),
  },
);

/** Browsers send an Origin; only our own app may call from a page. Claude Code sends none and passes. */
function allowedOrigins(): string[] {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  for (const url of [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    try {
      if (url) hosts.add(new URL(url).hostname);
    } catch {
      // ignore malformed env
    }
  }
  return [...hosts];
}

async function serve(request: Request): Promise<Response> {
  const rejected = originValidationResponse(request, allowedOrigins());
  if (rejected) return rejected;

  const result = await authenticateMcpRequest(request);
  if (!result.ok) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: result.message },
        id: null,
      },
      {
        status: result.status,
        headers:
          result.status === 401
            ? { "WWW-Authenticate": 'ApiKey header="x-api-key"' }
            : undefined,
      },
    );
  }

  return handler.fetch(request, {
    authInfo: {
      token: "redacted", // never pass the raw key further than auth
      clientId: result.caller.keyId,
      scopes: ["studio"],
      extra: { userId: result.caller.userId },
    },
  });
}

export { serve as GET, serve as POST, serve as DELETE };
