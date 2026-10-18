import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "blue" | "secondary" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-[#16223f] shadow-[0_8px_24px_-10px_rgb(11_22_48/0.6)]",
  blue: "bg-pulse-600 text-white hover:bg-pulse-700 shadow-[0_10px_28px_-12px_rgb(31_95_232/0.8)]",
  secondary: "bg-white text-ink border border-line hover:border-pulse-200 hover:bg-pulse-50",
  ghost: "text-ink-soft hover:bg-pulse-50 hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-700",
  glass: "glass text-white hover:bg-white/30",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({ variant, size, loading, className, children, disabled, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-xl2)] border border-line bg-white shadow-[var(--shadow-card)]", className)} {...rest} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-faint">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-ink-faint/80 outline-none transition focus:border-pulse-400 focus:ring-4 focus:ring-pulse-100 disabled:bg-canvas aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-100";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(inputBase, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "py-2.5", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(inputBase, "h-10 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237b88a3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest} />;
}

export function Field({ label, htmlFor, error, hint, children, className }: { label: ReactNode; htmlFor: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[12.5px] text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  redirected: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  imported: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  valid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  limit_reached: "bg-orange-50 text-orange-700 ring-orange-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  skipped: "bg-slate-100 text-slate-600 ring-slate-200",
  disabled: "bg-red-50 text-red-700 ring-red-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  password_failed: "bg-rose-50 text-rose-700 ring-rose-200",
  not_found: "bg-slate-100 text-slate-600 ring-slate-200",
  bot: "bg-violet-50 text-violet-700 ring-violet-200",
  admin: "bg-pulse-50 text-pulse-700 ring-pulse-200",
  qr: "bg-sky-50 text-sky-700 ring-sky-200",
  demo: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-pulse-50 text-pulse-700 ring-pulse-200",
};

export function Badge({ tone = "info", children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", BADGE[tone] ?? BADGE.info, className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return (
    <Badge tone={status}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </Badge>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-pulse-50 to-white text-pulse-600 ring-1 ring-pulse-100">{icon}</div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-faint">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-pulse-50", className)} aria-hidden />;
}
