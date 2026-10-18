import Link from "next/link";
import { cn } from "@/lib/cn";

/** LinkPulse mark: two interlocking links with a pulse node. */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  const id = light ? "lp-mark-l" : "lp-mark";
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light ? "#ffffff" : "#8fbaff"} />
          <stop offset="1" stopColor={light ? "#cfe0ff" : "#1f5fe8"} />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light ? "#e9f1ff" : "#5b97ff"} />
          <stop offset="1" stopColor={light ? "#ffffff" : "#142d6b"} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={light ? "rgba(255,255,255,0.18)" : "#eef5ff"} stroke={light ? "rgba(255,255,255,0.55)" : "#dbe9ff"} />
      <rect x="7" y="13.5" width="16" height="13" rx="6.5" fill="none" stroke={`url(#${id}-a)`} strokeWidth="3.2" transform="rotate(-35 15 20)" />
      <rect x="17" y="13.5" width="16" height="13" rx="6.5" fill="none" stroke={`url(#${id}-b)`} strokeWidth="3.2" transform="rotate(-35 25 20)" />
      <circle cx="20" cy="20" r="2.6" fill={light ? "#ffffff" : "#1f5fe8"} />
    </svg>
  );
}

export function Logo({ light, href = "/", className }: { light?: boolean; href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-full", className)} aria-label="LinkPulse home">
      <LogoMark light={light} />
      <span className={cn("text-[19px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>
        Link<span className={light ? "text-white/80" : "text-pulse-600"}>Pulse</span>
      </span>
    </Link>
  );
}

/**
 * Glossy, 3D-inspired interlocking chain links. Pure SVG (no images) so it is crisp at any size.
 * The over/under illusion is drawn by repainting one half of each link above its neighbour.
 */
export function ChainLinks({ className }: { className?: string }) {
  const links = [
    { x: 40, y: 150, r: -32 },
    { x: 150, y: 110, r: -32 },
    { x: 260, y: 70, r: -32 },
  ];
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="Interlocking chain links illustration">
      <defs>
        <linearGradient id="cl-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8f1ff" />
          <stop offset="0.35" stopColor="#7fb0ff" />
          <stop offset="0.7" stopColor="#2463ec" />
          <stop offset="1" stopColor="#10306f" />
        </linearGradient>
        <linearGradient id="cl-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#bcd7ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#bcd7ff" stopOpacity="0" />
        </radialGradient>
        <filter id="cl-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#0b2a6b" floodOpacity="0.35" />
        </filter>
        {links.map((l, i) => (
          <clipPath id={`cl-front-${i}`} key={i}>
            <rect x={l.x + 60} y={l.y - 20} width="80" height="140" transform={`rotate(${l.r} ${l.x + 60} ${l.y + 45})`} />
          </clipPath>
        ))}
      </defs>
      <ellipse cx="210" cy="150" rx="200" ry="120" fill="url(#cl-glow)" />
      {[0, 1].map((pass) => (
        <g key={pass} filter={pass === 0 ? "url(#cl-shadow)" : undefined}>
          {links.map((l, i) => {
            const shape = (
              <g transform={`rotate(${l.r} ${l.x + 60} ${l.y + 45})`}>
                <rect x={l.x} y={l.y} width="120" height="90" rx="45" fill="none" stroke="url(#cl-body)" strokeWidth="26" />
                <rect x={l.x + 10} y={l.y - 6} width="96" height="30" rx="15" fill="none" stroke="url(#cl-shine)" strokeWidth="5" opacity="0.7" />
              </g>
            );
            // Pass 1 repaints the leading half of links 0 and 1 over their neighbours.
            if (pass === 1 && i < links.length - 1) return <g key={i} clipPath={`url(#cl-front-${i})`}>{shape}</g>;
            return pass === 0 ? <g key={i}>{shape}</g> : null;
          })}
        </g>
      ))}
      <circle cx="210" cy="140" r="7" fill="#ffffff" opacity="0.9" />
      <circle cx="210" cy="140" r="16" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2" />
    </svg>
  );
}

/** Decorative twinkling particles for blue surfaces. Positions are deterministic for SSR. */
export function Particles({ count = 26, className }: { count?: number; className?: string }) {
  const dots = Array.from({ length: count }, (_, i) => {
    const a = (i * 137.508) % 360;
    const x = (Math.sin(a) * 0.5 + 0.5) * 100;
    const y = ((i * 61.8) % 100);
    return { x, y, s: 1.5 + (i % 3), d: (i % 7) * 0.6 };
  });
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, animationDelay: `${d.d}s` }}
        />
      ))}
    </div>
  );
}
