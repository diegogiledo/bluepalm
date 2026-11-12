import { amountDue } from "@/lib/pricing";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
import { money, todayFL, vehicleLabel } from "@/lib/services";
import { Badge, fmtDate } from "@/components/ui";

export default async function Overview({ searchParams }: PageProps<"/admin">) {
  const staff = await requireStaff();
  const { denied } = await searchParams;
  const [bookings, detailers, plans, customers] = await Promise.all([db.select("bookings"), db.select("detailers"), db.select("recurring_plans"), db.select("customers")]);
  const defaultRate = await getSetting("commission_rate", 0.2);
  const today = todayFL();
  const completed = bookings.filter((b) => b.status === "completed");
  const gross = completed.reduce((s, b) => s + (amountDue(b) ?? 0), 0);
  const commission = completed.reduce((s, b) => s + (amountDue(b) ?? 0) * (b.commission_rate ?? defaultRate), 0);
  const refunds = bookings.reduce((s, b) => s + b.refund_amount, 0);
  const rated = completed.filter((b) => b.customer_rating != null);
  const avg = rated.length ? rated.reduce((s, b) => s + (b.customer_rating ?? 0), 0) / rated.length : null;
  const requested = bookings.filter((b) => b.status === "requested").sort((a, b) => a.date.localeCompare(b.date));
  const unassigned = bookings.filter((b) => b.status === "confirmed" && b.date >= today);
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;

  // last 6 months revenue
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const byMonth = months.map((m) => ({ m, v: completed.filter((b) => (b.completed_at ?? b.date).startsWith(m)).reduce((s, b) => s + (amountDue(b) ?? 0), 0) }));
  const max = Math.max(1, ...byMonth.map((x) => x.v));

  const tiles: [string, string, string?][] = [
    ["Awaiting confirmation", String(requested.length), "/admin/bookings?status=requested"],
    ["Confirmed, unassigned", String(unassigned.length), "/admin/bookings?status=confirmed"],
    ["Completed jobs", String(completed.length), "/admin/bookings?status=completed"],
    ["Gross bookings", money(gross)],
    ["Platform commission", money(Math.round(commission * 100) / 100)],
    ["Refunds issued", money(refunds)],
    ["Customers", String(customers.length), "/admin/customers"],
    ["Active recurring plans", String(plans.filter((p) => p.status === "active").length), "/admin/recurring"],
    ["Pending applications", String(detailers.filter((d) => d.status === "pending").length), "/admin/detailers"],
    ["Approved detailers", String(detailers.filter((d) => d.status === "approved").length), "/admin/detailers"],
    ["Avg. rating", avg ? `${avg.toFixed(2)} ★ (${rated.length})` : "—"],
    ["Cancellation rate", bookings.length ? `${Math.round((cancelled / bookings.length) * 100)}%` : "—"],
  ];

  return (
    <div className="space-y-8">
      <div><h1 className="font-display text-3xl font-extrabold">Overview</h1><p className="text-ink-muted">Live figures from the BluePalm database.</p></div>
      {denied && <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">Your role ({staff.role}) doesn&apos;t have access to that page.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([k, v, href]) => {
          const body = <><p className="text-sm text-ink-muted">{k}</p><p className="mt-1 font-display text-2xl font-extrabold">{v}</p></>;
          return href ? <Link key={k} href={href} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">{body}</Link> : <div key={k} className="card p-5">{body}</div>;
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <section className="card p-6">
          <h2 className="font-display text-lg font-bold">Completed revenue, last 6 months</h2>
          <div className="mt-6 flex h-48 items-end gap-3">
            {byMonth.map(({ m, v }) => (
              <div key={m} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted">{v ? money(v) : ""}</span>
                <div className="w-full rounded-t-lg bg-brand" style={{ height: `${Math.max(2, (v / max) * 140)}px`, opacity: v ? 1 : 0.15 }} />
                <span className="text-xs text-ink-muted">{new Date(m + "-15").toLocaleDateString("en-US", { month: "short" })}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Requests to review</h2><Link href="/admin/bookings" className="text-sm font-semibold text-brand">All bookings →</Link></div>
          {!requested.length && <p className="mt-4 text-sm text-ink-muted">No pending requests. New booking requests appear here.</p>}
          <ul className="mt-4 divide-y divide-navy/5">
            {requested.slice(0, 8).map((b) => (
              <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand">
                <span><b>{b.ref}</b> · {b.package_name} · {vehicleLabel(b.vehicle)}<span className="block text-xs text-ink-muted">{b.city} {b.zip} · {fmtDate(b.date)}</span></span>
                <Badge status={b.status} /></Link></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
