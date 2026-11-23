import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: a request to the dashboard with no session cookie goes straight to sign-in.
 * A cookie's presence proves nothing — every protected page, action and route still calls
 * requireUser() from lib/session.ts. Signed-in users on /auth are redirected by the auth layout,
 * which checks the real session; doing it here off a stale cookie would loop.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
