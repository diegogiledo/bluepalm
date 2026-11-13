import { amountDue } from "@/lib/pricing";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/services";
import { Pager, pageOf } from "@/components/admin/pager";

const PER = 50;

export default async function Customers({ searchParams }: PageProps<"/admin/customers">) {
  await requireStaff();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [customers, bookings, plans] = await Promise.all([db.select("customers"), db.select("bookings"), db.select("recurring_plans")]);
  // group bookings by customer once (instead of scanning every booking for every customer)
  const byCustomer = new Map<string, typeof bookings>();
  for (const b of bookings) { const l = byCustomer.get(b.customer_id); if (l) l.push(b); else byCustomer.set(b.customer_id, [b]); }
  const rows = customers.filter((c) => !q || [c.name, c.email, c.phone].some((x) => x.toLowerCase().includes(q)))
    .map((c) => {
      const bs = byCustomer.get(c.id) ?? [];
      const done = bs.filter((b) => b.status === "completed");
      return { c, bs, done, ltv: done.reduce((s, b) => s + (amountDue(b) ?? 0), 0), plan: plans.find((p) => p.customer_id === c.id && p.status === "active"),
        last: bs.map((b) => b.date).sort().at(-1) };
    }).sort((a, b) => b.ltv - a.ltv || b.bs.length - a.bs.length);
  const { page, pages, start } = pageOf(sp.page, rows.length, PER);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-extrabold">Customers</h1>
        <form><input name="q" defaultValue={q} placeholder="Search name, email, phone" className="input w-72 py-2" /></form></div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{["Customer", "Contact", "Bookings", "Completed", "Lifetime value", "Points", "Recurring", "Last booking"].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy/5">
            {rows.slice(start, start + PER).map(({ c, bs, done, ltv, plan, last }) => (
              <tr key={c.id}>
                <td className="p-4 font-semibold">{c.name}<span className="block text-xs font-normal text-ink-muted">since {new Date(c.created_at).toLocaleDateString()}</span></td>
                <td>{c.email}<span className="block text-xs text-ink-muted">{c.phone}</span></td>
                <td>{bs.length ? <Link className="text-brand" href={`/admin/bookings?q=${encodeURIComponent(c.email)}`}>{bs.length}</Link> : 0}</td>
                <td>{done.length}</td><td>{money(ltv)}</td><td>{c.loyalty_points}</td>
                <td>{plan ? (plan.frequency === "biweekly" ? "Every 2 weeks" : "Monthly") : "—"}</td><td>{last ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-ink-muted">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={rows.length} per={PER} base="/admin/customers" params={q ? { q } : {}} />
    </div>
  );
}
