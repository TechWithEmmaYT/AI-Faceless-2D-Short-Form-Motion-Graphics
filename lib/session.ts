import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

export const SIGN_IN_PATH = "/auth/sign-in";
export const AFTER_SIGN_IN_PATH = "/dashboard";

/**
 * The Data Access Layer's one session read. Reads request headers, so with Cache Components every
 * caller must sit inside a <Suspense> boundary (next/dist/docs/01-app/02-guides/authentication-with-cache-components.md).
 * `cache` dedupes it within one request, so a layout and a page can both ask.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** The signed-in user, or a redirect to sign-in. Use in every protected page, action and route. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATH);
  return session.user;
}

/** For route handlers: the signed-in user, or null (the route answers 401 rather than redirecting). */
export async function getApiUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Only a same-site path may be a post-sign-in destination (no `//evil.com`, no absolute URLs). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return AFTER_SIGN_IN_PATH;
  return next;
}
