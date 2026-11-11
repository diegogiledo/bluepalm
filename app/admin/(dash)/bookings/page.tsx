import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, publicDetailerName, vehicleLabel } from "@/lib/services";
import { Badge, fmtDate } from "@/components/ui";

const FILTERS = ["all", "requested", "confirmed", "assigned", "completed", "cancelled"];

export default async function Bookings({ searchParams }: PageProps<"/admin/bookings">) {
  await requireStaff();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && FILTERS.includes(sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [bookings, customers, detailers] = await Promise.all([db.select("bookings"), db.select("customers"), db.select("detailers")]);
  const cust = Object.fromEntries(customers.map((c) => [c.id, c]));
  const det = Object.fromEntries(detailers.map((d) => [d.id, d]));
  const rows = bookings
    .filter((b) => status === "all" || b.status === status)
    .filter((b) => !q || [b.ref, b.city, b.zip, cust[b.customer_id]?.name, cust[b.customer_id]?.email].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-extrabold">Bookings</h1>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/bookings?status=${f}`} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${status === f ? "bg-brand text-white" : "bg-white ring-1 ring-navy/10"}`}>
            {f} ({f === "all" ? bookings.length : bookings.filter((b) => b.status === f).length})
          </Link>
        ))}
        <form className="ml-auto"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="Search ref, name, email, city…" className="input w-64 py-2" /></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{["Ref", "Customer", "Service", "Date", "Area", "Detailer", "Price", "Payment", "Status"].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy/5">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-sky/40">
                <td className="p-4 font-semibold"><Link href={`/admin/bookings/${b.id}`} className="text-brand hover:underline">{b.ref}</Link>{b.recurring_plan_id && <span className="ml-1 text-xs text-palm" title="Recurring">↻</span>}</td>
                <td>{cust[b.customer_id]?.name}</td>
                <td>{b.package_name}<span className="block text-xs text-ink-muted">{vehicleLabel(b.vehicle)}</span></td>
                <td>{fmtDate(b.date)}<span className="block text-xs text-ink-muted capitalize">{b.time_window}</span></td>
                <td>{b.city} {b.zip}</td>
                <td>{b.detailer_id ? publicDetailerName(det[b.detailer_id]) : b.preferred_detailer_id ? <span className="text-xs text-ink-muted">Prefers {publicDetailerName(det[b.preferred_detailer_id])}</span> : "—"}</td>
                <td>{money(b.final_price ?? b.price_estimate)}</td>
                <td><Badge status={b.payment_status} /></td>
                <td><Badge status={b.status} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="p-8 text-center text-ink-muted">No bookings match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
