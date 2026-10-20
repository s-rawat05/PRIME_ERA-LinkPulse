import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Clock,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  KeyRound,
  Link2,
  Lock,
  QrCode,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Timer,
  Zap,
} from "lucide-react";
import { LogoMark, Particles } from "@/components/brand";
import { CampaignQrPanel, ClickAnalyticsPanel, LinkPerformancePanel, SmartRedirectPanel } from "@/components/landing/hero-panels";
import { LandingNav } from "@/components/landing/nav";
import { FadeUp } from "@/components/motion";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const LIFECYCLE = [
  { icon: Link2, title: "Create", body: "Two-step wizard with live alias checks and validation warnings before publishing." },
  { icon: Share2, title: "Share / QR", body: "Copy the short URL or download a PNG/SVG QR code that tracks scans separately." },
  { icon: Zap, title: "Redirect", body: "Nine ordered checks, then a 302 with no-store so every visit hits the rules." },
  { icon: Bot, title: "Track", body: "Every visit is stored with its outcome. Bots and link previews are filtered out." },
  { icon: BarChart3, title: "Analyse", body: "Trends, referrers, devices, campaigns and p95 latency from persisted events." },
  { icon: ShieldAlert, title: "Expire / Disable", body: "Expiry, click caps and admin takedowns stop redirects; history stays intact." },
];

const RULES = [
  ["Resolve code", "not_found"],
  ["Admin-disabled / blocked domain", "disabled"],
  ["Paused by owner", "paused"],
  ["Expired", "expired"],
  ["Password", "password_failed"],
  ["Bot / link preview", "bot"],
  ["Atomic click cap", "limit_reached"],
  ["Device / OS / country targeting", "route chosen"],
  ["302 + Cache-Control: no-store", "redirected"],
];

const FEATURES = [
  { icon: Lock, title: "Password-protected links", body: "Checked before the click cap, so wrong attempts never use up clicks. Attempts are rate-limited." },
  { icon: Timer, title: "Expiry and click caps", body: "Caps are enforced by one conditional UPDATE: 50 simultaneous visitors on a cap of 10 get exactly 10 redirects." },
  { icon: QrCode, title: "QR codes", body: "Branded colours, PNG and SVG downloads, and QR-originated traffic reported separately." },
  { icon: FileSpreadsheet, title: "Bulk CSV import", body: "Row-by-row validation report. Bad URLs, duplicate or reserved aliases and blocked domains are never imported." },
  { icon: ShieldCheck, title: "Governance", body: "Domain blocklist, instant takedowns with cache invalidation, and a full audit log for administrators." },
  { icon: FlaskConical, title: "Rule simulator", body: "Test a link as an Android user in India with a wrong password and see which rule decides, without touching analytics." },
  { icon: Tags, title: "Campaigns, tags and folders", body: "Group links, compare campaigns, and find top performers quickly." },
  { icon: KeyRound, title: "Role-based access", body: "Visitors, users and administrators, enforced on the server for every request." },
];

