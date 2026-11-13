"use client";
import Link from "next/link";
import { useAdminTheme } from "./theme-toggle";
import { deleteExpense } from "@/app/admin/actions";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";

/* ------------------------------------------------------------------------ */
/* Shared look: validated categorical palette, fixed per metric (never by rank) */
/* ------------------------------------------------------------------------ */
// light and dark steps of the same eight hues (dark steps are tuned for the dark surface)
const LIGHT_SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const DARK_SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const named = (sl: string[]) => ({ gmv: sl[0], net: sl[1], profit: sl[2], ebitda: sl[3], opex: sl[4], payout: sl[5], refunds: sl[6], discounts: sl[7] });
export const C = named(LIGHT_SLOTS);
let SLOTS = LIGHT_SLOTS, OTHER = "#a3a39b", GRID = "#e8ecf2", AXIS = "#64748b", SURFACE = "#ffffff", ZERO = "#94a3b8";
/** Switch every chart colour to the light or dark set (called at the top of each chart render). */
function applyPalette(dark: boolean) {
  SLOTS = dark ? DARK_SLOTS : LIGHT_SLOTS;
  Object.assign(C, named(SLOTS));
  OTHER = dark ? "#6b7280" : "#a3a39b"; GRID = dark ? "#243146" : "#e8ecf2"; AXIS = dark ? "#9aa8bc" : "#64748b";
  SURFACE = dark ? "#141d2c" : "#ffffff"; ZERO = dark ? "#4b5b75" : "#94a3b8";
}
const usd = (n: number, dp = 0) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const usdShort = (n: number) => Math.abs(n) >= 1000 ? `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : usd(n);
const pct = (n: number | null, dp = 1) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(dp)}%`);
const monthLabel = (m: string, long = false) => new Date(m + "-15").toLocaleDateString("en-US", long ? { month: "short", year: "numeric" } : { month: "short" });
const CURRENT = new Date().toISOString().slice(0, 7);
/** x-axis tick: the current month is still in progress, so it gets a "so far" marker */
const tick = (m: string) => monthLabel(m) + (m === CURRENT ? "*" : "");
const SoFar = () => <p className="mt-1 text-[11px] text-ink-muted">* {monthLabel(CURRENT)} so far (month in progress)</p>;

