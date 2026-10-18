"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/analytics/queries";

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

function TipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-card)]">
      <p className="mb-1 font-semibold text-ink">{label ? fmtDay(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-soft">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ data, height = 280 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Daily clicks chart over ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="g-clicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1f5fe8" stopOpacity={0.32} />
              <stop offset="1" stopColor="#1f5fe8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-uniques" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5bc0ff" stopOpacity={0.25} />
              <stop offset="1" stopColor="#5bc0ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e3e9f5" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "#7b88a3" }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#7b88a3" }} axisLine={false} tickLine={false} />
          <Tooltip content={<TipBox />} cursor={{ stroke: "#bdd6ff" }} />
          <Area type="monotone" dataKey="clicks" name="Human clicks" stroke="#1f5fe8" strokeWidth={2.2} fill="url(#g-clicks)" />
          <Area type="monotone" dataKey="uniques" name="Unique visitors" stroke="#38a8f5" strokeWidth={1.8} fill="url(#g-uniques)" />
          <Area type="monotone" dataKey="bots" name="Bots (excluded)" stroke="#8b5cf6" strokeWidth={1.4} strokeDasharray="4 3" fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT = ["#1f5fe8", "#38a8f5", "#8b5cf6", "#94a3b8", "#0ea5a4"];

export function DonutChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-36 shrink-0" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={46} outerRadius={66} paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT[i % DONUT.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg font-semibold text-ink">{total}</p>
            <p className="text-[10px] text-ink-faint">clicks</p>
          </div>
        </div>
      </div>
      <ul className="grid flex-1 gap-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 capitalize text-ink-soft">
              <span className="size-2.5 rounded-sm" style={{ background: DONUT[i % DONUT.length] }} aria-hidden />
              {d.label}
            </span>
            <span className="font-medium text-ink">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
