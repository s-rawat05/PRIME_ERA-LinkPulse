import type { Metadata } from "next";
import { getDb } from "@/db";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { listUsers } from "@/lib/admin/service";
import { requirePageAdmin } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/cn";
import { UserControls } from "../actions";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsers() {
  const me = await requirePageAdmin();
  const rows = await listUsers(await getDb());
  return (
    <>
      <PageHeader title="Users" description="Manage roles and access. Disabling an account signs it out everywhere immediately." />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-canvas/60 text-[11.5px] text-ink-faint uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 text-right font-medium">Links</th>
              <th className="px-3 py-3 text-right font-medium">Clicks</th>
              <th className="px-3 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-[12px] text-ink-faint">{u.email}</p>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-1">
                    <Badge tone={u.role === "admin" ? "admin" : "expired"}>{u.role}</Badge>
                    {u.disabled_at && <Badge tone="disabled">disabled</Badge>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{u.link_count}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(Number(u.clicks))}</td>
                <td className="px-3 py-3 text-ink-soft">{formatDate(u.created_at)}</td>
                <td className="px-5 py-3"><UserControls id={u.id} role={u.role} disabled={!!u.disabled_at} self={u.id === me.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
