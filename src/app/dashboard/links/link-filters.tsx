"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };

export function LinkFilters({ campaigns, tags, folders }: { campaigns: Opt[]; tags: Opt[]; folders: Opt[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    start(() => router.replace(`${path}?${p.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set("q", q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")}>
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alias, title or destination" className="pl-9" aria-label="Search links" />
      </div>
      <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} className="w-40" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="expired">Expired</option>
        <option value="disabled">Disabled</option>
      </Select>
      {campaigns.length > 0 && (
      <Select value={params.get("campaign") ?? ""} onChange={(e) => set("campaign", e.target.value)} className="w-44" aria-label="Filter by campaign">
        <option value="">All campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      )}
      {tags.length > 0 && (
      <Select value={params.get("tag") ?? ""} onChange={(e) => set("tag", e.target.value)} className="w-36" aria-label="Filter by tag">
        <option value="">All tags</option>
        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
      )}
      {folders.length > 0 && (
        <Select value={params.get("folder") ?? ""} onChange={(e) => set("folder", e.target.value)} className="w-36" aria-label="Filter by folder">
          <option value="">All folders</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      )}
    </div>
  );
}
