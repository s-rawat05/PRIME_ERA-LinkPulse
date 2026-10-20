import { ArrowUpRight, BarChart3, Link2, MousePointerClick, QrCode, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { ChainLinks } from "@/components/brand";

/** Illustrative panels in the hero. Values are static demo data and are labelled as such. */
function DemoTag() {
  return <span className="rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase">Demo data</span>;
}

export function LinkPerformancePanel() {
  return (
    <div className="glass rounded-[28px] p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[15px] font-medium text-white">Link performance</p>
        <DemoTag />
      </div>
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
        <span className="grid size-8 place-items-center rounded-xl bg-pulse-600 text-white"><Link2 className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">lp.link/diwali-sale</p>
          <p className="truncate text-[11px] text-ink-faint">store.example.com/festive</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-medium text-ink-faint">Human clicks · last 7 days</p>
        {[
          { k: "Total clicks", v: "6,440", i: MousePointerClick },
          { k: "Unique visitors", v: "3,225", i: Sparkles },
        ].map((r) => (
          <div key={r.k} className="mb-2 flex items-center justify-between rounded-xl border border-line px-2.5 py-2 last:mb-0">
            <span className="flex items-center gap-2 text-[12px] text-ink-soft">
              <span className="grid size-6 place-items-center rounded-full bg-pulse-50 text-pulse-600"><r.i className="size-3.5" /></span>
              {r.k}
            </span>
            <span className="text-[14px] font-semibold text-ink">{r.v}</span>
          </div>
        ))}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="rounded-full bg-pulse-600 py-2 text-center text-[12px] font-medium text-white">Analytics</span>
          <span className="rounded-full border border-line py-2 text-center text-[12px] font-medium text-ink">Share</span>
        </div>
      </div>
    </div>
  );
}

export function ClickAnalyticsPanel() {
  const bars = [32, 48, 40, 64, 58, 82, 74, 96, 70, 88, 60, 92];
  return (
    <div className="glass-light rounded-[28px] p-4 text-left">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] font-medium text-ink-faint">Click analytics</p>
        <DemoTag />
      </div>
      <div className="flex items-end justify-between">
        <p className="text-[26px] font-semibold tracking-tight text-ink">2,996</p>
        <p className="mb-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">+18.4%</p>
      </div>
      <div className="mt-3 flex h-20 items-end gap-1.5" aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-pulse-600 to-pulse-300" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint">
        <span className="flex items-center gap-1"><Smartphone className="size-3" /> 64% mobile</span>
        <span className="flex items-center gap-1"><ShieldCheck className="size-3" /> 312 bots filtered</span>
      </div>
    </div>
  );
}

export function SmartRedirectPanel() {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-pulse-400/70 to-pulse-700/80 p-4 text-left ring-1 ring-white/30">
      <p className="relative z-10 text-[15px] font-medium text-white">Smart redirects</p>
      <p className="relative z-10 text-[11px] text-white/75">9-step rule engine · 302</p>
      <ChainLinks className="relative -mx-4 -mb-6 mt-1 w-[calc(100%+2rem)]" />
    </div>
  );
}

export function CampaignQrPanel() {
  return (
    <div className="glass rounded-[28px] p-3">
      <div className="rounded-[22px] bg-white p-4 text-left shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-full bg-pulse-50 text-pulse-600"><BarChart3 className="size-4" /></span>
          <DemoTag />
        </div>
        <p className="text-[12px] text-ink-faint">Campaign · Diwali Sale</p>
        <div className="flex items-baseline gap-2">
          <p className="text-[20px] font-semibold text-ink">1,458</p>
          <ArrowUpRight className="size-4 text-emerald-600" aria-hidden />
          <p className="text-[20px] font-semibold text-ink">2,104</p>
        </div>
        <p className="mt-1 inline-block rounded-full bg-pulse-50 px-2 py-0.5 text-[11px] text-pulse-700">+44% vs last campaign</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 p-2 text-white">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-ink"><QrCode className="size-6" /></span>
          <div className="text-[11px] leading-tight">
            <p className="font-semibold">QR scans tracked</p>
            <p className="opacity-90">412 scans · 28%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