export default async function Home() {
  const user = await getCurrentUser();
  const startHref = user ? "/dashboard/links/new" : "/register";

  return (
    <div className="bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden px-2 pt-2 sm:px-4 sm:pt-4">
        <div className="hero-field relative overflow-hidden rounded-[28px] pb-16 sm:rounded-[36px]">
          <Particles count={34} />
          <LandingNav signedIn={!!user} />

          {/* floating icon bubbles */}
          <span className="glass absolute top-28 left-[22%] hidden size-12 place-items-center rounded-full animate-float lg:grid" aria-hidden>
            <span className="grid size-8 place-items-center rounded-full bg-white text-pulse-600"><Link2 className="size-4" /></span>
          </span>
          <span className="glass absolute top-56 right-[22%] hidden size-16 place-items-center rounded-full animate-float-slow lg:grid" aria-hidden>
            <span className="grid size-10 place-items-center rounded-full bg-white text-emerald-500"><QrCode className="size-5" /></span>
          </span>

          <div className="relative z-10 mx-auto max-w-4xl px-4 pt-16 text-center sm:pt-24">
            <div className="rise">
              <p className="glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-white">
                <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse-dot" aria-hidden /> URL shortener &amp; analytics platform
              </p>
              <h1 className="text-balance text-[44px] leading-[1.02] font-light tracking-[-0.035em] text-white sm:text-[72px] lg:text-[88px]">
                Every Link.
                <br />
                Smarter Insights.
              </h1>
            </div>
            <div className="rise" style={{ animationDelay: "0.12s" }}>
              <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/90 sm:text-[17px]">
                Create powerful short links, track meaningful clicks, and turn your campaigns into measurable growth—all from one intelligent platform.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href={startHref} className="group inline-flex h-13 items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-6 text-[15px] font-medium text-white shadow-[0_18px_40px_-14px_rgb(11_22_48/0.7)] ring-2 ring-white/40 transition hover:bg-[#16223f]">
                  Start Shortening
                  <span className="grid size-10 place-items-center rounded-full bg-white text-ink transition group-hover:rotate-45">
                    <ArrowUpRight className="size-5" aria-hidden />
                  </span>
                </Link>
                <a href="#analytics" className="glass inline-flex h-13 items-center rounded-full px-6 text-[15px] font-medium text-white hover:bg-white/30">
                  Explore Analytics
                </a>
              </div>
            </div>
          </div>

          {/* floating panels */}
          <div className="relative z-10 mx-auto mt-14 grid max-w-6xl grid-cols-1 items-end gap-5 px-4 sm:grid-cols-2 sm:px-8 lg:mt-20 lg:grid-cols-4">
            <div className="rise lg:mb-10" style={{ animationDelay: "0.15s" }}>
              <LinkPerformancePanel />
            </div>
            <div className="rise" style={{ animationDelay: "0.25s" }}>
              <ClickAnalyticsPanel />
            </div>
            <div className="rise" style={{ animationDelay: "0.3s" }}>
              <SmartRedirectPanel />
            </div>
            <div className="rise lg:mb-16" style={{ animationDelay: "0.2s" }}>
              <CampaignQrPanel />
            </div>
          </div>
          <p className="relative z-10 mt-6 text-center text-[12px] text-ink-soft/80">Panels above show illustrative demo data. Your dashboard shows live data from your own links.</p>
        </div>
      </section>

      {/* PRODUCT: lifecycle */}
      <section id="product" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-24 sm:px-8">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold tracking-wide text-pulse-600 uppercase">Product</p>
          <h2 className="mt-2 text-balance text-[34px] font-light tracking-tight text-ink sm:text-[44px]">One link record. The whole lifecycle.</h2>
          <p className="mt-4 text-ink-soft">Most shorteners store a single mapping. LinkPulse treats the link as a hub that campaigns, rules, click events, QR codes and governance all attach to.</p>
        </FadeUp>
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE.map((s, i) => (
            <FadeUp key={s.title} delay={i * 0.05}>
              <li className="group h-full rounded-[24px] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-b from-pulse-500 to-pulse-700 text-white shadow-[0_10px_24px_-10px_rgb(31_95_232/0.8)]">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-mono text-[12px] text-ink-faint">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-[17px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            </FadeUp>
          ))}
        </ol>
      </section>

      {/* ANALYTICS */}
      <section id="analytics" className="scroll-mt-8 px-2 sm:px-4">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#eaf2ff] to-white px-4 py-20 sm:rounded-[36px] sm:px-8">
          <div className="grid-dots absolute inset-0 opacity-60" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <FadeUp>
              <p className="text-[13px] font-semibold tracking-wide text-pulse-600 uppercase">Analytics</p>
              <h2 className="mt-2 text-balance text-[34px] font-light tracking-tight text-ink sm:text-[44px]">Numbers you can defend.</h2>
              <p className="mt-4 text-ink-soft">Every chart is computed from stored click events, never hard-coded. Link previews from WhatsApp, Slack and Facebook are logged as bots and excluded from click totals.</p>
              <ul className="mt-8 grid gap-4">
                {[
                  { icon: Bot, t: "Bot and preview filtering", d: "isbot plus empty user agents and HEAD requests." },
                  { icon: ShieldCheck, t: "Privacy-conscious uniques", d: "A daily-salted hash of link + IP + user agent. Raw IPs are never stored." },
                  { icon: Gauge, t: "Measured redirect latency", d: "Server-side latency recorded per redirect; p95 shown on the dashboard." },
                  { icon: Clock, t: "Expired links stay traceable", d: "Every visit keeps its outcome, so blocked traffic is reportable too." },
                ].map((f) => (
                  <li key={f.t} className="flex gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-pulse-600 shadow-sm ring-1 ring-line"><f.icon className="size-4" aria-hidden /></span>
                    <div>
                      <p className="text-[15px] font-semibold text-ink">{f.t}</p>
                      <p className="text-[14px] text-ink-soft">{f.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="rounded-[28px] border border-line bg-white p-6 shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-ink">Visit outcomes</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 uppercase">Demo data</span>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    { k: "redirected", v: 82, c: "bg-emerald-500" },
                    { k: "bot", v: 9, c: "bg-violet-500" },
                    { k: "expired", v: 4, c: "bg-slate-400" },
                    { k: "password_failed", v: 3, c: "bg-rose-500" },
                    { k: "limit_reached", v: 2, c: "bg-orange-500" },
                  ].map((r) => (
                    <div key={r.k}>
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span className="font-mono text-ink-soft">{r.k}</span>
                        <span className="font-medium text-ink">{r.v}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-canvas">
                        <div className={`h-2 rounded-full ${r.c}`} style={{ width: `${r.v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
                  {[
                    ["p95", "38 ms"],
                    ["Uniques", "3,225"],
                    ["QR share", "28%"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[12px] text-ink-faint">{k}</p>
                      <p className="text-[17px] font-semibold text-ink">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* CAMPAIGNS + RULE ENGINE */}
      <section id="campaigns" className="mx-auto grid max-w-6xl scroll-mt-8 gap-12 px-4 py-24 sm:px-8 lg:grid-cols-2">
        <FadeUp>
          <p className="text-[13px] font-semibold tracking-wide text-pulse-600 uppercase">Campaigns</p>
          <h2 className="mt-2 text-balance text-[34px] font-light tracking-tight text-ink sm:text-[44px]">Group, compare and grow.</h2>
          <p className="mt-4 text-ink-soft">Attach links to campaigns with UTM metadata, tag them, and see total links, clicks, unique visitors, QR share and the top-performing link for each campaign.</p>
          <Link href={startHref} className="mt-8 inline-flex items-center gap-2 text-[15px] font-semibold text-pulse-700 hover:text-pulse-800">
            Create your first campaign <ArrowRight className="size-4" aria-hidden />
          </Link>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div className="rounded-[28px] bg-ink p-6 text-white shadow-[var(--shadow-lift)]">
            <p className="text-[13px] font-semibold text-white/70">The redirect engine · fixed order</p>
            <ol className="mt-4 space-y-1.5">
              {RULES.map(([name, out], i) => (
                <li key={name} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pulse-600 font-mono text-[11px]">{i + 1}</span>
                  <span className="flex-1 text-[13.5px]">{name}</span>
                  <span className="font-mono text-[11.5px] text-pulse-300">{out}</span>
                </li>
              ))}
            </ol>
          </div>
        </FadeUp>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-8 bg-canvas px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <p className="text-[13px] font-semibold tracking-wide text-pulse-600 uppercase">Features</p>
            <h2 className="mt-2 text-balance text-[34px] font-light tracking-tight text-ink sm:text-[44px]">Built for the edge cases.</h2>
          </FadeUp>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <FadeUp key={f.title} delay={(i % 4) * 0.05}>
                <div className="h-full rounded-[22px] border border-line bg-white p-5">
                  <f.icon className="size-5 text-pulse-600" aria-hidden />
                  <h3 className="mt-4 text-[15px] font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-2 py-4 sm:px-4">
        <div className="hero-field relative overflow-hidden rounded-[28px] px-6 py-20 text-center sm:rounded-[36px]">
          <Particles count={18} />
          <h2 className="relative text-balance text-[34px] font-light tracking-tight text-white sm:text-[48px]">Your next link deserves better data.</h2>
          <div className="relative mt-8 flex justify-center">
            <Link href={startHref} className="group inline-flex h-13 items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-6 text-[15px] font-medium text-white ring-2 ring-white/40">
              Start Shortening
              <span className="grid size-10 place-items-center rounded-full bg-white text-ink transition group-hover:rotate-45"><ArrowUpRight className="size-5" aria-hidden /></span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-[13px] text-ink-faint sm:px-8">
        <div className="flex items-center gap-2">
          <LogoMark className="size-7" />
          <span>LinkPulse · Team PRIME ERA, GEHU Bhimtal</span>
        </div>
        <div className="flex gap-5">
          <a href="#product" className="hover:text-ink">Product</a>
          <a href="#features" className="hover:text-ink">Features</a>
          <Link href="/login" className="hover:text-ink">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
