"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; message: string };

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<(i: Item[]) => void>();
const emit = () => listeners.forEach((l) => l([...items]));

function push(kind: Kind, message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
}
function dismiss(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
};

const ICON = { success: CheckCircle2, error: XCircle, info: Info };

export function Toaster() {
  const [list, setList] = useState<Item[]>([]);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {list.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-sm shadow-[var(--shadow-lift)]",
              t.kind === "error" ? "border-red-200" : "border-line",
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", t.kind === "success" && "text-emerald-600", t.kind === "error" && "text-red-600", t.kind === "info" && "text-pulse-600")} aria-hidden />
            <p className="flex-1 text-ink">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
