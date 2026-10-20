"use client";

import { ArrowRight, CheckCircle2, CircleSlash, FlaskConical, MinusCircle, Route, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";
import { cn } from "@/lib/cn";

type Step = { n: number; name: string; result: "pass" | "block" | "route" | "skip"; detail: string };
type Result = {
  steps: Step[];
  decision: { kind: string; outcome: string | null; destination?: string; status?: number };
  link: { shortCode: string; destinationUrl: string; status: string; maxClicks: number | null; clickCount: number; hasPassword: boolean; ruleCount: number };
  request: { device: string; os: string | null; country: string | null; password: string; at: string };
};

const ICON = { pass: CheckCircle2, block: XCircle, route: Route, skip: MinusCircle };
const TONE = { pass: "text-emerald-600", block: "text-red-600", route: "text-pulse-600", skip: "text-ink-faint" };

export function Simulator({ links, initial }: { links: { id: string; label: string }[]; initial?: string }) {
  const [linkId, setLinkId] = useState(initial ?? links[0]?.id ?? "");
  const [device, setDevice] = useState("mobile");
  const [os, setOs] = useState("Android");
  const [country, setCountry] = useState("IN");
  const [password, setPassword] = useState("wrong");
  const [statusOverride, setStatusOverride] = useState("actual");
  const [at, setAt] = useState("");
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setRes(
        await apiFetch<Result>("/api/simulate", {
          method: "POST",
          json: { linkId, device, os: os || null, country: country || null, password, statusOverride, at: at ? new Date(at).toISOString() : null, clickCountOverride: count === "" ? null : Number(count) },
        }),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  }

  const decider = res?.steps.find((s) => s.result === "block" || s.result === "route");
  const d = res?.decision;

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader title="Hypothetical visit" description="Nothing here is recorded in analytics." />
        <form onSubmit={run} className="grid gap-4 p-5">
          <Field label="Link" htmlFor="s-link">
            <Select id="s-link" value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
              {links.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Device" htmlFor="s-device">
              <Select id="s-device" value={device} onChange={(e) => setDevice(e.target.value)}>
                <option value="mobile">Mobile</option>
                <option value="tablet">Tablet</option>
                <option value="desktop">Desktop</option>
                <option value="bot">Bot / link preview</option>
              </Select>
            </Field>
            <Field label="OS" htmlFor="s-os"><Input id="s-os" value={os} onChange={(e) => setOs(e.target.value)} placeholder="Android" /></Field>
            <Field label="Country (ISO)" htmlFor="s-country"><Input id="s-country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="IN" /></Field>
            <Field label="Password" htmlFor="s-pw">
              <Select id="s-pw" value={password} onChange={(e) => setPassword(e.target.value)}>
                <option value="none">Not entered</option>
                <option value="wrong">Wrong password</option>
                <option value="correct">Correct password</option>
              </Select>
            </Field>
          </div>
          <details className="rounded-xl bg-canvas px-3 py-2 text-[13px]">
            <summary className="cursor-pointer font-medium text-ink-soft">What-if overrides</summary>
            <div className="mt-3 grid gap-3">
              <Field label="Link status" htmlFor="s-status">
                <Select id="s-status" value={statusOverride} onChange={(e) => setStatusOverride(e.target.value)}>
                  <option value="actual">Actual status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="disabled">Disabled by admin</option>
                </Select>
              </Field>
              <Field label="Visit time" htmlFor="s-at" hint="Try a time after the expiry date"><Input id="s-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
              <Field label="Clicks already used" htmlFor="s-count" hint="Test the cap boundary"><Input id="s-count" type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} placeholder="Actual count" /></Field>
            </div>
          </details>
          <Button type="submit" variant="blue" loading={busy} disabled={!linkId}><FlaskConical className="size-4" /> Run simulation</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Rule evaluation" description="Same engine as live redirects, in the same fixed order" action={<Badge tone="demo">simulated · not recorded</Badge>} />
        {!res ? (
          <div className="flex flex-col items-center px-6 py-16 text-center text-ink-faint">
            <CircleSlash className="mb-3 size-8" />
            <p className="text-sm">Choose a link and visitor, then run the simulation to see which rule decides.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5">
            <div className={cn("rounded-2xl p-4", d?.kind === "redirect" || d?.kind === "redirect_expired" ? "bg-emerald-50" : d?.kind === "password" ? "bg-amber-50" : "bg-red-50")}>
              <p className="text-[12px] font-medium text-ink-faint uppercase">Expected outcome</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {d?.kind === "password" && !d.outcome ? "Password form shown" : d?.outcome}
                {d?.kind === "block" && <span className="ml-2 text-sm font-normal text-ink-soft">HTTP {d.status}</span>}
                {(d?.kind === "redirect" || d?.kind === "redirect_expired") && <span className="ml-2 text-sm font-normal text-ink-soft">HTTP 302</span>}
              </p>
              {d?.destination && (
                <p className="mt-1 flex items-center gap-2 truncate text-[13px] text-ink-soft"><ArrowRight className="size-3.5" /> {d.destination}</p>
              )}
              {decider && <p className="mt-2 text-[13px] text-ink-soft">Decided at step {decider.n}: <b>{decider.name}</b></p>}
            </div>
            <ol className="grid gap-2">
              {res.steps.map((s) => {
                const Icon = ICON[s.result];
                return (
                  <li key={s.n} className={cn("flex gap-3 rounded-xl border px-3 py-2.5", s === decider ? "border-pulse-300 bg-pulse-50/60" : "border-line", s.result === "skip" && "opacity-60")}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-canvas font-mono text-[11px] text-ink-soft">{s.n}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">{s.name}</p>
                      <p className="text-[12.5px] text-ink-soft">{s.detail}</p>
                    </div>
                    <Icon className={cn("size-4 shrink-0", TONE[s.result])} aria-label={s.result} />
                  </li>
                );
              })}
            </ol>
            <p className="text-[12px] text-ink-faint">Visitor: {res.request.device}{res.request.os ? ` · ${res.request.os}` : ""}{res.request.country ? ` · ${res.request.country}` : ""} · password {res.request.password} · at {new Date(res.request.at).toLocaleString()}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
