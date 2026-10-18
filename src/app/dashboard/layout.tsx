import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { requirePageUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
