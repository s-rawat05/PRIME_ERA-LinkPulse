"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]" role="alert">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-1 text-sm text-ink-soft">This page could not be loaded. Your data is safe; please try again.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-ink-faint">Reference: {error.digest}</p>}
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
