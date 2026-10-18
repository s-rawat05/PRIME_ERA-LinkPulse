"use client";

import Link from "next/link";
import { Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#analytics", label: "Analytics" },
  { href: "#campaigns", label: "Campaigns" },
  { href: "#features", label: "Features" },
];

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="relative z-30">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pt-5 sm:px-8" aria-label="Main">
        <Logo light />
        <ul className="glass hidden items-center gap-1 rounded-full p-1.5 md:flex">
          {NAV.map((n, i) => (
            <li key={n.href}>
              <a
                href={n.href}
                className={cn(
                  "block rounded-full px-4 py-2 text-[14px] font-medium transition",
                  i === 0 ? "bg-white text-ink shadow-sm" : "text-white/90 hover:bg-white/20 hover:text-white",
                )}
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/dashboard" className="glass inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium text-white hover:bg-white/30">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-white hover:bg-white/15">
                <UserRound className="size-4" aria-hidden /> Sign In
              </Link>
              <Link href="/register" className="glass inline-flex h-11 items-center rounded-full px-5 text-[14px] font-medium text-white hover:bg-white/30">
                Get Started
              </Link>
            </>
          )}
        </div>
        <button className="glass grid size-11 place-items-center rounded-full text-white md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu" aria-label="Toggle menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="glass-light mx-4 mt-3 rounded-3xl p-3 md:hidden">
          <ul className="grid gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-[15px] font-medium text-ink hover:bg-pulse-50">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
            {signedIn ? (
              <Link href="/dashboard" className="col-span-2 rounded-full bg-ink py-3 text-center text-sm font-medium text-white">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-full border border-line py-3 text-center text-sm font-medium text-ink">
                  Sign In
                </Link>
                <Link href="/register" className="rounded-full bg-ink py-3 text-center text-sm font-medium text-white">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
