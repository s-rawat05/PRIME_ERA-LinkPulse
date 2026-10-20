"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/interactive";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";

type Campaign = { id: string; name: string; description: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; startsAt: string | null; endsAt: string | null };

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function CampaignDialog({ campaign, trigger = "create" }: { campaign?: Campaign; trigger?: "create" | "edit" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = {
      name: fd.name,
      description: fd.description || null,
      utmSource: fd.utmSource || null,
      utmMedium: fd.utmMedium || null,
      utmCampaign: fd.utmCampaign || null,
      startsAt: fd.startsAt ? new Date(`${fd.startsAt}T00:00:00Z`).toISOString() : null,
      endsAt: fd.endsAt ? new Date(`${fd.endsAt}T23:59:59Z`).toISOString() : null,
    };
    setBusy(true);
    setErrors({});
    try {
      const r = await apiFetch<{ campaign: { id: string } }>(campaign ? `/api/campaigns/${campaign.id}` : "/api/campaigns", { method: campaign ? "PATCH" : "POST", json: body });
      toast.success(campaign ? "Campaign updated" : `Campaign “${body.name}” created`);
      setOpen(false);
      if (!campaign) router.push(`/dashboard/campaigns/${r.campaign.id}`);
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

  return (
    <>
      {trigger === "create" ? (
        <Button variant="blue" onClick={() => setOpen(true)}><Plus className="size-4" /> New campaign</Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}><Pencil className="size-4" /> Edit</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={campaign ? "Edit campaign" : "New campaign"} wide>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" name="name" required minLength={2} maxLength={80} defaultValue={campaign?.name} placeholder="Diwali Sale" autoFocus aria-invalid={!!errors.name} />
          </Field>
          <Field label="Description" htmlFor="c-desc">
            <Textarea id="c-desc" name="description" rows={2} maxLength={500} defaultValue={campaign?.description ?? ""} placeholder="Festive offers across social and print" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="UTM source" htmlFor="c-src"><Input id="c-src" name="utmSource" defaultValue={campaign?.utmSource ?? ""} placeholder="instagram" /></Field>
            <Field label="UTM medium" htmlFor="c-med"><Input id="c-med" name="utmMedium" defaultValue={campaign?.utmMedium ?? ""} placeholder="social" /></Field>
            <Field label="UTM campaign" htmlFor="c-cmp"><Input id="c-cmp" name="utmCampaign" defaultValue={campaign?.utmCampaign ?? ""} placeholder="diwali_2026" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="c-start"><Input id="c-start" name="startsAt" type="date" defaultValue={dateOnly(campaign?.startsAt ?? null)} /></Field>
            <Field label="Ends" htmlFor="c-end" error={errors.endsAt}><Input id="c-end" name="endsAt" type="date" defaultValue={dateOnly(campaign?.endsAt ?? null)} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="blue" loading={busy}>{campaign ? "Save" : "Create campaign"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteCampaign({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      toast.success("Campaign deleted; its links were kept");
      router.push("/dashboard/campaigns");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setOpen(true)}><Trash2 className="size-4" /> Delete</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Delete “${name}”?`}>
        <p className="text-sm text-ink-soft">Links in this campaign are not deleted; they simply stop belonging to a campaign. Click history is preserved.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={del} loading={busy}>Delete campaign</Button>
        </div>
      </Modal>
    </>
  );
}
