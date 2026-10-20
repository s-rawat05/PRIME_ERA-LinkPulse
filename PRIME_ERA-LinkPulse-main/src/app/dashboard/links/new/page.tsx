import type { Metadata } from "next";
import { getDb } from "@/db";
import { PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { shortHost } from "@/lib/config";
import { campaignOptions, listFolders, listTags } from "@/lib/org/service";
import { CreateLinkWizard } from "./wizard";

export const metadata: Metadata = { title: "Create link" };

export default async function NewLinkPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const db = await getDb();
  const [campaigns, tags, folders] = await Promise.all([campaignOptions(db, user.id), listTags(db, user.id), listFolders(db, user.id)]);
  return (
    <>
      <PageHeader title="Create a short link" description="Step 1: destination and alias. Step 2: options and rules, with validation before you publish." />
      <CreateLinkWizard
        campaigns={campaigns}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        host={shortHost()}
        defaultCampaign={campaigns.some((c) => c.id === sp.campaign) ? sp.campaign : undefined}
      />
    </>
  );
}
