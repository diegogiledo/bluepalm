import { requireStaff } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
import { money } from "@/lib/services";
import { Badge } from "@/components/ui";
import { Submit } from "@/components/portal-forms";
import { reviewDetailer, updateDetailer } from "../../actions";

export default async function Detailers() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const [detailers, bookings] = await Promise.all([db.select("detailers"), db.select("bookings")]);
  const defaultRate = await getSetting("commission_rate", 0.2);
  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 } as const;
  const rows = detailers.sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-extrabold">Detailers</h1>
        <p className="text-ink-muted">Review applications, track onboarding and verification, and set commission overrides.</p></div>
      {!rows.length && <p className="card p-8 text-center text-ink-muted">No applications yet. Share <b>/become-a-detailer</b> to recruit.</p>}
      <ul className="space-y-4">
        {rows.map((d) => {
          const jobs = bookings.filter((b) => b.detailer_id === d.id && b.status === "completed");
          const rated = jobs.filter((b) => b.customer_rating != null);
          const avg = rated.length ? rated.reduce((s, b) => s + (b.customer_rating ?? 0), 0) / rated.length : null;
          const earned = jobs.reduce((s, b) => s + (b.final_price ?? 0) * (1 - (b.commission_rate ?? defaultRate)), 0);
          return (
            <li key={d.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 font-display text-xl font-bold">{d.name} <Badge status={d.status} /></p>
                  <p className="text-sm text-ink-muted">{d.email} · {d.phone}{d.business_name ? ` · ${d.business_name}` : ""} · {d.business_type}{d.ein_last4 ? ` · EIN …${d.ein_last4}` : ""}</p>
                  <p className="mt-1 text-sm">{d.counties.join(", ")} · {d.availability.join(", ")} · {d.years_experience} yrs</p>
                  <p className="mt-1 text-sm text-ink-muted">Applied {new Date(d.created_at).toLocaleDateString()} · Agreement accepted {new Date(d.agreement_accepted_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right text-sm"><p>{jobs.length} completed · {avg ? `${avg.toFixed(1)} ★` : "no ratings"}</p><p className="text-ink-muted">Detailer earnings {money(Math.round(earned * 100) / 100)}</p></div>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Experience, documents & onboarding</summary>
                <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-sky/50 p-4 text-sm">{d.experience}</p>
                <p className="mt-3 text-sm">Insurance: {d.insurance_file
                  ? (isAdmin ? <a className="font-semibold text-brand underline" href={`/admin/files/${d.insurance_file}`} target="_blank" rel="noreferrer">View certificate</a> : "on file")
                  : <span className="text-amber-700">not uploaded</span>}{d.insurance_expires ? ` · expires ${d.insurance_expires}` : ""}</p>
                {isAdmin && (
                  <form action={updateDetailer} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={d.id} />
                    <fieldset className="flex flex-wrap gap-4 text-sm sm:col-span-2">
                      {([["insurance_verified", "Insurance verified"], ["background_check", "Background check passed"], ["orientation", "Orientation complete"], ["payouts_connected", "Payouts connected"]] as const).map(([k, l]) => (
                        <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={d.onboarding[k]} className="accent-brand" /> {l}</label>
                      ))}
                    </fieldset>
                    <label className="text-sm font-semibold">Commission override (%)<input name="commission_rate" type="number" min="0" max="60" step="0.5" defaultValue={d.commission_rate != null ? d.commission_rate * 100 : ""} placeholder={`Default ${(defaultRate * 100).toFixed(0)}%`} className="input mt-1 py-2" /></label>
                    <label className="text-sm font-semibold">Internal notes<textarea name="admin_notes" defaultValue={d.admin_notes} className="input mt-1 min-h-11 py-2" /></label>
                    <div><Submit className="btn-primary btn-sm">Save onboarding</Submit></div>
                  </form>
                )}
              </details>
              {isAdmin && (
                <form action={reviewDetailer} className="mt-4 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  {d.status !== "approved" && <button name="decision" value="approve" className="btn-green btn-sm">Approve</button>}
                  {d.status === "pending" && <button name="decision" value="reject" className="btn-ghost btn-sm text-red-600">Reject</button>}
                  {d.status === "approved" && <button name="decision" value="suspend" className="btn-ghost btn-sm text-red-600">Suspend</button>}
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