function ChartTip({ active, payload, label, fmt = usd }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-navy/10">
      {label && <p className="mb-1 font-bold text-navy">{/^\d{4}-\d{2}$/.test(label) ? monthLabel(label, true) : label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center justify-between gap-4 text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <b className="text-navy">{fmt(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Overview: revenue with gross profit beside it, last 6 months               */
/* ------------------------------------------------------------------------ */
export function RevenueProfitChart({ data }: { data: { month: string; revenue: number; profit: number }[] }) {
  applyPalette(useAdminTheme() === "dark");
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="month" tickFormatter={tick} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={usdShort} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(18,100,214,.06)" }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill={C.gmv} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar isAnimationActive={false} dataKey="profit" name="Gross profit" fill={C.profit} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Finance dashboard                                                          */
/* ------------------------------------------------------------------------ */
export type FinRow = {
  id: string; ref: string; date: string; month: string; status: string; payment: string;
  service: string; vehicle: string; county: string; city: string; detailer: string;
  customer: string; customerId: string; newCustomer: boolean; promo: string;
  list: number; discount: number; gmv: number; refund: number; netGmv: number;
  commission: number; payout: number; fee: number; profit: number; rate: number;
};
export type Expense = { id: string; month: string; category: string; amount: number; note: string };

type Agg = { month: string; gmv: number; refunds: number; netGmv: number; net: number; payout: number; fees: number; profit: number; opex: number; ebitda: number; discounts: number; jobs: number; aov: number; newCust: number; returning: number; takeRate: number | null; grossMargin: number | null; ebitdaMargin: number | null };

const METRICS = {
  gmv: { label: "Revenue (GMV)", get color() { return C.gmv; } }, net: { label: "Net revenue", get color() { return C.net; } }, profit: { label: "Gross profit", get color() { return C.profit; } },
  ebitda: { label: "EBITDA", get color() { return C.ebitda; } }, opex: { label: "Operating expenses", get color() { return C.opex; } }, payout: { label: "Detailer payouts", get color() { return C.payout; } },
  refunds: { label: "Refunds", get color() { return C.refunds; } }, discounts: { label: "Discounts", get color() { return C.discounts; } },
} as const;
type MetricKey = keyof typeof METRICS;
const RATIOS = { takeRate: { label: "Take rate", get color() { return C.net; } }, grossMargin: { label: "Gross margin", get color() { return C.profit; } }, ebitdaMargin: { label: "EBITDA margin", get color() { return C.ebitda; } } } as const;
type RatioKey = keyof typeof RATIOS;
const DIMS = { service: "Service", county: "County", vehicle: "Vehicle size", city: "City", detailer: "Detailer", customerType: "New vs returning", promo: "Promotion" } as const;
type DimKey = keyof typeof DIMS;
const MIX_METRICS = { netGmv: "Revenue", commission: "Net revenue", profit: "Gross profit", jobs: "Jobs" } as const;
type MixKey = keyof typeof MIX_METRICS;
const RANGES = { "3": "Last 3 months", "6": "Last 6 months", "12": "Last 12 months", ytd: "Year to date", all: "All time" } as const;
type RangeKey = keyof typeof RANGES;

const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m: string, k: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + k, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthSpan = (from: string, to: string) => { const out: string[] = []; for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m); return out; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const dimOf = (r: FinRow, d: DimKey) => d === "customerType" ? (r.newCustomer ? "New customer" : "Returning customer") : d === "promo" ? (r.promo || "No promotion") : r[d];

function aggregate(rows: FinRow[], expenses: Expense[], months: string[]): Agg[] {
  return months.map((month) => {
    const rs = rows.filter((r) => r.month === month);
    const sum = (k: keyof FinRow) => rs.reduce((s, r) => s + (r[k] as number), 0);
    const gmv = sum("gmv"), refunds = sum("refund"), netGmv = sum("netGmv"), net = sum("commission"), fees = sum("fee"), profit = sum("profit");
    const opex = expenses.filter((e) => e.month === month).reduce((s, e) => s + e.amount, 0);
    return {
      month, gmv: r2(gmv), refunds: r2(refunds), netGmv: r2(netGmv), net: r2(net), payout: r2(sum("payout")), fees: r2(fees), profit: r2(profit),
      opex: r2(opex), ebitda: r2(profit - opex), discounts: r2(sum("discount")), jobs: rs.length, aov: rs.length ? r2(netGmv / rs.length) : 0,
      newCust: rs.filter((r) => r.newCustomer).length, returning: rs.filter((r) => !r.newCustomer).length,
      takeRate: netGmv ? net / netGmv : null, grossMargin: net ? profit / net : null, ebitdaMargin: net ? (profit - opex) / net : null,
    };
  });
}
const total = (a: Agg[]) => {
  const s = (k: keyof Agg) => a.reduce((x, m) => x + (m[k] as number), 0);
  const netGmv = s("netGmv"), net = s("net"), profit = s("profit"), opex = s("opex"), jobs = s("jobs");
  return { gmv: s("gmv"), refunds: s("refunds"), netGmv, net, payout: s("payout"), fees: s("fees"), profit, opex, ebitda: profit - opex, discounts: s("discounts"), jobs, aov: jobs ? netGmv / jobs : 0,
    newCust: s("newCust"), returning: s("returning"), takeRate: netGmv ? net / netGmv : null, grossMargin: net ? profit / net : null, ebitdaMargin: net ? (profit - opex) / net : null };
};

function Card({ title, sub, controls, children, className = "" }: { title: string; sub?: string; controls?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-lg font-bold">{title}</h2>{sub && <p className="text-xs text-ink-muted">{sub}</p>}</div>
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
      {children}
    </section>
  );
}
function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Record<T, string>; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">{label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="input w-auto py-1 text-xs">
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </label>
  );
}
function Chips<T extends string>({ all, on, toggle, labelOf, colorOf }: { all: T[]; on: T[]; toggle: (k: T) => void; labelOf: (k: T) => string; colorOf: (k: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((k) => (
        <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on.includes(k)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${on.includes(k) ? "bg-white text-navy ring-navy/20" : "bg-transparent text-ink-muted/70 ring-navy/10"}`}>
          <span className="inline-block size-2.5 rounded-sm" style={{ background: on.includes(k) ? colorOf(k) : "#cbd5e1" }} />{labelOf(k)}
        </button>
      ))}
    </div>
  );
}
const Delta = ({ now, before, invert = false }: { now: number; before: number | null; invert?: boolean }) => {
  if (before == null || before === 0) return <span className="text-xs text-ink-muted">no prior period</span>;
  if (before < 0 || now < 0) return <span className="text-xs text-ink-muted">prior: {usd(before)}</span>;
  const d = (now - before) / Math.abs(before), good = invert ? d < 0 : d > 0;
  return <span className={`text-xs font-bold ${good ? "text-palm-600" : d === 0 ? "text-ink-muted" : "text-red-600"}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "■"} {pct(Math.abs(d), 0)} <span className="font-normal text-ink-muted">vs prior</span></span>;
};

export function FinanceDashboard({ rows, expenses, cancelled, detailersActive, expenseForm }: {
  rows: FinRow[]; expenses: Expense[]; cancelled: { month: string }[]; detailersActive: Record<string, number>; expenseForm: React.ReactNode;
}) {
  applyPalette(useAdminTheme() === "dark");
  const [range, setRange] = useState<RangeKey>("6");
  const counties = useMemo(() => ["All", ...[...new Set(rows.map((r) => r.county))].sort()], [rows]);
  const services = useMemo(() => ["All", ...[...new Set(rows.map((r) => r.service))].sort()], [rows]);
  const [county, setCounty] = useState("All");
  const [service, setService] = useState("All");
  const [trend, setTrend] = useState<MetricKey[]>(["gmv", "net", "profit"]);
  const [trendType, setTrendType] = useState<"bar" | "line">("bar");
  const [growthMetric, setGrowthMetric] = useState<MetricKey>("gmv");
  const [ratios, setRatios] = useState<RatioKey[]>(["grossMargin", "ebitdaMargin"]);
  const [dim, setDim] = useState<DimKey>("service");
  const [mixMetric, setMixMetric] = useState<MixKey>("netGmv");
  const [topMetric, setTopMetric] = useState<MixKey>("netGmv");

  const now = thisMonth();
  const first = rows.length ? rows.reduce((m, r) => (r.month < m ? r.month : m), now) : now;
  const from = range === "all" ? first : range === "ytd" ? `${now.slice(0, 4)}-01` : shiftMonth(now, -(Number(range) - 1));
  const months = monthSpan(from, now);
  const prevMonths = range === "all" ? [] : monthSpan(shiftMonth(from, -months.length), shiftMonth(from, -1));
  const filtered = rows.filter((r) => (county === "All" || r.county === county) && (service === "All" || r.service === service));
  const segmented = county !== "All" || service !== "All";
  // expenses aren't split by county or service, so they only count in the all-business view
  const exp = segmented ? [] : expenses;
  const series = aggregate(filtered, exp, months);
  const T = total(series), P = prevMonths.length ? total(aggregate(filtered, exp, prevMonths)) : null;
  const inRange = filtered.filter((r) => r.month >= from && r.month <= now);
  const cancels = cancelled.filter((c) => c.month >= from && c.month <= now).length;
  const customersInRange = new Set(inRange.map((r) => r.customerId));
  const repeatCustomers = [...customersInRange].filter((id) => rows.filter((r) => r.customerId === id).length > 1).length;

  const kpis: { k: string; v: string; d?: React.ReactNode; hint: string }[] = [
    { k: "Revenue (GMV)", v: usd(T.netGmv), d: <Delta now={T.netGmv} before={P?.netGmv ?? null} />, hint: "What customers paid, after promotions and refunds" },
    { k: "Net revenue", v: usd(T.net), d: <Delta now={T.net} before={P?.net ?? null} />, hint: "BluePalm's commission" },
    { k: "Gross profit", v: usd(T.profit), d: <Delta now={T.profit} before={P?.profit ?? null} />, hint: "Net revenue minus estimated Stripe fees" },
    { k: "Gross margin", v: pct(T.grossMargin), hint: "Gross profit ÷ net revenue" },
    { k: "EBITDA", v: segmented ? "—" : usd(T.ebitda), d: segmented ? <span className="text-xs text-ink-muted">all-business view only</span> : <Delta now={T.ebitda} before={P?.ebitda ?? null} />, hint: "Gross profit minus operating expenses" },
    { k: "EBITDA margin", v: segmented ? "—" : pct(T.ebitdaMargin), hint: "EBITDA ÷ net revenue" },
    { k: "Take rate", v: pct(T.takeRate), hint: "Net revenue ÷ revenue" },
    { k: "Completed jobs", v: String(T.jobs), d: <Delta now={T.jobs} before={P?.jobs ?? null} />, hint: "Finished bookings in the period" },
    { k: "Average ticket", v: usd(T.aov, 2), d: <Delta now={T.aov} before={P?.aov ?? null} />, hint: "Revenue ÷ completed jobs" },
    { k: "Refund rate", v: pct(T.gmv ? T.refunds / T.gmv : null), d: <Delta now={T.gmv ? T.refunds / T.gmv : 0} before={P && P.gmv ? P.refunds / P.gmv : null} invert />, hint: "Refunds ÷ revenue before refunds" },
    { k: "Repeat customers", v: pct(customersInRange.size ? repeatCustomers / customersInRange.size : null, 0), hint: "Customers in the period with more than one job ever" },
    { k: "Cancellations", v: String(cancels), hint: "Bookings cancelled in the period" },
  ];

  const growth = series.filter((m) => m.month !== CURRENT).map((m, i, done) => {
    const prev = i ? done[i - 1][growthMetric] : P ? aggregate(filtered, exp, [shiftMonth(m.month, -1)])[0][growthMetric] : 0;
    return { month: m.month, value: prev ? (m[growthMetric] - prev) / Math.abs(prev) : null };
  });

  const mix = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of inRange) by.set(dimOf(r, dim), (by.get(dimOf(r, dim)) ?? 0) + (mixMetric === "jobs" ? 1 : r[mixMetric]));
    const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5), rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const list = [...top, ...(rest ? [["Other", rest] as [string, number]] : [])];
    const sum = list.reduce((s, [, v]) => s + v, 0);
    // colour follows the name (fixed per category in this dimension), not the rank
    const names = [...new Set(rows.map((r) => dimOf(r, dim)))].sort();
    return list.map(([name, value]) => ({ name, value: r2(value), share: sum ? value / sum : 0, color: name === "Other" ? OTHER : SLOTS[names.indexOf(name) % 6] }));
  }, [inRange, dim, mixMetric, rows]);

  const topDetailers = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of inRange) if (r.detailer !== "Unassigned") by.set(r.detailer, (by.get(r.detailer) ?? 0) + (topMetric === "jobs" ? 1 : r[topMetric]));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: name.length > 26 ? name.slice(0, 25) + "…" : name, value: r2(value) }));
  }, [inRange, topMetric]);

  const fmtMix = (n: number) => (mixMetric === "jobs" ? `${n} jobs` : usd(n, 0));
  const toggle = <T,>(list: T[], set: (v: T[]) => void, k: T) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const axis = { tick: { fill: AXIS, fontSize: 12 }, axisLine: false, tickLine: false } as const;

  return (
    <div className="space-y-6">
      {/* one row of filters above everything */}
      <div className="card sticky top-2 z-20 flex flex-wrap items-center gap-3 p-3">
        <Select label="Period" value={range} onChange={setRange} options={RANGES} />
        <Select label="County" value={county} onChange={setCounty} options={Object.fromEntries(counties.map((c) => [c, c]))} />
        <Select label="Service" value={service} onChange={setService} options={Object.fromEntries(services.map((c) => [c, c]))} />
        <span className="text-xs text-ink-muted">{monthLabel(from, true)} – {monthLabel(now, true)} · {inRange.length} completed jobs{segmented ? " · expenses hidden while filtered" : ""}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {kpis.map((t) => (
          <div key={t.k} className="card p-4" title={t.hint}>
            <p className="text-xs text-ink-muted">{t.k}</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{t.v}</p>
            <div className="mt-1 min-h-4">{t.d}</div>
          </div>
        ))}
      </div>

      <Card title="Monthly performance" sub="Pick what to show. All values in dollars."
        controls={<>
          <div className="flex overflow-hidden rounded-full ring-1 ring-navy/15 text-xs font-semibold">
            {(["bar", "line"] as const).map((t) => <button key={t} type="button" onClick={() => setTrendType(t)} className={`px-3 py-1 ${trendType === t ? "bg-navy text-white" : "text-ink-muted"}`}>{t === "bar" ? "Bars" : "Lines"}</button>)}
          </div>
        </>}>
        <Chips all={Object.keys(METRICS) as MetricKey[]} on={trend} toggle={(k) => toggle(trend, setTrend, k)} labelOf={(k) => METRICS[k].label} colorOf={(k) => METRICS[k].color} />
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            {trendType === "bar" ? (
              <BarChart data={series} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis tickFormatter={usdShort} {...axis} width={56} />
                <ReferenceLine y={0} stroke={ZERO} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(18,100,214,.06)" }} />
                {trend.length > 1 && <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />}
                {(Object.keys(METRICS) as MetricKey[]).filter((k) => trend.includes(k)).map((k) => (
                  <Bar isAnimationActive={false} key={k} dataKey={k} name={METRICS[k].label} fill={METRICS[k].color} radius={[4, 4, 0, 0]} maxBarSize={26} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis tickFormatter={usdShort} {...axis} width={56} />
                <ReferenceLine y={0} stroke={ZERO} />
                <Tooltip content={<ChartTip />} />
                {trend.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
                {(Object.keys(METRICS) as MetricKey[]).filter((k) => trend.includes(k)).map((k) => (
                  <Line isAnimationActive={false} key={k} type="linear" dataKey={k} name={METRICS[k].label} stroke={METRICS[k].color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: SURFACE }} activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        <SoFar />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Month-over-month growth" sub="Change versus the month before (finished months only)"
          controls={<Select label="Metric" value={growthMetric} onChange={setGrowthMetric} options={Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.label])) as Record<MetricKey, string>} />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axis} width={48} />
                <ReferenceLine y={0} stroke={ZERO} />
                <Tooltip content={<ChartTip fmt={(n) => pct(n)} />} cursor={{ fill: "rgba(18,100,214,.06)" }} />
                <Bar isAnimationActive={false} dataKey="value" name={`${METRICS[growthMetric].label} growth`} radius={[4, 4, 4, 4]} maxBarSize={36}>
                  {growth.map((g) => <Cell key={g.month} fill={(g.value ?? 0) >= 0 ? C.gmv : C.net} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-ink-muted"><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: C.gmv }} />growth <span className="ml-3 mr-1 inline-block size-2.5 rounded-sm" style={{ background: C.net }} />decline</p>
        </Card>

        <Card title="Margins" sub="As a share of revenue (take rate) or of net revenue (margins)">
          <Chips all={Object.keys(RATIOS) as RatioKey[]} on={ratios} toggle={(k) => toggle(ratios, setRatios, k)} labelOf={(k) => RATIOS[k].label} colorOf={(k) => RATIOS[k].color} />
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axis} width={48} />
                <ReferenceLine y={0} stroke={ZERO} />
                <Tooltip content={<ChartTip fmt={(n) => pct(n)} />} />
                {ratios.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
                {(Object.keys(RATIOS) as RatioKey[]).filter((k) => ratios.includes(k) && !(segmented && k === "ebitdaMargin")).map((k) => (
                  <Line isAnimationActive={false} key={k} type="linear" dataKey={k} name={RATIOS[k].label} stroke={RATIOS[k].color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: SURFACE }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <SoFar />
        </Card>

        <Card title="Revenue mix" sub="Top 5, the rest grouped as Other"
          controls={<>
            <Select label="By" value={dim} onChange={setDim} options={DIMS} />
            <Select label="Measure" value={mixMetric} onChange={setMixMetric} options={MIX_METRICS} />
          </>}>
          {mix.length ? (
            <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke={SURFACE} strokeWidth={2} isAnimationActive={false}>
                      {mix.map((m) => <Cell key={m.name} fill={m.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTip fmt={fmtMix} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 text-sm">
                {mix.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2"><span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: m.color }} /><span className="leading-tight">{m.name}</span></span>
                    <span className="shrink-0 text-ink-muted"><b className="text-navy">{fmtMix(m.value)}</b> · {pct(m.share, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-sm text-ink-muted">No completed jobs in this period.</p>}
        </Card>

        <Card title="Top detailers" sub="Who earns BluePalm the most"
          controls={<Select label="Measure" value={topMetric} onChange={setTopMetric} options={MIX_METRICS} />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDetailers} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tickFormatter={topMetric === "jobs" ? undefined : usdShort} {...axis} />
                <YAxis type="category" dataKey="name" width={150} {...axis} tick={{ fill: AXIS === "#64748b" ? "#0B2342" : "#e3e9f3", fontSize: 11 }} />
                <Tooltip content={<ChartTip fmt={(n) => (topMetric === "jobs" ? `${n} jobs` : usd(n))} />} cursor={{ fill: "rgba(18,100,214,.06)" }} />
                <Bar isAnimationActive={false} dataKey="value" name={MIX_METRICS[topMetric]} fill={C.gmv} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Jobs per month" sub="New vs returning customers">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis allowDecimals={false} {...axis} width={36} />
                <Tooltip content={<ChartTip fmt={(n) => `${n} jobs`} />} cursor={{ fill: "rgba(18,100,214,.06)" }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="newCust" name="New customers" stackId="j" fill={C.gmv} maxBarSize={36} stroke={SURFACE} strokeWidth={1} />
                <Bar isAnimationActive={false} dataKey="returning" name="Returning" stackId="j" fill={C.profit} radius={[4, 4, 0, 0]} maxBarSize={36} stroke={SURFACE} strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Average ticket" sub="Revenue per completed job">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="month" tickFormatter={tick} {...axis} />
                <YAxis tickFormatter={(v) => usd(v)} {...axis} width={48} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip fmt={(n) => usd(n, 2)} />} />
                <Line isAnimationActive={false} type="linear" dataKey="aov" name="Average ticket" stroke={C.gmv} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: SURFACE }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <PnL series={series} total={T} segmented={segmented} expenses={exp.filter((e) => e.month >= from && e.month <= now)} detailersActive={detailersActive} />

      <Card title="Operating expenses" sub="Enter what BluePalm spends each month (marketing, software, insurance…). Used for EBITDA.">
        {expenseForm}
        <ExpenseList expenses={expenses.filter((e) => e.month >= from && e.month <= now)} />
      </Card>

      <Report rows={inRange} />
    </div>
  );
}

/* ---------------------------- P&L statement ---------------------------- */
function PnL({ series, total: T, segmented, expenses, detailersActive }: { series: Agg[]; total: ReturnType<typeof total>; segmented: boolean; expenses: Expense[]; detailersActive: Record<string, number> }) {
  const cats = [...new Set(expenses.map((e) => e.category))].sort();
  const catSum = (m: string | null, c: string) => expenses.filter((e) => (m == null || e.month === m) && e.category === c).reduce((s, e) => s + e.amount, 0);
  type Line = { label: string; get: (a: Agg | null) => number | null; fmt?: (n: number | null) => string; strong?: boolean; indent?: boolean; minus?: boolean };
  const v = (k: keyof Agg) => (a: Agg | null) => (a ? (a[k] as number) : (T as unknown as Record<string, number>)[k]);
  const lines: Line[] = [
    { label: "Revenue before refunds", get: v("gmv") },
    { label: "Refunds", get: v("refunds"), minus: true, indent: true },
    { label: "Revenue (GMV)", get: v("netGmv"), strong: true },
    { label: "Detailer payouts", get: v("payout"), minus: true, indent: true },
    { label: "Net revenue", get: v("net"), strong: true },
    { label: "Stripe fees (est.)", get: v("fees"), minus: true, indent: true },
    { label: "Gross profit", get: v("profit"), strong: true },
    { label: "Gross margin", get: (a) => (a ? a.grossMargin : T.grossMargin), fmt: (n) => pct(n) },
    ...(segmented ? [] : [
      ...cats.map((c) => ({ label: c, get: (a: Agg | null) => catSum(a?.month ?? null, c), minus: true, indent: true })),
      { label: "Operating expenses", get: v("opex"), minus: true },
      { label: "EBITDA", get: v("ebitda"), strong: true },
      { label: "EBITDA margin", get: (a: Agg | null) => (a ? a.ebitdaMargin : T.ebitdaMargin), fmt: (n: number | null) => pct(n) },
    ]),
    { label: "Completed jobs", get: v("jobs"), fmt: (n) => String(n ?? 0) },
    { label: "Average ticket", get: v("aov"), fmt: (n) => usd(n ?? 0, 2) },
    { label: "Active detailers", get: (a) => (a ? detailersActive[a.month] ?? 0 : null), fmt: (n) => (n == null ? "—" : String(n)) },
  ];
  return (
    <Card title="Profit & loss" sub={segmented ? "Filtered by county or service: operating expenses and EBITDA are hidden because expenses aren't split that way." : "Monthly statement for the selected period. Stripe fees are estimated at 2.9% + 30¢ per charge."}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-right text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-muted">
            <tr><th className="p-2 text-left">Line</th>{series.map((m) => <th key={m.month} className="whitespace-nowrap p-2">{monthLabel(m.month, true)}</th>)}<th className="p-2">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-navy/5">
            {lines.map((l) => (
              <tr key={l.label} className={l.strong ? "bg-sky/40 font-bold" : ""}>
                <td className={`whitespace-nowrap p-2 text-left ${l.indent ? "pl-6 text-ink-muted" : ""}`}>{l.minus ? "− " : ""}{l.label}</td>
                {[...series, null].map((a, i) => {
                  const n = l.get(a);
                  return <td key={i} className="whitespace-nowrap p-2 tabular-nums">{l.fmt ? l.fmt(n) : usd(n ?? 0)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExpenseList({ expenses }: { expenses: Expense[] }) {
  if (!expenses.length) return <p className="mt-3 text-sm text-ink-muted">No expenses entered for this period.</p>;
  const sorted = [...expenses].sort((a, b) => b.month.localeCompare(a.month) || a.category.localeCompare(b.category));
  return (
    <div className="mt-4 max-h-72 overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-ink-muted"><tr><th className="p-2">Month</th><th className="p-2">Category</th><th className="p-2">Note</th><th className="p-2 text-right">Amount</th><th className="p-2" /></tr></thead>
        <tbody className="divide-y divide-navy/5">
          {sorted.map((e) => (
            <tr key={e.id}><td className="p-2">{monthLabel(e.month, true)}</td><td className="p-2">{e.category}</td><td className="p-2 text-ink-muted">{e.note}</td><td className="p-2 text-right tabular-nums">{usd(e.amount, 2)}</td>
              <td className="p-2 text-right"><form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><button className="text-xs font-semibold text-red-600 underline">Delete</button></form></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- detailed report ---------------------------- */
const COLS: { k: keyof FinRow; label: string; money?: boolean }[] = [
  { k: "date", label: "Date" }, { k: "ref", label: "Booking" }, { k: "customer", label: "Customer" }, { k: "service", label: "Service" },
  { k: "county", label: "County" }, { k: "detailer", label: "Detailer" }, { k: "list", label: "List price", money: true }, { k: "discount", label: "Discount", money: true },
  { k: "refund", label: "Refund", money: true }, { k: "netGmv", label: "Revenue", money: true }, { k: "payout", label: "Detailer pay", money: true },
  { k: "commission", label: "Net revenue", money: true }, { k: "fee", label: "Stripe fee", money: true }, { k: "profit", label: "Gross profit", money: true },
];
function Report({ rows }: { rows: FinRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: keyof FinRow; desc: boolean }>({ k: "date", desc: true });
  const [page, setPage] = useState(0);
  const PER = 50;
  const shown = rows
    .filter((r) => !q || [r.ref, r.customer, r.service, r.county, r.city, r.detailer, r.promo].some((x) => x.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => { const x = a[sort.k], y = b[sort.k]; const c = typeof x === "number" ? (x as number) - (y as number) : String(x).localeCompare(String(y)); return sort.desc ? -c : c; });
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const sums = Object.fromEntries(COLS.filter((c) => c.money).map((c) => [c.k, shown.reduce((s, r) => s + (r[c.k] as number), 0)]));
  return (
    <Card title="Detailed report" sub={`Every completed job in the period (${shown.length}). Click a column to sort, a booking to open it.`}
      controls={<input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search booking, customer, detailer…" className="input w-64 py-1.5 text-sm" />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-muted">
            <tr>{COLS.map((c) => (
              <th key={c.k} className={`whitespace-nowrap p-2 ${c.money ? "text-right" : "text-left"}`}>
                <button type="button" onClick={() => setSort({ k: c.k, desc: sort.k === c.k ? !sort.desc : true })} className="uppercase hover:text-navy">
                  {c.label}{sort.k === c.k ? (sort.desc ? " ↓" : " ↑") : ""}</button>
              </th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-navy/5">
            {shown.slice(page * PER, page * PER + PER).map((r) => (
              <tr key={r.id} className="hover:bg-sky/40">
                {COLS.map((c) => (
                  <td key={c.k} className={`whitespace-nowrap p-2 ${c.money ? "text-right tabular-nums" : ""}`}>
                    {c.k === "ref" ? <Link href={`/admin/bookings/${r.id}`} className="font-semibold text-brand underline">{r.ref}</Link>
                      : c.money ? ((r[c.k] as number) ? usd(r[c.k] as number, 2) : "—") : String(r[c.k])}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={COLS.length} className="p-8 text-center text-ink-muted">No completed jobs match.</td></tr>}
          </tbody>
          {shown.length > 0 && (
            <tfoot className="border-t-2 border-navy/10 font-bold">
              <tr>{COLS.map((c, i) => <td key={c.k} className={`whitespace-nowrap p-2 ${c.money ? "text-right tabular-nums" : ""}`}>{i === 0 ? "Total" : c.money ? usd(sums[c.k], 2) : ""}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={!page} onClick={() => setPage(page - 1)} className="btn-ghost btn-sm disabled:opacity-40">← Prev</button>
          <span className="text-ink-muted">Page {page + 1} of {pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="btn-ghost btn-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </Card>
  );
}
