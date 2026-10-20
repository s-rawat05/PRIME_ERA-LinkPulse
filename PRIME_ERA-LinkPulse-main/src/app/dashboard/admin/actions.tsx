"use client";

import { useRouter } from "next/navigation";
import { ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";

export function TakedownButton({ id, code, disabled }: { id: string; code: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply(nextDisabled: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/links/${id}`, { method: "POST", json: { disabled: nextDisabled, reason } });
      toast.success(nextDisabled ? `/${code} disabled. The next redirect is blocked.` : `/${code} re-enabled`);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  if (disabled) {
    return <Button size="sm" variant="secondary" onClick={() => apply(false)} loading={busy}><ShieldCheck className="size-3.5" /> Re-enable</Button>;
  }
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}><ShieldBan className="size-3.5" /> Disable</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Disable /${code}?`}>
        <p className="mb-4 text-sm text-ink-soft">Redirects stop immediately (the cache entry is deleted in the same request). The owner cannot re-enable it, and all analytics are preserved.</p>
        <Field label="Reason (shown to the owner and recorded in the audit log)" htmlFor="td-reason">
          <Textarea id="td-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Phishing report" maxLength={300} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => apply(true)} loading={busy}>Disable link</Button>
        </div>
      </Modal>
    </>
  );
}

export function UserControls({ id, role, disabled, self }: { id: string; role: "user" | "admin"; disabled: boolean; self: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", json: body });
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  if (self) return <span className="text-[12px] text-ink-faint">You</span>;
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ role: role === "admin" ? "user" : "admin" }, role === "admin" ? "Admin role removed" : "Promoted to admin")}>
        {role === "admin" ? "Make user" : "Make admin"}
      </Button>
      <Button size="sm" variant={disabled ? "secondary" : "ghost"} className={disabled ? "" : "text-red-600 hover:bg-red-50"} disabled={busy} onClick={() => patch({ disabled: !disabled }, disabled ? "Account re-enabled" : "Account disabled and signed out")}>
        {disabled ? "Enable" : "Disable"}
      </Button>
    </div>
  );
}

export function BlocklistForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError(undefined);
    try {
      const r = await apiFetch<{ affectedLinks: number }>("/api/admin/blocklist", { method: "POST", json: { domain: fd.get("domain"), reason: fd.get("reason") || undefined } });
      toast.success(`Domain blocked. ${r.affectedLinks} existing link${r.affectedLinks === 1 ? "" : "s"} now stop redirecting.`);
      form.reset();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.fields.domain ?? err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <Field label="Domain" htmlFor="bl-domain" error={error} hint="Subdomains are blocked too">
        <Input id="bl-domain" name="domain" required placeholder="phishing-example.com" aria-invalid={!!error} />
      </Field>
      <Field label="Reason" htmlFor="bl-reason"><Input id="bl-reason" name="reason" placeholder="Credential phishing" maxLength={300} /></Field>
      <Button type="submit" variant="danger" loading={busy} className="sm:mt-6"><ShieldBan className="size-4" /> Block</Button>
    </form>
  );
}

export function UnblockButton({ id, domain }: { id: string; domain: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(`/api/admin/blocklist/${id}`, { method: "DELETE" });
          toast.success(`${domain} removed from the blocklist`);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
      aria-label={`Unblock ${domain}`}
    >
      <Trash2 className="size-3.5" /> Remove
    </Button>
  );
}
