import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { getDb } from "@/db";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requirePageUser } from "@/lib/auth/session";
import { listLinks } from "@/lib/links/service";
import { Simulator } from "./simulator";

export const metadata: Metadata = { title: "Rule simulator" };

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const rows = await listLinks(await getDb(), { ownerId: user.id }, { limit: 300 });
  const links = rows.map(({ link: l }) => ({ id: l.id, label: `/${l.shortCode}${l.title ? ` — ${l.title}` : ""}` }));
  // Admins may open the simulator for a link they are inspecting.
  if (sp.link && !links.some((l) => l.id === sp.link) && user.role === "admin") links.unshift({ id: sp.link, label: "Inspected link (admin)" });
  return (
    <>
      <PageHeader title="Rule simulator" description="Test a link as a specific visitor, for example an Android user in India with a wrong password, and see which rule applies." />
      {links.length === 0 ? (
        <Card><EmptyState icon={<FlaskConical className="size-6" />} title="No links to simulate" description="Create a link first." action={<ButtonLink href="/dashboard/links/new" variant="blue">Create link</ButtonLink>} /></Card>
      ) : (
        <Simulator links={links} initial={links.some((l) => l.id === sp.link) ? sp.link : undefined} />
      )}
    </>
  );
}
