import type { ReactNode } from "react";
import { requirePageAdmin } from "@/lib/auth/session";

/**
 * Defence in depth only. Next.js renders layouts and pages in parallel, so a layout check alone
 * does NOT stop a page from rendering: every admin page also calls requirePageAdmin() first, and
 * every admin API route calls requireAdmin().
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageAdmin();
  return <>{children}</>;
}
