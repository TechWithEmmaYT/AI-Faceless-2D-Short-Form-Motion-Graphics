"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

const email = z.email("Enter a valid email address.");
const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});
const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Keep it under 128 characters."),
});

type Errors = Partial<Record<"name" | "email" | "password", string>>;

/** Same rule as safeNextPath in lib/session.ts — only same-site paths. */
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = (isSignUp ? signUpSchema : signInSchema).safeParse(values);
    if (!parsed.success) {
      const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]])));
      return;
    }
    setErrors({});
    setPending(true);

    const { error } = isSignUp
      ? await signUp.email(parsed.data as z.infer<typeof signUpSchema>)
      : await signIn.email(parsed.data);

    if (error) {
      setPending(false);
      toast.error(messageFor(error.status, error.message, isSignUp));
      return;
    }
    router.replace(nextPath());
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        {isSignUp && (
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" name="name" autoComplete="name" placeholder="Ada Lovelace" className="h-11" aria-invalid={!!errors.name} />
            <FieldError>{errors.name}</FieldError>
          </Field>
        )}
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" className="h-11" aria-invalid={!!errors.email} />
          <FieldError>{errors.email}</FieldError>
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            className="h-11"
            aria-invalid={!!errors.password}
          />
          <FieldError>{errors.password}</FieldError>
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" disabled={pending} className="h-11 text-[15px]">
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "New to MotionStudio? "}
        <Link href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"} className="font-medium text-foreground underline-offset-4 hover:underline">
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

function messageFor(status: number, message: string | undefined, isSignUp: boolean): string {
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (!isSignUp && status === 401) return "That email and password don't match.";
  if (isSignUp && status === 422) return "An account with this email already exists. Sign in instead.";
  return message || "Something went wrong. Try again.";
}
