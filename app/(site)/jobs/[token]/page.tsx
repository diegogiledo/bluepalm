import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { jobOpen } from "@/lib/partners";
import { commissionFor, money, vehicleLabel, windowLabel } from "@/lib/services";
import { amountDue } from "@/lib/pricing";
import { Submit } from "@/components/portal-forms";
import { acceptAction, passAction } from "../../partners/actions";

export const metadata: Metadata = { title: "BluePalm job", robots: { index: false } };
export const dynamic = "force-dynamic";

const MSG: Record<string, string> = {
  taken: "Another detailer accepted this job first. We'll email you the next one in your area.",
  closed: "This job is no longer available. If it's yours, sign in at bluepalm.shop/detailer/login to see it.",
  invalid: "This job link isn't valid anymore.",
  passed: "Got it, you passed on this job. We'll email you the next one.",
  yours: "You have this job. Sign in at bluepalm.shop/detailer/login to see the address, message the customer and mark it complete.",
};

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[token]">) {
  const { token } = await params;
  const { result } = await searchParams;
  const offer = await one("job_offers", { token });
  if (!offer) notFound();
  const [b, m] = await Promise.all([one("bookings", { id: offer.booking_id }), one("market_detailers", { id: offer.market_detailer_id })]);
  if (!b || !m) notFound();
  const open = jobOpen(b) && offer.status === "sent" && m.status !== "unsubscribed";
  const due = amountDue(b);
  const rate = await commissionFor(null);
  // the detailer who won it sees that it's theirs, not "someone else took it"
  const mine = offer.status === "accepted";
  const note = mine ? MSG.yours : typeof result === "string" ? MSG[result] : !open ? (offer.status === "passed" ? MSG.passed : b.detailer_id ? MSG.taken : MSG.closed) : null;
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 pb-16 pt-28">
      <div className="card w-full max-w-lg p-8">
        <p className="eyebrow">Job for {m.business_name}</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">{b.package_name} in {b.city}</h1>
        <dl className="mt-4 divide-y divide-navy/10 text-sm">
          <Row k="Vehicle" v={vehicleLabel(b.vehicle)} />
          <Row k="When" v={`${b.date}, ${windowLabel(b.time_window)}`} />
          <Row k="Area" v={`${b.city} ${b.zip}`} />
          <Row k="Your payout" v={due != null ? `about ${money(Math.round(due * (1 - rate) * 100) / 100)}` : "Custom quote"} />
        </dl>
        <p className="mt-3 text-xs text-ink-muted">Customer price {due != null ? money(due) : "to be quoted"}, less BluePalm&apos;s {(rate * 100).toFixed(0)}% fee. The exact address and instructions are shown after you accept.</p>
        {note ? <p className="mt-6 rounded-2xl bg-navy/5 p-4 text-sm font-semibold" role="status">{note}</p> : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form action={acceptAction}><input type="hidden" name="token" value={token} /><Submit className="btn-green" pending="Claiming…">Accept this job</Submit></form>
            <form action={passAction}><input type="hidden" name="token" value={token} /><Submit className="btn-ghost" pending="…">Pass</Submit></form>
          </div>
        )}
        {open && <p className="mt-4 text-xs text-ink-muted">By accepting, you agree to do this job at the time shown and to follow BluePalm&apos;s <a className="underline" href="/detailer-agreement">detailer terms</a>.</p>}
      </div>
    </div>
  );
}
