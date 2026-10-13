"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMonth } from "@/lib/client/format";

export const PALETTE = ["#523956", "#AB96B5", "#7B5E8A", "#C9B8CF", "#3B5F8A", "#A7651B", "#1F7A4D", "#B23A3A"];
const axis = { fontSize: 11, fill: "#7a6b82" };
const grid = "#ece4dc";
/** Money values arrive in fils; axes and tooltips display AED. */
const aedShort = (fils: number) => { const v = fils / 100; return Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v)); };
const aedTip = (fils: number) => `AED ${(fils / 100).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;

export function MonthlyBars({ data, series, height = 260, money = false, stacked = false }: { data: object[]; series: { key: string; label: string; color?: string }[]; height?: number; money?: boolean; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="month" tick={axis} tickFormatter={(m: string) => (m?.length === 7 ? fmtMonth(m) : m)} />
        <YAxis tick={axis} tickFormatter={money ? aedShort : undefined} width={money ? 48 : 32} />
        <Tooltip formatter={(v) => (money ? aedTip(Number(v)) : Number(v).toLocaleString())} labelFormatter={(m) => (String(m).length === 7 ? fmtMonth(String(m)) : String(m))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} stackId={stacked ? "a" : undefined} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLines({ data, series, height = 260 }: { data: object[]; series: { key: string; label: string; color?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="month" tick={axis} tickFormatter={(m: string) => (m?.length === 7 ? fmtMonth(m) : m)} />
        <YAxis tick={axis} width={32} />
        <Tooltip labelFormatter={(m) => (String(m).length === 7 ? fmtMonth(String(m)) : String(m))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data, nameKey, valueKey, height = 240, money = false, color = PALETTE[0], horizontal = true }: { data: object[]; nameKey: string; valueKey: string; height?: number; money?: boolean; color?: string; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, left: horizontal ? 8 : 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? <XAxis type="number" tick={axis} tickFormatter={money ? aedShort : undefined} /> : <XAxis dataKey={nameKey} tick={axis} />}
        {horizontal ? <YAxis type="category" dataKey={nameKey} tick={axis} width={120} /> : <YAxis tick={axis} tickFormatter={money ? aedShort : undefined} width={48} />}
        <Tooltip formatter={(v) => (money ? aedTip(Number(v)) : Number(v).toLocaleString())} />
        <Bar dataKey={valueKey} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, nameKey, series, height = 260, money = false }: { data: object[]; nameKey: string; series: { key: string; label: string; color?: string }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey={nameKey} tick={axis} />
        <YAxis tick={axis} tickFormatter={money ? aedShort : undefined} width={money ? 48 : 32} />
        <Tooltip formatter={(v) => (money ? aedTip(Number(v)) : Number(v).toLocaleString())} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, nameKey, valueKey, height = 240 }: { data: object[]; nameKey: string; valueKey: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff">
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => Number(v).toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Funnel({ stages }: { stages: { stage: string; current: number; reached: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.reached));
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-3 text-xs">
          <div className="w-44 shrink-0 truncate text-muted">{s.stage}</div>
          <div className="flex-1 h-6 rounded bg-pearl overflow-hidden">
            <div className="h-full rounded" style={{ width: `${Math.max(2, (s.reached / max) * 100)}%`, background: PALETTE[i % 2 === 0 ? 0 : 2] }} />
          </div>
          <div className="w-28 shrink-0 text-right tabular-nums"><span className="font-medium text-plum-700">{s.reached}</span> reached · {s.current} now</div>
        </div>
      ))}
    </div>
  );
}
