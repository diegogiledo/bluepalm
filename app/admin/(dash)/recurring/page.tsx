import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicDetailerName, todayFL, vehicleLabel } from "@/lib/services";
import { Badge, fmtDate } from "@/components/ui";
import { Submit } from "@/components/portal-forms";
import { generateRecurring, setPlanStatus } from "../../actions";

export default async function Recurring() {
  await requireStaff();
  const [plans, customers, packages, detailers, bookings] = await Promise.all([db.select("recurring_plans"), db.select("customers"), db.select("packages"), db.select("detailers"), db.select("bookings")]);
  const today = todayFL();
  const rows = plans.sort((a, b) => a.next_date.localeCompare(b.next_date));
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-extrabold">Recurring customers</h1>
        <p className="text-ink-muted">Create the next visit as a booking request when it&apos;s due. Customers can pause or cancel from their account.</p></div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{["Customer", "Plan", "Vehicle / area", "Preferred detailer", "Visits", "Next visit", "Status", ""].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-navy/5">
            {rows.map((p) => {
              const c = customers.find((x) => x.id === p.customer_id);
              const d = detailers.find((x) => x.id === p.preferred_detailer_id);
              const due = p.status === "active" && p.next_date <= today;
              return (
                <tr key={p.id}>
                  <td className="p-4 font-semibold">{c?.name}<span className="block text-xs font-normal text-ink-muted">{c?.email}</span></td>
                  <td>{packages.find((x) => x.id === p.package_id)?.name ?? "Custom"}<span className="block text-xs text-ink-muted">{p.frequency === "biweekly" ? "Every 2 weeks" : "Monthly"}</span></td>
                  <td>{vehicleLabel(p.vehicle)}<span className="block text-xs text-ink-muted">{p.city} {p.zip}</span></td>
                  <td>{d ? publicDetailerName(d) : "—"}</td>
                  <td>{bookings.filter((b) => b.recurring_plan_id === p.id).length}</td>
                  <td className={due ? "font-bold text-amber-700" : ""}>{fmtDate(p.next_date)}{due && " (due)"}</td>
                  <td><Badge status={p.status} /></td>
                  <td className="space-x-2 whitespace-nowrap pr-4">
                    {p.status === "active" && <form action={generateRecurring} className="inline"><input type="hidden" name="id" value={p.id} /><Submit className="btn-primary btn-sm">Create next booking</Submit></form>}
                    {p.status !== "cancelled" && <form action={setPlanStatus} className="inline"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "active" ? "paused" : "active"} /><Submit className="btn-ghost btn-sm">{p.status === "active" ? "Pause" : "Resume"}</Submit></form>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-ink-muted">No recurring plans yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
