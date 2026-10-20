"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { apiFetch, ApiError } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await apiFetch(`/api/auth/${mode}`, { method: "POST", json: data });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {mode === "register" && (
        <Field label="Full name" htmlFor="name" error={fields.name}>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={!!fields.name} placeholder="Sahil Rawat" />
        </Field>
      )}
      <Field label="Email" htmlFor="email" error={fields.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fields.email} placeholder="you@example.com" />
      </Field>
      <Field label="Password" htmlFor="password" error={fields.password} hint={mode === "register" ? "At least 8 characters." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} aria-invalid={!!fields.password} />
      </Field>
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-[13px] text-ink-faint">
        {mode === "login" ? (
          <>
            New to LinkPulse? <Link href="/register" className="font-medium text-pulse-700 hover:underline">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link href="/login" className="font-medium text-pulse-700 hover:underline">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
