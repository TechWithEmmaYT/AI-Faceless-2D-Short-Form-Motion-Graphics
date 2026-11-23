import "server-only";

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.");
}

/** Failures where the connection was never made: the request can't have reached the database. */
const NEVER_SENT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ENETUNREACH", "EHOSTUNREACH"]);
function neverSent(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; cause?: { code?: string } } })?.cause;
  const code = cause?.code ?? cause?.cause?.code;
  return !!code && NEVER_SENT.has(code);
}

/**
 * Network blips between the app and Neon surface as `fetch failed` before any response.
 * - Reads (every statement a SELECT) are safe to repeat: retried twice with a short backoff.
 * - Writes are retried only when the connection was never established (nothing reached the
 *   database); a reset mid-request might mean the write already happened, so that one is not.
 */
const READ_ONLY = /^\s*(select|with\s[\s\S]*?\bselect)\b/i;
function isReadOnly(body: unknown): boolean {
  try {
    const parsed = JSON.parse(String(body)) as { query?: string; queries?: { query: string }[] };
    const queries = parsed.queries?.map((q) => q.query) ?? (parsed.query ? [parsed.query] : []);
    return queries.length > 0 && queries.every((q) => READ_ONLY.test(q) && !/\b(insert|update|delete)\b/i.test(q));
  } catch {
    return false;
  }
}

neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  const readOnly = isReadOnly(init?.body);
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (attempt >= 2 || !(readOnly || neverSent(error))) {
        console.error("[db] request failed", readOnly ? "(read)" : "(write)", (error as { cause?: unknown })?.cause ?? error);
        throw error;
      }
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
};

/**
 * Drizzle over Neon's HTTP driver: one round trip per query, no pooled sockets to manage on Vercel.
 * Multi-statement writes use db.batch (atomic); single-statement updates cover claims and version bumps.
 */
export const db = drizzle(neon(databaseUrl), { schema });

export type Db = typeof db;
