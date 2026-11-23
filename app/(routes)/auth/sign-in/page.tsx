import type { Metadata } from "next";

import { AuthForm } from "../_components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to pick up where Claude Code left off.</p>
      </div>
      <AuthForm mode="sign-in" />
    </>
  );
}
