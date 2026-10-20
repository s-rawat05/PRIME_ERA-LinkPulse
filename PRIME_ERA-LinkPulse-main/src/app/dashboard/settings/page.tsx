import type { Metadata } from "next";
import { getDb } from "@/db";
import { getLinkCache } from "@/lib/cache";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { listFolders, listTags } from "@/lib/org/service";
import { ListManager, PasswordForm, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const db = await getDb();
  const [tags, folders] = await Promise.all([listTags(db, user.id), listFolders(db, user.id)]);
  const integrations = [
    { name: "Link cache", value: getLinkCache().driver === "redis" ? "Upstash Redis" : getLinkCache().driver === "memory" ? "In-process (dev)" : "Disabled (database reads)", on: getLinkCache().driver === "redis" },
    { name: "Rate limiting", value: config.upstash ? "Upstash sliding window" : "Postgres fixed window", on: true },
    { name: "External URL scanning", value: config.safeBrowsingKey ? "Google Safe Browsing" : "Not configured", on: !!config.safeBrowsingKey },
    { name: "Short link domain", value: config.baseUrl, on: true },
  ];
  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description={user.role === "admin" ? "Administrator account" : "Standard account"} />
          <ProfileForm name={user.name} />
        </Card>
        <Card>
          <CardHeader title="Password" />
          <PasswordForm />
        </Card>
        <ListManager kind="tags" items={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t.link_count }))} />
        <ListManager kind="folders" items={folders.map((f) => ({ id: f.id, name: f.name }))} />
        <Card className="xl:col-span-2">
          <CardHeader title="Platform integrations" description="Configured by environment variables at deployment time" />
          <ul className="grid gap-2 p-5 sm:grid-cols-2">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13px]">
                <span className="text-ink-soft">{i.name}</span>
                <span className="flex items-center gap-2 truncate font-medium text-ink">{i.value}<Badge tone={i.on ? "active" : "expired"}>{i.on ? "on" : "off"}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
