"use client";

import { RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { cn } from "@/lib/cn";

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  function set(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString());
    if (value === null) p.delete(key);
    else p.set(key, value);
    p.delete("from");
    p.delete("to");
    start(() => router.replace(`${path}?${p.toString()}`, { scroll: false }));
  }
  const real = params.get("real") === "1";
  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")}>
      <div className="inline-flex rounded-full border border-line bg-white p-1" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => set("range", r.key)}
            aria-pressed={current === r.key}
            className={cn("rounded-full px-3 py-1 text-[13px] font-medium transition", current === r.key ? "bg-ink text-white" : "text-ink-soft hover:text-ink")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] text-ink-soft">
        <input type="checkbox" checked={real} onChange={(e) => set("real", e.target.checked ? "1" : null)} className="accent-pulse-600" />
        Exclude demo data
      </label>
    </div>
  );
}

/** Re-fetches server data periodically so dashboards reflect new click events without a manual reload. */
export function LiveRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      start(() => router.refresh());
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <button
      onClick={() => start(() => router.refresh())}
      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-medium text-emerald-700"
      title="Refresh now"
    >
      <span className="size-2 rounded-full bg-emerald-500 animate-pulse-dot" aria-hidden />
      Live · every {seconds}s
      <RefreshCw className="size-3.5" aria-hidden />
    </button>
  );
}
