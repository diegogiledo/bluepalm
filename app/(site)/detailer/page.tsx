import { amountDue } from "@/lib/pricing";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDetailer } from "@/lib/portal";
import { db } from "@/lib/db";
import { commissionFor, money, todayFL, vehicleLabel, windowLabel } from "@/lib/services";
import { stripeEnabled } from "@/lib/stripe";
import { Badge, Thread, fmtDate } from "@/components/ui";
import { Submit } from "@/components/portal-forms";
import { acceptJob, connectPayouts, markComplete } from "./actions";
import { sendDetailerMessage, signOut } from "../account/actions";

export const metadata: Metadata = { title: "Detailer portal", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DetailerPortal({ searchParams }: PageProps<"/detailer">) {
  const d = await getDetailer();
  if (!d) redirect("/detailer/login");
  const { payouts } = await searchParams;
  const [bookings, zips, customers, messages] = await Promise.all([
    db.select("bookings"), db.select("service_zips"), db.select("customers"), db.select("messages"),
  ]);
  const today = todayFL();
  const countyOf = Object.fromEntries(zips.map((z) => [z.zip, z.county]));
  const rate = await commissionFor(d.id);
  const ready = d.onboarding.insurance_verified && d.onboarding.background_check;

  const available = bookings.filter((b) => b.status === "confirmed" && !b.detailer_id && b.date >= today && d.counties.includes(countyOf[b.zip])
    && (!b.preferred_detailer_id || b.preferred_detailer_id === d.id)).sort((a, b) => a.date.localeCompare(b.date));
  const mine = bookings.filter((b) => b.detailer_id === d.id);
  const accepted = mine.filter((b) => b.status === "assigned").sort((a, b) => a.date.localeCompare(b.date));
  const completed = mine.filter((b) => b.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const payout = (price: number | null, r: number | null) => (price ?? 0) * (1 - (r ?? rate));
  const earnings = completed.reduce((s, b) => s + payout(amountDue(b), b.commission_rate), 0);
  const rated = completed.filter((b) => b.customer_rating != null);
  const avg = rated.length ? rated.reduce((s, b) => s + (b.customer_rating ?? 0), 0) / rated.length : null;
  // Data minimisation: detailers only see the customer's first name, never email or phone.
  const firstName = (id: string) => customers.find((c) => c.id === id)?.name.split(" ")[0] ?? "Customer";

  const steps: [string, boolean][] = [
    ["Application approved", true], ["Insurance verified", d.onboarding.insurance_verified], ["Background check", d.onboarding.background_check],
    ["Orientation", d.onboarding.orientation], ["Payouts connected", d.onboarding.payouts_connected || Boolean(d.stripe_account_id)],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky to-white pb-24 pt-28">
      <div className="container-x max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><span className="eyebrow">Detailer portal</span><h1 className="h2 mt-3">Welcome, {d.name.split(" ")[0]}</h1>
            <p className="mt-1 text-ink-muted">{d.counties.join(" · ")}</p></div>
          <form action={signOut.bind(null, "detailer")}><button className="btn-ghost">Sign out</button></form>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[["Available jobs", String(available.length)], ["Accepted", String(accepted.length)], ["Completed", String(completed.length)],
            ["Earnings (est.)", money(Math.round(earnings * 100) / 100)]].map(([k, v]) => (
            <div key={k} className="card p-5"><p className="text-sm text-ink-muted">{k}</p><p className="mt-1 font-display text-3xl font-extrabold">{v}</p></div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-muted">Your platform commission rate: {(rate * 100).toFixed(0)}%. Rating: {avg ? `${avg.toFixed(1)} ★ from ${rated.length} review${rated.length > 1 ? "s" : ""}` : "no ratings yet"}.</p>

        <section className="card mt-8 p-6">
          <h2 className="font-display text-lg font-bold">Onboarding & verification</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-5">
            {steps.map(([t, ok]) => (
              <li key={t} className={`rounded-2xl p-3 text-sm font-semibold ${ok ? "bg-palm/10 text-palm-600" : "bg-navy/5 text-navy/60"}`}>{ok ? "✓" : "○"} {t}</li>
            ))}
          </ol>
          {!ready && <p className="mt-4 text-sm text-amber-700">You can browse jobs now; accepting jobs unlocks once insurance and background check are verified by BluePalm.</p>}
          {!d.stripe_account_id && (
            <form action={connectPayouts} className="mt-4">
              <button className="btn-primary btn-sm">Set up payouts with Stripe</button>
              {payouts === "unavailable" && <span className="ml-3 text-sm text-ink-muted">Payout setup isn&apos;t enabled yet — BluePalm will contact you.</span>}
            </form>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-extrabold">Available jobs</h2>
          <p className="text-sm text-ink-muted">Confirmed BluePalm bookings in your service areas. Exact address and instructions are shared after you accept.</p>
          {!available.length && <p className="card mt-4 p-6 text-ink-muted">No open jobs in your areas right now.</p>}
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {available.map((b) => (
              <li key={b.id} className="card p-5">
                <div className="flex justify-between gap-3"><b className="font-display text-lg">{b.package_name}</b>{b.preferred_detailer_id === d.id && <span className="rounded-full bg-palm/15 px-2 py-1 text-xs font-bold text-palm-600">Requested you</span>}</div>
                <p className="mt-1 text-sm text-ink-muted">{fmtDate(b.date)} · {windowLabel(b.time_window)}</p>
                <p className="text-sm text-ink-muted">{vehicleLabel(b.vehicle)} · {b.city} {b.zip}</p>
                <p className="mt-2 text-sm">Est. payout <b>{money(Math.round(payout(amountDue(b), null) * 100) / 100)}</b> <span className="text-ink-muted">(based on {money(amountDue(b))} price)</span></p>
                <form action={acceptJob} className="mt-4"><input type="hidden" name="id" value={b.id} />
                  {ready ? <Submit className="btn-green btn-sm" pending="Accepting…">Accept job</Submit>
                    : <button type="button" disabled className="btn-ghost btn-sm">Verification required</button>}</form>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-extrabold">Accepted jobs</h2>
          {!accepted.length && <p className="mt-3 text-ink-muted">No accepted jobs.</p>}
          <ul className="mt-4 space-y-4">
            {accepted.map((b) => {
              const thread = messages.filter((m) => m.booking_id === b.id);
              return (
                <li key={b.id} className="card p-6">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{b.ref}</p>
                      <b className="font-display text-xl">{b.package_name} for {firstName(b.customer_id)}</b>
                      <p className="text-sm text-ink-muted">{fmtDate(b.date)} · {windowLabel(b.time_window)}</p>
                      <p className="text-sm">{b.address}, {b.city} {b.zip}</p>
                      <p className="text-sm">{vehicleLabel(b.vehicle)}{b.vehicle_details ? ` — ${b.vehicle_details}` : ""}</p>
                    </div>
                    <Badge status={b.status} />
                  </div>
                  <div className="mt-4 rounded-2xl bg-sky/60 p-4 text-sm"><b>Customer service instructions:</b> {b.instructions || "None provided."}</div>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-brand">Messages via BluePalm ({thread.length})</summary>
                    <div className="mt-3"><Thread messages={thread} viewer="detailer" /></div>
                    <form action={sendDetailerMessage} className="mt-3 flex gap-2"><input type="hidden" name="id" value={b.id} />
                      <input name="body" required maxLength={1500} className="input py-2" placeholder="Message the customer through BluePalm" />
                      <Submit className="btn-primary btn-sm" pending="…">Send</Submit></form>
                  </details>
                  {b.date <= today
                    ? <form action={markComplete} className="mt-4"><input type="hidden" name="id" value={b.id} />
                        <Submit className="btn-green btn-sm" pending="Saving…">Mark job complete</Submit></form>
                    : <p className="mt-4 text-xs text-ink-muted">You can mark this job complete on the service date.</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-extrabold">Completed jobs</h2>
          {!completed.length && <p className="mt-3 text-ink-muted">Completed jobs and earnings will appear here.</p>}
          {!!completed.length && (
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr><th className="p-4">Date</th><th>Service</th><th>Area</th><th>Price</th><th>Your payout</th><th>Rating</th></tr></thead>
                <tbody className="divide-y divide-navy/5">
                  {completed.map((b) => (
                    <tr key={b.id}><td className="p-4">{fmtDate(b.date)}</td><td>{b.package_name}</td><td>{b.city}</td><td>{money(amountDue(b))}</td>
                      <td className="font-semibold">{money(Math.round(payout(amountDue(b), b.commission_rate) * 100) / 100)}</td><td>{b.customer_rating ? `${b.customer_rating} ★` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="mt-10 text-center text-xs text-ink-muted">BluePalm customers are managed by BluePalm. Keep all communication, scheduling and payment on the platform per your contractor agreement.</p>
        {!stripeEnabled() && <p className="mt-2 text-center text-xs text-ink-muted">Earnings shown are estimates; payouts are processed by BluePalm.</p>}
      </div>
    </div>
  );
}
