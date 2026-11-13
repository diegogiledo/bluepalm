import { amountDue } from "@/lib/pricing";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/portal";
import { db } from "@/lib/db";
import { money, publicDetailerName, todayFL, vehicleLabel, windowLabel } from "@/lib/services";
import { LOYALTY, POLICIES } from "@/lib/config";
import { Badge, Thread, fmtDate } from "@/components/ui";
import { RebookForm, Submit } from "@/components/portal-forms";
import { cancelBooking, rateBooking, rebook, sendCustomerMessage, signOut, updatePlan } from "./actions";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  const [bookings, plans, messages, detailers] = await Promise.all([
    db.select("bookings", { customer_id: c.id }), db.select("recurring_plans", { customer_id: c.id }),
    db.select("messages"), db.select("detailers", { status: "approved" }),
  ]);
  const ids = new Set(bookings.map((b) => b.id));
  const msgs = messages.filter((m) => ids.has(m.booking_id));
  const dName = (id: string | null) => { const d = detailers.find((x) => x.id === id); return d ? publicDetailerName(d) : null; };
  const upcoming = bookings.filter((b) => ["requested", "confirmed", "assigned"].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
  const past = bookings.filter((b) => !upcoming.includes(b)).sort((a, b) => b.date.localeCompare(a.date));
  const pts = c.loyalty_points % LOYALTY.rewardThreshold;
  const rewards = Math.floor(c.loyalty_points / LOYALTY.rewardThreshold);
  const pkgNames = Object.fromEntries((await db.select("packages")).map((p) => [p.id, p.name]));
  const tomorrow = (() => { const d = new Date(todayFL() + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky to-white pb-24 pt-28">
      <div className="container-x max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><span className="eyebrow">My BluePalm</span><h1 className="h2 mt-3">Hi, {c.name.split(" ")[0]}</h1></div>
          <div className="flex gap-2">
            <Link href="/book" className="btn-primary">Book a new detail</Link>
            <form action={signOut.bind(null, "customer")}><button className="btn-ghost">Sign out</button></form>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="card p-6 lg:col-span-1">
            <h2 className="font-display text-lg font-bold">Loyalty rewards</h2>
            <p className="mt-3 font-display text-4xl font-extrabold text-brand">{c.loyalty_points}<span className="ml-1 text-base text-ink-muted">pts</span></p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-sky"><div className="h-full rounded-full bg-gradient-to-r from-brand to-palm" style={{ width: `${(pts / LOYALTY.rewardThreshold) * 100}%` }} /></div>
            <p className="mt-2 text-sm text-ink-muted">{LOYALTY.rewardThreshold - pts} points to your next ${LOYALTY.rewardValue} reward. Earn {LOYALTY.pointsPerDollar} point per $1 on completed services.</p>
            {rewards > 0 && <p className="mt-3 rounded-xl bg-palm/10 p-3 text-sm font-semibold text-palm-600">You have {rewards} reward{rewards > 1 ? "s" : ""} available — we&apos;ll apply it to your next confirmed booking on request.</p>}
          </section>

          <section className="card p-6 lg:col-span-2">
            <h2 className="font-display text-lg font-bold">Recurring plans</h2>
            {!plans.length && <p className="mt-2 text-sm text-ink-muted">No recurring plan yet. Choose &ldquo;Every two weeks&rdquo; or &ldquo;Monthly&rdquo; when booking to keep your car consistently clean.</p>}
            <ul className="mt-3 space-y-3">
              {plans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky/50 p-4">
                  <div>
                    <p className="font-semibold">{pkgNames[p.package_id] ?? "Custom"} · {p.frequency === "biweekly" ? "Every two weeks" : "Monthly"} <Badge status={p.status} /></p>
                    <p className="text-sm text-ink-muted">{vehicleLabel(p.vehicle)} · {p.city} · {p.status === "active" ? `Next visit around ${fmtDate(p.next_date)}` : "Not scheduling"}{dName(p.preferred_detailer_id) ? ` · Preferred: ${dName(p.preferred_detailer_id)}` : ""}</p>
                  </div>
                  {p.status !== "cancelled" && (
                    <form action={updatePlan} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      {p.status === "active" ? <button name="action" value="pause" className="btn-ghost btn-sm">Pause</button> : <button name="action" value="resume" className="btn-primary btn-sm">Resume</button>}
                      <button name="action" value={p.frequency === "biweekly" ? "monthly" : "biweekly"} className="btn-ghost btn-sm">Switch to {p.frequency === "biweekly" ? "monthly" : "every 2 weeks"}</button>
                      <button name="action" value="cancel" className="btn-ghost btn-sm text-red-600">Cancel plan</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-extrabold">Upcoming</h2>
          {!upcoming.length && <p className="mt-3 text-ink-muted">No upcoming bookings.</p>}
          <ul className="mt-4 space-y-4">
            {upcoming.map((b) => (
              <li key={b.id} className="card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{b.ref}</p>
                    <h3 className="mt-1 font-display text-xl font-bold">{b.package_name}</h3>
                    <p className="text-sm text-ink-muted">{fmtDate(b.date)} · {windowLabel(b.time_window)} · {vehicleLabel(b.vehicle)} · {b.address}, {b.city}</p>
                    <p className="mt-1 text-sm">Starting price {money(b.price_estimate)}{b.promo_code ? ` · ${b.discount_pct}% off with ${b.promo_code}` : ""}{dName(b.detailer_id) ? ` · Detailer: ${dName(b.detailer_id)}` : ""}</p>
                    {b.checkout_url && b.payment_status === "payment_link_sent" && <a href={b.checkout_url} className="btn-green btn-sm mt-3">Pay securely</a>}
                    {b.card_label && b.payment_status === "card_on_file" && <p className="mt-1 text-xs text-ink-muted">💳 {b.card_label}: charged after your service</p>}
                    {b.payment_status === "payment_failed" && <p className="mt-1 text-xs font-semibold text-red-600">We couldn&apos;t charge your saved card. We&apos;ll email you a secure payment link.</p>}
                  </div>
                  <Badge status={b.status} />
                </div>
                <details className="mt-5 rounded-2xl bg-sky/40 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">Messages ({msgs.filter((m) => m.booking_id === b.id).length})</summary>
                  <div className="mt-3"><Thread messages={msgs.filter((m) => m.booking_id === b.id)} viewer="customer" /></div>
                  <form action={sendCustomerMessage} className="mt-3 flex gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input name="body" required maxLength={1500} className="input py-2" placeholder="Message BluePalm and your detailer" />
                    <Submit className="btn-primary btn-sm" pending="…">Send</Submit>
                  </form>
                </details>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-red-600">Cancel this booking</summary>
                  <form action={cancelBooking} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input name="reason" maxLength={300} className="input max-w-sm py-2" placeholder="Reason (optional)" />
                    <Submit className="btn btn-sm bg-red-600 text-white hover:bg-red-700" pending="Cancelling…">Confirm cancellation</Submit>
                  </form>
                  <p className="mt-2 text-xs text-ink-muted">{POLICIES.cancellation}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold">Booking history</h2>
          {!past.length && <p className="mt-3 text-ink-muted">Your completed bookings will appear here.</p>}
          <ul className="mt-4 space-y-3">
            {past.map((b) => (
              <li key={b.id} className="card flex flex-wrap items-start justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">{b.package_name} · {fmtDate(b.date)} <Badge status={b.status} /></p>
                  <p className="text-sm text-ink-muted">{b.ref} · {vehicleLabel(b.vehicle)} · {b.city}{b.final_price != null ? ` · ${money(amountDue(b))}` : ""}{b.refund_amount > 0 ? ` · ${money(b.refund_amount)} refunded` : ""}{dName(b.detailer_id) ? ` · ${dName(b.detailer_id)}` : ""}</p>
                  {b.status === "completed" && b.customer_rating == null && (
                    <form action={rateBooking} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={b.id} />
                      <select name="rating" className="input w-auto py-2" defaultValue="5" aria-label="Rating">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select>
                      <input name="feedback" maxLength={1000} className="input w-64 py-2" placeholder="Feedback (optional)" />
                      <Submit className="btn-ghost btn-sm">Rate service</Submit>
                    </form>
                  )}
                  {b.customer_rating != null && <p className="mt-1 text-sm text-amber-600">{"★".repeat(b.customer_rating)}<span className="text-navy/20">{"★".repeat(5 - b.customer_rating)}</span> Thanks for your feedback</p>}
                </div>
                {b.package_id !== "custom" && <RebookForm action={rebook} bookingId={b.id} minDate={tomorrow} />}
              </li>
            ))}
          </ul>
        </section>
        <p className="mt-12 text-center text-sm text-ink-muted">Questions? Message us on any booking — please keep communication and payments within BluePalm so we can support you.</p>
      </div>
    </div>
  );
}
