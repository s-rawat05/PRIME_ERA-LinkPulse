"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, Download, ExternalLink, Loader2, Plus, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, Card, Field, Input, Select } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };
type TagOpt = { id: string; name: string; color: string };
type Created = { id: string; shortCode: string; shortUrl: string; destinationUrl: string };
type Review = { ok: boolean; errors: Record<string, string>; warnings: string[] };
type AliasState = { state: "idle" | "checking" | "ok" | "bad"; message?: string };

const FIELD_STEP: Record<string, 1 | 2> = { destinationUrl: 1, alias: 1, title: 1 };

export function CreateLinkWizard({ campaigns, tags: initialTags, folders, host, defaultCampaign }: { campaigns: Opt[]; tags: TagOpt[]; folders: Opt[]; host: string; defaultCampaign?: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    destinationUrl: "",
    alias: "",
    title: "",
    campaignId: defaultCampaign ?? "",
    folderId: "",
    tagIds: [] as string[],
    expiresAt: "",
    expiredUrl: "",
    maxClicks: "",
    password: "",
  });
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState("");
  const [aliasCheck, setAliasCheck] = useState<{ input: string; available: boolean; message: string } | null>(null);
  const [reviewResult, setReviewResult] = useState<{ key: string; review: Review } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<(Created & { warnings: string[]; scan: { status: string; detail: string } }) | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const payload = useMemo(
    () => ({
      destinationUrl: form.destinationUrl.trim(),
      alias: form.alias.trim() || null,
      title: form.title.trim() || null,
      campaignId: form.campaignId || null,
      folderId: form.folderId || null,
      tagIds: form.tagIds,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      expiredUrl: form.expiresAt && form.expiredUrl.trim() ? form.expiredUrl.trim() : null,
      maxClicks: form.maxClicks ? Number(form.maxClicks) : null,
      password: form.password || null,
    }),
    [form],
  );
  const payloadKey = JSON.stringify(payload);

  // Live alias availability (the database UNIQUE index still has the final word on submit).
  // "checking" is derived: a result exists only for the exact input it was computed for.
  const aliasInput = form.alias.trim();
  const alias: AliasState = !aliasInput
    ? { state: "idle" }
    : aliasCheck?.input !== aliasInput
      ? { state: "checking" }
      : { state: aliasCheck.available ? "ok" : "bad", message: aliasCheck.message };
  useEffect(() => {
    if (!aliasInput) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ available: boolean; alias: string; reason: string | null }>(`/api/links/check-alias?alias=${encodeURIComponent(aliasInput)}`);
        if (!cancelled) setAliasCheck({ input: aliasInput, available: r.available, message: r.available ? `${host}/${r.alias} is available` : r.reason ?? "Unavailable" });
      } catch {
        if (!cancelled) setAliasCheck({ input: aliasInput, available: true, message: "Could not check availability; it will be verified on publish." });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [aliasInput, host]);

  // Step 2: server-side review of the whole payload, debounced. Stale results are ignored by key.
  const review = reviewResult?.review ?? null;
  const reviewing = step === 2 && reviewResult?.key !== payloadKey;
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let r: Review;
      try {
        r = await apiFetch<Review>("/api/links/validate", { method: "POST", body: payloadKey, headers: { "content-type": "application/json" } });
      } catch (e) {
        r = { ok: false, errors: { _: e instanceof ApiError ? e.message : "Validation failed" }, warnings: [] };
      }
      if (!cancelled) setReviewResult({ key: payloadKey, review: r });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, payloadKey]);

  const urlLooksValid = /^https?:\/\/[^\s]+\.[^\s]+/i.test(form.destinationUrl.trim());
  const step1Ok = urlLooksValid && alias.state !== "bad" && alias.state !== "checking";

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    try {
      const { tag } = await apiFetch<{ tag: TagOpt }>("/api/tags", { method: "POST", json: { name } });
      setTags((t) => [...t, tag]);
      set("tagIds", [...form.tagIds, tag.id]);
      setNewTag("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create tag");
    }
  }

  async function publish() {
    setSubmitting(true);
    try {
      const r = await apiFetch<{ link: Created; warnings: string[]; scan: { status: string; detail: string } }>("/api/links", { method: "POST", json: payload });
      setCreated({ ...r.link, warnings: r.warnings, scan: r.scan });
      toast.success("Short link published");
    } catch (e) {
      if (e instanceof ApiError) {
        setReviewResult({ key: payloadKey, review: { ok: false, errors: Object.keys(e.fields).length ? e.fields : { _: e.message }, warnings: review?.warnings ?? [] } });
        if (Object.keys(e.fields).some((k) => FIELD_STEP[k] === 1)) setStep(1);
        toast.error(e.message);
      } else toast.error("Network error. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCreated(null);
    setReviewResult(null);
    setStep(1);
    setForm((f) => ({ ...f, destinationUrl: "", alias: "", title: "", password: "", maxClicks: "", expiresAt: "", expiredUrl: "" }));
  }

  if (created) {
    const qr = `/api/links/${created.id}/qr?format=png&size=480`;
    return (
      <Card className="mx-auto max-w-3xl overflow-hidden">
        <div className="hero-field px-6 py-8 text-center text-white">
          <CheckCircle2 className="mx-auto size-10" aria-hidden />
          <h2 className="mt-3 text-2xl font-light tracking-tight">Your link is live</h2>
          <p className="mt-1 text-white/85">Share it as a URL or a QR code. Every visit is checked by the rule engine and tracked.</p>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-faint uppercase">Short link</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="truncate text-xl font-semibold text-pulse-700">{created.shortUrl}</p>
              <CopyButton value={created.shortUrl} />
            </div>
            <p className="mt-1 truncate text-[13px] text-ink-faint">→ {created.destinationUrl}</p>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
              <ShieldCheck className="size-4 text-pulse-600" aria-hidden />
              {created.scan.status === "not_scanned" ? "Checked against the domain blocklist. External URL scanning is not configured." : created.scan.detail}
            </p>
            {created.warnings.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {created.warnings.map((w) => (
                  <li key={w} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <a href={created.shortUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white"><ExternalLink className="size-4" /> Open link</a>
              <ButtonLink href={`/dashboard/links/${created.id}`} variant="secondary"><BarChart3 className="size-4" /> View analytics</ButtonLink>
              <Button variant="ghost" onClick={reset}><Plus className="size-4" /> Create another</Button>
            </div>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR code for ${created.shortUrl}`} className="mx-auto size-44 rounded-2xl border border-line" />
            <div className="mt-2 flex justify-center gap-1.5">
              <a href={`/api/links/${created.id}/qr?format=png&download=1`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-medium text-ink-soft hover:text-pulse-700"><Download className="size-3.5" /> PNG</a>
              <a href={`/api/links/${created.id}/qr?format=svg&download=1`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-medium text-ink-soft hover:text-pulse-700"><Download className="size-3.5" /> SVG</a>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">Scans are tracked as QR traffic</p>
          </div>
        </div>
      </Card>
    );
  }

  const errors = review?.errors ?? {};

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        <ol className="mb-6 flex items-center gap-3 text-[13px]" aria-label="Progress">
          {[
            [1, "Destination & alias"],
            [2, "Options & review"],
          ].map(([n, label]) => (
            <li key={n} className="flex items-center gap-2">
              <span className={cn("grid size-7 place-items-center rounded-full text-[12px] font-semibold", step >= (n as number) ? "bg-pulse-600 text-white" : "bg-canvas text-ink-faint ring-1 ring-line")} aria-current={step === n ? "step" : undefined}>
                {step > (n as number) ? <Check className="size-3.5" /> : n}
              </span>
              <span className={step === n ? "font-semibold text-ink" : "text-ink-faint"}>{label}</span>
              {n === 1 && <span className="mx-1 h-px w-8 bg-line" aria-hidden />}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (step1Ok) setStep(2);
            }}
          >
            <Field label="Destination URL" htmlFor="destinationUrl" error={errors.destinationUrl ?? (form.destinationUrl && !urlLooksValid ? "Enter a full URL starting with https://" : undefined)}>
              <Input id="destinationUrl" type="url" inputMode="url" autoFocus required placeholder="https://example.com/your/long/url" value={form.destinationUrl} onChange={(e) => set("destinationUrl", e.target.value)} aria-invalid={!!errors.destinationUrl} />
            </Field>
            <Field
              label="Custom alias (optional)"
              htmlFor="alias"
              error={errors.alias ?? (alias.state === "bad" ? alias.message : undefined)}
              hint={alias.state === "ok" ? <span className="text-emerald-700">✓ {alias.message}</span> : alias.state === "checking" ? "Checking availability…" : "Leave empty for a random 7-character code. 3–32 chars: a–z, 0–9, - and _."}
            >
              <div className="flex items-stretch overflow-hidden rounded-xl border border-line focus-within:border-pulse-400 focus-within:ring-4 focus-within:ring-pulse-100">
                <span className="flex items-center bg-canvas px-3 text-[13px] text-ink-faint">{host}/</span>
                <input id="alias" className="h-10 min-w-0 flex-1 px-3 text-sm outline-none" placeholder="diwali-sale" value={form.alias} onChange={(e) => set("alias", e.target.value)} aria-invalid={alias.state === "bad"} autoComplete="off" />
              </div>
            </Field>
            <Field label="Title (optional)" htmlFor="title" hint="Only visible to you">
              <Input id="title" maxLength={120} placeholder="Diwali landing page" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="blue" disabled={!step1Ok}>
                Continue <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Campaign" htmlFor="campaignId" error={errors.campaignId} hint={campaigns.length === 0 ? <Link href="/dashboard/campaigns" className="text-pulse-700 hover:underline">Create a campaign first</Link> : undefined}>
                <Select id="campaignId" value={form.campaignId} onChange={(e) => set("campaignId", e.target.value)}>
                  <option value="">No campaign</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Folder" htmlFor="folderId" error={errors.folderId}>
                <Select id="folderId" value={form.folderId} onChange={(e) => set("folderId", e.target.value)}>
                  <option value="">No folder</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Tags</legend>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = form.tagIds.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      aria-pressed={on}
                      onClick={() => set("tagIds", on ? form.tagIds.filter((x) => x !== t.id) : [...form.tagIds, t.id])}
                      className={cn("rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition", on ? "text-white ring-transparent" : "bg-white text-ink-soft ring-line hover:ring-pulse-200")}
                      style={on ? { background: t.color } : undefined}
                    >
                      {t.name}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1">
                  <Input aria-label="New tag name" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="New tag" className="h-8 w-28 text-[12.5px]" maxLength={32} />
                  <Button type="button" size="sm" variant="secondary" onClick={addTag} disabled={!newTag.trim()}>Add</Button>
                </div>
              </div>
              {errors.tagIds && <p className="text-[12.5px] text-red-600">{errors.tagIds}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expires at (optional)" htmlFor="expiresAt" error={errors.expiresAt}>
                <Input id="expiresAt" type="datetime-local" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} aria-invalid={!!errors.expiresAt} />
              </Field>
              <Field label="Click limit (optional)" htmlFor="maxClicks" error={errors.maxClicks} hint="Human clicks only; bots never count">
                <Input id="maxClicks" type="number" min={1} step={1} placeholder="e.g. 100" value={form.maxClicks} onChange={(e) => set("maxClicks", e.target.value)} aria-invalid={!!errors.maxClicks} />
              </Field>
            </div>
            {form.expiresAt && (
              <Field label="After expiry, send visitors to (optional)" htmlFor="expiredUrl" error={errors.expiredUrl} hint="Otherwise visitors see an “expired” page">
                <Input id="expiredUrl" type="url" placeholder="https://example.com/offer-ended" value={form.expiredUrl} onChange={(e) => set("expiredUrl", e.target.value)} />
              </Field>
            )}
            <Field label="Password (optional)" htmlFor="password" error={errors.password} hint="Visitors must enter it before redirecting. Stored as a bcrypt hash.">
              <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-5">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="size-4" /> Back</Button>
              <Button variant="blue" onClick={publish} loading={submitting} disabled={reviewing || !review?.ok}>
                Publish link
              </Button>
            </div>
          </div>
        )}
      </Card>

      <aside className="grid h-fit gap-4" aria-live="polite">
        <Card className="p-5">
          <p className="text-[12px] font-medium text-ink-faint uppercase">Preview</p>
          <p className="mt-1 truncate text-lg font-semibold text-pulse-700">{host}/{form.alias.trim().toLowerCase() || "•••••••"}</p>
          <p className="truncate text-[13px] text-ink-faint">→ {form.destinationUrl || "destination URL"}</p>
          <ul className="mt-4 grid gap-1.5 text-[12.5px] text-ink-soft">
            <li>Campaign: <span className="font-medium text-ink">{campaigns.find((c) => c.id === form.campaignId)?.name ?? "—"}</span></li>
            <li>Expiry: <span className="font-medium text-ink">{form.expiresAt ? new Date(form.expiresAt).toLocaleString() : "Never"}</span></li>
            <li>Click limit: <span className="font-medium text-ink">{form.maxClicks || "Unlimited"}</span></li>
            <li>Password: <span className="font-medium text-ink">{form.password ? "Required" : "None"}</span></li>
          </ul>
        </Card>
        {step === 2 && (
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
              Validation review {reviewing && <Loader2 className="size-3.5 animate-spin text-ink-faint" aria-label="Checking" />}
            </p>
            {review && Object.keys(review.errors).length > 0 && (
              <ul className="mb-3 grid gap-1.5">
                {Object.entries(review.errors).map(([k, v]) => (
                  <li key={k} className="flex gap-2 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                    <XCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {v}
                      {FIELD_STEP[k] === 1 && (
                        <button className="ml-1 font-semibold underline" onClick={() => setStep(1)}>Fix</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {review?.warnings.map((w) => (
              <p key={w} className="mb-1.5 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</p>
            ))}
            {review?.ok && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700"><CheckCircle2 className="size-3.5" /> No blocking problems. Ready to publish.</p>}
          </Card>
        )}
      </aside>
    </div>
  );
}
