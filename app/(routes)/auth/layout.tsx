import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { AFTER_SIGN_IN_PATH, getSession } from "@/lib/session";

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      {/* Reads the session, so it streams behind its own boundary and doesn't hold the form. */}
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Logo className="mb-8" />
      <div className="w-full max-w-[420px] rounded-2xl border bg-card p-8 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        {children}
      </div>
      <p className="mt-6 max-w-[420px] text-center text-xs text-muted-foreground">
        Faceless 2D motion shorts for YouTube Shorts, TikTok and Reels, built by Claude Code.
      </p>
    </main>
  );
}

/** A signed-in visitor has no business on /auth — checked against the real session, not just the cookie. */
async function RedirectIfSignedIn() {
  if (await getSession()) redirect(AFTER_SIGN_IN_PATH);
  return null;
}
