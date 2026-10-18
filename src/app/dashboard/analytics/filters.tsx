"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input, Select } from "@/components/ui/primitives";

export function AnalyticsFilters({ campaigns, campaignId, from, to }: { campaigns: { id: string; name: string }[]; campaignId: string; from: string; to: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function push(p: URLSearchParams) {
    router.replace(`${path}?${p.toString()}`, { scroll: false });
  }
  function apply(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(params.toString());
    if (f && t) {
      p.set("from", f);
      p.set("to", t);
      p.delete("range");
    }
    push(p);
  }
  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[12px] text-ink-faint">
        Campaign
        <Select
          value={campaignId}
          onChange={(e) => {
            const p = new URLSearchParams(params.toString());
            if (e.target.value) p.set("campaign", e.target.value);
            else p.delete("campaign");
            push(p);
          }}
          className="h-9 w-48"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-[12px] text-ink-faint">
        From
        <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-40" />
      </label>
      <label className="grid gap-1 text-[12px] text-ink-faint">
        To
        <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-40" />
      </label>
      <Button type="submit" variant="secondary" size="sm" className="h-9" disabled={!f || !t}>Apply dates</Button>
    </form>
  );
}
