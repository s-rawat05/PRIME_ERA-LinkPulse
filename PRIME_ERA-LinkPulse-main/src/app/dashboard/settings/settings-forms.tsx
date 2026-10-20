"use client";

import { useRouter } from "next/navigation";
import { FolderPlus, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/client";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/settings/profile", { method: "PATCH", json: { name: new FormData(e.currentTarget).get("name") } });
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-5">
      <Field label="Display name" htmlFor="p-name" className="min-w-[220px] flex-1">
        <Input id="p-name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Button type="submit" variant="secondary" loading={busy}>Save</Button>
    </form>
  );
}

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (fd.get("next") !== fd.get("confirm")) {
      setErrors({ confirm: "Passwords do not match" });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await apiFetch("/api/settings/password", { method: "POST", json: { current: fd.get("current"), next: fd.get("next") } });
      toast.success("Password changed");
      form.reset();
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
    <form onSubmit={submit} className="grid gap-3 p-5 sm:grid-cols-3 sm:items-start">
      <Field label="Current password" htmlFor="pw-cur" error={errors.current}><Input id="pw-cur" name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" htmlFor="pw-new" error={errors.next}><Input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={8} required /></Field>
      <Field label="Confirm" htmlFor="pw-conf" error={errors.confirm}><Input id="pw-conf" name="confirm" type="password" autoComplete="new-password" required /></Field>
      <div className="sm:col-span-3"><Button type="submit" variant="secondary" loading={busy}>Change password</Button></div>
    </form>
  );
}

type Item = { id: string; name: string; color?: string; count?: number };

export function ListManager({ kind, items }: { kind: "tags" | "folders"; items: Item[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/${kind}`, { method: "POST", json: { name } });
      setName("");
      toast.success(kind === "tags" ? "Tag created" : "Folder created");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await apiFetch(`/api/${kind}/${id}`, { method: "DELETE" });
      toast.success("Removed; links were kept");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    }
  }
  return (
    <Card>
      <CardHeader title={kind === "tags" ? "Tags" : "Folders"} description={kind === "tags" ? "Label links and filter by tag" : "Organise links into folders"} />
      <div className="p-5">
        <ul className="mb-4 flex flex-wrap gap-2">
          {items.length === 0 && <li className="text-[13px] text-ink-faint">None yet.</li>}
          {items.map((i) => (
            <li key={i.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pr-1 pl-3 text-[13px]">
              {i.color && <span className="size-2.5 rounded-full" style={{ background: i.color }} aria-hidden />}
              {i.name}
              {i.count !== undefined && <span className="text-ink-faint">· {i.count}</span>}
              <button onClick={() => remove(i.id)} className="rounded-full p-1 text-ink-faint hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${i.name}`}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input aria-label={kind === "tags" ? "New tag" : "New folder"} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "tags" ? "e.g. social" : "e.g. Print ads"} maxLength={kind === "tags" ? 32 : 60} />
          <Button type="submit" variant="secondary" loading={busy} disabled={!name.trim()}>{kind === "tags" ? <Plus className="size-4" /> : <FolderPlus className="size-4" />} Add</Button>
        </form>
      </div>
    </Card>
  );
}
