"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  QrCode,
  Settings,
  ShieldBan,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const MAIN = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/links", label: "Links", icon: Link2 },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/qr", label: "QR Codes", icon: QrCode },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/import", label: "Bulk Import", icon: FileSpreadsheet },
  { href: "/dashboard/simulator", label: "Rule Simulator", icon: FlaskConical },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];
const ADMIN = [
  { href: "/dashboard/admin", label: "Platform", icon: Gauge, exact: true },
  { href: "/dashboard/admin/links", label: "All links", icon: ShieldCheck },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/blocklist", label: "Blocklist", icon: ShieldBan },
  { href: "/dashboard/admin/audit", label: "Audit log", icon: ListChecks },
];

type NavUser = { name: string; email: string; role: "user" | "admin" };

function NavList({ items, path, onNavigate }: { items: typeof MAIN; path: string; onNavigate?: () => void }) {
  return (
    <ul className="grid gap-0.5">
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition",
                active ? "bg-white text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-soft hover:bg-white/70 hover:text-ink",
              )}
            >
              <it.icon className={cn("size-[18px]", active ? "text-pulse-600" : "text-ink-faint")} aria-hidden />
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({ user, path, onNavigate }: { user: NavUser; path: string; onNavigate?: () => void }) {
  const router = useRouter();
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Check your connection.");
    }
  }
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo href="/dashboard" />
      <Link
        href="/dashboard/links/new"
        onClick={onNavigate}
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-pulse-500 to-pulse-700 text-[14px] font-medium text-white shadow-[0_12px_28px_-12px_rgb(31_95_232/0.9)] hover:from-pulse-600"
      >
        <Plus className="size-4" aria-hidden /> Create link
      </Link>
      <nav aria-label="Dashboard" className="grid gap-6">
        <NavList items={MAIN} path={path} onNavigate={onNavigate} />
        {user.role === "admin" && (
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">Administration</p>
            <NavList items={ADMIN} path={path} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-pulse-400 to-pulse-700 text-sm font-semibold text-white" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{user.role === "admin" ? "Administrator" : user.email}</p>
        </div>
        <button onClick={logout} className="rounded-full p-2 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: NavUser }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(path);
  if (openedAt !== path) {
    // Route changed (including back/forward): close the mobile drawer.
    setOpenedAt(path);
    setOpen(false);
  }
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-line bg-[#f7f9fe] lg:block">
        <SidebarBody user={user} path={path} />
      </aside>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full border border-line bg-white" aria-label="Open navigation" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-xs overflow-y-auto bg-[#f7f9fe] shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 rounded-full p-2 text-ink-faint hover:bg-white" aria-label="Close navigation">
              <X className="size-5" />
            </button>
            <SidebarBody user={user} path={path} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
