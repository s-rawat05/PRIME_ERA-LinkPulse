import type { ReactNode } from "react";
import { ChainLinks, Logo, Particles } from "@/components/brand";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="hero-field relative m-2 hidden overflow-hidden rounded-[32px] p-10 lg:flex lg:flex-col">
        <Particles count={24} />
        <Logo light />
        <div className="relative mt-auto">
          <ChainLinks className="mx-auto mb-8 w-full max-w-md" />
          <h2 className="text-[40px] leading-tight font-light tracking-tight text-white">
            Every Link.
            <br />
            Smarter Insights.
          </h2>
          <p className="mt-3 max-w-md text-white/85">Short links with rules, QR codes and campaigns, plus analytics that filter out bots.</p>
        </div>
      </div>
      <div className="flex flex-col px-4 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="m-auto w-full max-w-sm py-10">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 mb-8 text-sm text-ink-soft">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
