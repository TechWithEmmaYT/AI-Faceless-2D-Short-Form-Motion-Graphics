import type { Metadata } from "next";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Create your studio</h1>
        <p className="text-sm text-muted-foreground">Free, no plans, nothing locked. You&apos;ll connect Claude Code next.</p>
      </div>
      <AuthForm mode="sign-up" />
    </>
  );
}
