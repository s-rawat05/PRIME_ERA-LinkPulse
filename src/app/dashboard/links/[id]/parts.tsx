"use client";

import { useRouter } from "next/navigation";
import { Download, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";
import { cn } from "@/lib/cn";

export function StatusActions({ id, status, owner }: { id: string; status: "active" | "paused" | "disabled"; owner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!owner) return null;
  async function toggle() {
    setBusy(true);
    try {
      await apiFetch(`/api/links/${id}/status`, { method: "POST", json: { status: status === "paused" ? "active" : "paused" } });
      toast.success(status === "paused" ? "Link resumed" : "Link paused; visitors now see a paused page");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not change status");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/links/${id}`, { method: "DELETE" });
      toast.success("Link deleted. Its analytics history is kept.");
      router.push("/dashboard/links");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete");
      setBusy(false);
    }
  }
  return (
    <>
      {status !== "disabled" && (
        <Button variant="secondary" onClick={toggle} loading={busy}>
          {status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
          {status === "paused" ? "Resume" : "Pause"}
        </Button>
      )}
      <Button variant="ghost" onClick={() => setConfirm(true)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
        <Trash2 className="size-4" /> Delete
      </Button>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this link?">
        <p className="text-sm text-ink-soft">The short link stops redirecting immediately and its code stays reserved. Click history is preserved for reporting.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove} loading={busy}>Delete link</Button>
        </div>
      </Modal>
    </>
  );
}

export function QrStudio({ id, code, fg: fg0, bg: bg0, owner }: { id: string; code: string; fg: string; bg: string; owner: boolean }) {
  const [fg, setFg] = useState(fg0);
  const [bg, setBg] = useState(bg0);
  const [v, setV] = useState(0);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/links/${id}/qr`, { method: "PUT", json: { fg, bg } });
      setV((x) => x + 1);
      toast.success("QR colours saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card id="qr" className="scroll-mt-6">
      <CardHeader title="QR code" description={`Encodes /${code}?s=qr so scans are reported as QR traffic`} />
      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={v} src={`/api/links/${id}/qr?format=png&size=480&v=${v}`} alt={`QR code for /${code}`} className="size-40 rounded-2xl border border-line" />
        <div className="grid content-start gap-3">
          {owner && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-[12px] text-ink-faint">
                Foreground
                <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-line" />
              </label>
              <label className="grid gap-1 text-[12px] text-ink-faint">
                Background
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-line" />
              </label>
              <Button size="sm" variant="secondary" onClick={save} loading={saving}><Save className="size-3.5" /> Save colours</Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/links/${id}/qr?format=png&download=1`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white"><Download className="size-3.5" /> PNG (1024px)</a>
            <a href={`/api/links/${id}/qr?format=svg&download=1`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-medium text-ink"><Download className="size-3.5" /> SVG</a>
          </div>
          <p className="text-[12px] text-ink-faint">Keep strong contrast between colours so phone cameras can read the code.</p>
        </div>
      </div>
    </Card>
  );
}

type Opt = { id: string; name: string };
type EditInit = {
  destinationUrl: string; title: string; campaignId: string; folderId: string; tagIds: string[];
  expiresAt: string; expiredUrl: string; maxClicks: string; hasPassword: boolean;
};

function toLocalInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function EditLinkForm({ id, init, campaigns, folders, tags }: { id: string; init: EditInit; campaigns: Opt[]; folders: Opt[]; tags: (Opt & { color: string })[] }) {
  const router = useRouter();
  const [f, setF] = useState({ ...init, expiresAt: toLocalInput(init.expiresAt), password: "", clearPassword: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const r = await apiFetch<{ warnings: string[] }>(`/api/links/${id}`, {
        method: "PATCH",
        json: {
          destinationUrl: f.destinationUrl,
          title: f.title || null,
          campaignId: f.campaignId || null,
          folderId: f.folderId || null,
          tagIds: f.tagIds,
          expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
          expiredUrl: f.expiresAt && f.expiredUrl ? f.expiredUrl : null,
          maxClicks: f.maxClicks ? Number(f.maxClicks) : null,
          password: f.password || null,
          clearPassword: f.clearPassword,
        },
      });
      toast.success("Link updated; the change applies to the very next visit");
      r.warnings.forEach((w) => toast.info(w));
      set("password", "");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
      } else toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Edit link" description="The short code cannot change, so shared links keep working." />
      <form onSubmit={submit} className="grid gap-4 p-5">
        <Field label="Destination URL" htmlFor="e-dest" error={errors.destinationUrl}>
          <Input id="e-dest" type="url" required value={f.destinationUrl} onChange={(e) => set("destinationUrl", e.target.value)} aria-invalid={!!errors.destinationUrl} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="e-title"><Input id="e-title" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={120} /></Field>
          <Field label="Campaign" htmlFor="e-camp" error={errors.campaignId}>
            <Select id="e-camp" value={f.campaignId} onChange={(e) => set("campaignId", e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Folder" htmlFor="e-folder">
            <Select id="e-folder" value={f.folderId} onChange={(e) => set("folderId", e.target.value)}>
              <option value="">No folder</option>
              {folders.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Click limit" htmlFor="e-max" error={errors.maxClicks}>
            <Input id="e-max" type="number" min={1} value={f.maxClicks} onChange={(e) => set("maxClicks", e.target.value)} placeholder="Unlimited" />
          </Field>
          <Field label="Expires at" htmlFor="e-exp" error={errors.expiresAt}>
            <Input id="e-exp" type="datetime-local" value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
          </Field>
          <Field label="Expiry fallback URL" htmlFor="e-expurl" error={errors.expiredUrl}>
            <Input id="e-expurl" type="url" value={f.expiredUrl} onChange={(e) => set("expiredUrl", e.target.value)} disabled={!f.expiresAt} placeholder="Optional" />
          </Field>
        </div>
        {tags.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Tags</legend>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = f.tagIds.includes(t.id);
                return (
                  <button type="button" key={t.id} aria-pressed={on} onClick={() => set("tagIds", on ? f.tagIds.filter((x) => x !== t.id) : [...f.tagIds, t.id])} className={cn("rounded-full px-3 py-1 text-[12.5px] font-medium ring-1", on ? "text-white ring-transparent" : "bg-white text-ink-soft ring-line")} style={on ? { background: t.color } : undefined}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="grid gap-2 rounded-2xl bg-canvas p-4">
          <Field label={init.hasPassword ? "Change password" : "Add password"} htmlFor="e-pw" error={errors.password} hint={init.hasPassword ? "Leave blank to keep the current password" : "Leave blank for no password"}>
            <Input id="e-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} disabled={f.clearPassword} />
          </Field>
          {init.hasPassword && (
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={f.clearPassword} onChange={(e) => set("clearPassword", e.target.checked)} className="accent-pulse-600" /> Remove password protection
            </label>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="blue" loading={saving}><Save className="size-4" /> Save changes</Button>
        </div>
      </form>
    </Card>
  );
}

type Rule = { id: string; priority: number; conditionType: string; conditionValue: string; targetUrl: string };

export function RulesEditor({ id, rules, owner }: { id: string; rules: Rule[]; owner: boolean }) {
  const router = useRouter();
  const [type, setType] = useState("device");
  const [value, setValue] = useState("mobile");
  const [target, setTarget] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await apiFetch(`/api/links/${id}/rules`, { method: "POST", json: { conditionType: type, conditionValue: value, targetUrl: target } });
      toast.success("Targeting rule added");
      setTarget("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  }
  async function remove(ruleId: string) {
    try {
      await apiFetch(`/api/links/${id}/rules/${ruleId}`, { method: "DELETE" });
      toast.success("Rule removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove rule");
    }
  }

  return (
    <Card>
      <CardHeader title="Targeting rules" description="Step 8 of the redirect engine: first matching rule by priority wins, otherwise the default destination." />
      <div className="grid gap-3 p-5">
        {rules.length === 0 ? (
          <p className="rounded-xl bg-canvas px-3 py-3 text-[13px] text-ink-faint">No rules. Everyone goes to the default destination.</p>
        ) : (
          <ol className="grid gap-2">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                <span className="grid size-6 place-items-center rounded-full bg-pulse-50 font-mono text-[11px] text-pulse-700">{r.priority}</span>
                <span className="text-ink-soft">If <b className="text-ink">{r.conditionType}</b> = <b className="text-ink">{r.conditionValue}</b> →</span>
                <span className="min-w-0 flex-1 truncate text-ink">{r.targetUrl}</span>
                {owner && (
                  <button onClick={() => remove(r.id)} className="rounded-full p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label={`Remove rule ${r.priority}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        {owner && (
          <form onSubmit={add} className="grid gap-2 border-t border-line pt-4 sm:grid-cols-[130px_130px_1fr_auto] sm:items-start">
            <Select aria-label="Condition" value={type} onChange={(e) => { setType(e.target.value); setValue(e.target.value === "device" ? "mobile" : ""); }}>
              <option value="device">Device</option>
              <option value="os">OS</option>
              <option value="country">Country</option>
            </Select>
            {type === "device" ? (
              <Select aria-label="Device" value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="mobile">mobile</option>
                <option value="tablet">tablet</option>
                <option value="desktop">desktop</option>
              </Select>
            ) : (
              <Input aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "os" ? "android / ios" : "IN"} aria-invalid={!!errors.conditionValue} />
            )}
            <Input aria-label="Target URL" type="url" required value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://m.example.com" aria-invalid={!!errors.targetUrl} />
            <Button type="submit" variant="secondary" loading={busy}><Plus className="size-4" /> Add rule</Button>
            {(errors.targetUrl || errors.conditionValue || errors.priority) && <p className="text-[12.5px] text-red-600 sm:col-span-4">{errors.targetUrl ?? errors.conditionValue ?? errors.priority}</p>}
          </form>
        )}
      </div>
    </Card>
  );
}
