import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db, one } from "@/lib/db";
import { commissionFor, money, vehicleLabel, windowLabel } from "@/lib/services";
import { stripeEnabled } from "@/lib/stripe";
import { Badge, Thread, fmtDate } from "@/components/ui";
import { Submit } from "@/components/portal-forms";
import { adminMessage, assignDetailer, cancelOrRefund, markPaid, sendPaymentLink, setBookingStatus, updatePricing } from "../../../actions";

export default async function BookingDetail({ params }: PageProps<"/admin/bookings/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  const b = await one("bookings", { id });
  if (!b) notFound();
  const [c, zip, detailers, messages, history] = await Promise.all([
    one("customers", { id: b.customer_id }), one("service_zips", { zip: b.zip }), db.select("detailers", { status: "approved" }),
    db.select("messages", { booking_id: b.id }), db.select("bookings", { customer_id: b.customer_id }),
  ]);
  const eligible = detailers.filter((d) => zip && d.counties.includes(zip.county));
  const rate = b.commission_rate ?? (await commissionFor(b.detailer_id));
  const price = b.final_price ?? b.price_estimate;
  const isAdmin = staff.role === "admin";
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

  return (
    <div className="space-y-6">
      <Link href="/admin/bookings" className="text-sm font-semibold text-brand">← Bookings</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold">{b.ref}</h1><Badge status={b.status} /><Badge status={b.payment_status} />
        {b.recurring_plan_id && <span className="rounded-full bg-palm/15 px-2.5 py-1 text-xs font-bold text-palm-600">Recurring</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card p-6 xl:col-span-2">
          <h2 className="font-display text-lg font-bold">Booking</h2>
          <dl className="mt-3 divide-y divide-navy/5 text-sm">
            <Row k="Service" v={b.package_name} />
            <Row k="Vehicle" v={`${vehicleLabel(b.vehicle)}${b.vehicle_details ? ` — ${b.vehicle_details}` : ""}`} />
            <Row k="Date & window" v={`${fmtDate(b.date)} · ${windowLabel(b.time_window)}`} />
            <Row k="Location" v={`${b.address}, ${b.city} ${b.zip}${zip ? ` (${zip.county})` : ""}`} />
            <Row k="Instructions" v={b.instructions || "—"} />
            <Row k="Starting price" v={money(b.price_estimate)} />
            <Row k="Final price" v={money(b.final_price)} />
            <Row k="Commission" v={`${(rate * 100).toFixed(0)}%${price != null ? ` = ${money(Math.round(price * rate * 100) / 100)} platform / ${money(Math.round(price * (1 - rate) * 100) / 100)} detailer` : ""}`} />
            {b.refund_amount > 0 && <Row k="Refunded" v={money(b.refund_amount)} />}
            {b.cancel_reason && <Row k="Cancellation" v={b.cancel_reason} />}
            {b.customer_rating != null && <Row k="Rating" v={`${b.customer_rating} ★ ${b.customer_feedback ? `— “${b.customer_feedback}”` : ""}`} />}
            <Row k="Submitted" v={new Date(b.created_at).toLocaleString()} />
          </dl>
        </section>
        <section className="card p-6">
          <h2 className="font-display text-lg font-bold">Customer</h2>
          {c && <dl className="mt-3 divide-y divide-navy/5 text-sm">
            <Row k="Name" v={c.name} /><Row k="Email" v={<a className="text-brand" href={`mailto:${c.email}`}>{c.email}</a>} />
            <Row k="Phone" v={c.phone} /><Row k="Bookings" v={history.length} /><Row k="Loyalty points" v={c.loyalty_points} />
          </dl>}
          <Link href={`/admin/customers?q=${encodeURIComponent(c?.email ?? "")}`} className="mt-3 inline-block text-sm font-semibold text-brand">Customer history →</Link>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-5 p-6">
          <h2 className="font-display text-lg font-bold">Manage</h2>
          <div className="flex flex-wrap gap-2">
            {b.status === "requested" && <form action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="confirmed" /><Submit className="btn-green btn-sm">Confirm request & notify customer</Submit></form>}
            {["assigned", "confirmed"].includes(b.status) && <form action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="completed" /><Submit className="btn-primary btn-sm">Mark completed</Submit></form>}
          </div>
          {!["completed", "cancelled"].includes(b.status) && (
            <form action={assignDetailer} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={b.id} />
              <label className="text-sm font-semibold">Assign detailer manually
                <select name="detailer_id" defaultValue={b.detailer_id ?? ""} className="input mt-1 py-2">
                  <option value="">— Unassigned (open to detailers) —</option>
                  {eligible.map((d) => <option key={d.id} value={d.id}>{d.name}{d.id === b.preferred_detailer_id ? " (customer preferred)" : ""}{!(d.onboarding.insurance_verified && d.onboarding.background_check) ? " — verification incomplete" : ""}</option>)}
                </select></label>
              <Submit className="btn-primary btn-sm">Save</Submit>
              {!eligible.length && <p className="w-full text-xs text-ink-muted">No approved detailers cover {zip?.county ?? "this area"} yet.</p>}
            </form>
          )}
          <form action={updatePricing} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={b.id} />
            <label className="text-sm font-semibold">Final price ($)<input name="final_price" type="number" step="0.01" min="0" defaultValue={b.final_price ?? b.price_estimate ?? ""} className="input mt-1 w-36 py-2" /></label>
            <Submit className="btn-ghost btn-sm">Update price</Submit>
          </form>
          <div className="rounded-2xl bg-sky/50 p-4 text-sm">
            <b>Payment</b>
            {stripeEnabled() ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {b.payment_status === "unpaid" && price != null && <form action={sendPaymentLink}><input type="hidden" name="id" value={b.id} /><Submit className="btn-primary btn-sm">Send Stripe payment link</Submit></form>}
                {b.checkout_url && <a href={b.checkout_url} className="text-brand underline" target="_blank" rel="noreferrer">Checkout link</a>}
              </div>
            ) : <p className="mt-1 text-ink-muted">Stripe isn&apos;t configured — set STRIPE_SECRET_KEY to send secure payment links.</p>}
            {isAdmin && b.payment_status !== "paid" && <form action={markPaid} className="mt-2"><input type="hidden" name="id" value={b.id} /><button className="text-xs font-semibold text-brand underline">Mark paid manually</button></form>}
          </div>
          <form action={cancelOrRefund} className="space-y-2 rounded-2xl border border-red-200 p-4">
            <input type="hidden" name="id" value={b.id} />
            <b className="text-sm text-red-700">Cancellation & refund</b>
            <input name="reason" maxLength={300} placeholder="Reason" className="input py-2" />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {!["completed", "cancelled"].includes(b.status) && <label className="flex items-center gap-2"><input type="checkbox" name="cancel" value="1" className="accent-red-600" /> Cancel booking</label>}
              {isAdmin && <label className="flex items-center gap-2">Refund $<input name="refund" type="number" min="0" step="0.01" className="input w-28 py-1.5" /></label>}
              <Submit className="btn btn-sm bg-red-600 text-white hover:bg-red-700">Apply</Submit>
            </div>
            {!isAdmin && <p className="text-xs text-ink-muted">Refunds require an administrator.</p>}
          </form>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-lg font-bold">Messages</h2>
          <p className="mb-4 text-xs text-ink-muted">Shared thread between the customer, the assigned detailer and BluePalm. Contact details are never shared.</p>
          <Thread messages={messages} viewer="admin" />
          <form action={adminMessage} className="mt-4 space-y-2">
            <input type="hidden" name="id" value={b.id} />
            <textarea name="body" required maxLength={1500} className="input min-h-20" placeholder="Write a message" />
            <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" value="1" defaultChecked className="accent-brand" /> Email customer</label>
              <Submit className="btn-primary btn-sm">Send</Submit></div>
          </form>
        </section>
      </div>
    </div>
  );
}
