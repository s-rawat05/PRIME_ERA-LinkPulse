"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toast } from "./toast";

export function CopyButton({ value, label = "Copy", className, compact }: { value: string; label?: string; className?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setDone(false), 1600);
    } catch {
      toast.error("Clipboard is unavailable. Select and copy the link manually.");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-white text-[13px] font-medium text-ink-soft transition hover:border-pulse-200 hover:text-pulse-700",
        compact ? "size-8 justify-center" : "h-8 px-3",
        className,
      )}
      aria-label={compact ? `${label} ${value}` : undefined}
    >
      {done ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {!compact && (done ? "Copied" : label)}
    </button>
  );
}

/** Accessible modal built on <dialog> (focus trap, Esc to close). */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable element (the close button); prefer the first field.
      d.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea, select")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-white p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-ink/40 backdrop:backdrop-blur-sm", wide ? "max-w-2xl" : "max-w-md")}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-1 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close dialog">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
