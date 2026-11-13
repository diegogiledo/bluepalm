import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db, getSetting, one } from "@/lib/db";
import { money } from "@/lib/services";
import { amountDue } from "@/lib/pricing";
import { Badge, fmtDate } from "@/components/ui";
import { LogoImg } from "@/components/admin/logo-img";

const TABS = { won: "Jobs won", all: "All job emails" } as const;
const OFFER_LABEL: Record<string, string> = { sent: "No answer yet", accepted: "Won", passed: "Passed", taken: "Someone else took it" };

/** One local detailer: their contact info, the jobs they won and every job email they got. */
export default async function PartnerJobs({ params, searchParams }: PageProps<"/admin/detailers/[id]">) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "won";
  const m = await one("market_detailers", { id });
  if (!m) notFound();
  const [offers, bookings, defaultRate] = await Promise.all([db.select("job_offers", { market_detailer_id: id }), db.select("bookings"), getSetting("commission_rate", 0.2)]);
  const byId = Object.fromEntries(bookings.map((b) => [b.id, b]));
  const portal = m.detailer_id ? await one("detailers", { id: m.detailer_id }) : null;
  // Jobs won = bookings assigned to their portal account (from email or assigned by hand)
  const won = bookings.filter((b) => portal && b.detailer_id === portal.id).sort((a, b) => b.date.localeCompare(a.date));
  const rows = offers.map((o) => ({ o, b: byId[o.booking_id] })).filter((r) => r.b).sort((a, b) => b.o.sent_at.localeCompare(a.o.sent_at));
  const earn = (b: (typeof won)[number]) => (amountDue(b) ?? 0) * (1 - (b.commission_rate ?? defaultRate));
  const completed = won.filter((b) => b.status === "completed");
  const responded = offers.filter((o) => o.responded_at && o.status !== "taken").length;

  return (
    <div className="space-y-6">
      <Link href="/admin/detailers" className="text-sm font-semibold text-brand">← Detailers</Link>
      <div className="flex flex-wrap items-center gap-4">
        <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-sky font-display text-lg font-extrabold text-brand ring-1 ring-navy/10">
          {m.business_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
          {m.logo_url && <LogoImg src={m.logo_url} />}
        </span>
        <div>
          <h1 className="font-display text-3xl font-extrabold">{m.business_name}</h1>
          <p className="text-sm text-ink-muted">{[m.owner_name, m.email ?? "no email", m.phone, m.city].filter(Boolean).join(" · ")}
            {m.website && <> · <a href={m.website} target="_blank" rel="noreferrer noopener" className="text-brand underline">website</a></>}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Job emails", offers.length], ["Responded", responded], ["Jobs won", won.length], ["Completed", completed.length],
          ["Earned (est.)", money(Math.round(completed.reduce((s, b) => s + earn(b), 0) * 100) / 100)]].map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs text-ink-muted">{k}</p><p className="mt-1 font-display text-2xl font-extrabold">{v}</p></div>
        ))}
      </div>

      <div className="flex gap-2">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <Link key={t} href={`/admin/detailers/${id}?tab=${t}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "bg-white ring-1 ring-navy/10"}`}>
            {TABS[t]} ({t === "won" ? won.length : offers.length})</Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {tab === "won" ? (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{["Booking", "Date", "Service", "Area", "Customer pays", "Detailer earns", "Status", "Payment"].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy/5">
              {won.map((b) => (
                <tr key={b.id} className="hover:bg-sky/40">
                  <td className="whitespace-nowrap p-4 font-semibold"><Link href={`/admin/bookings/${b.id}`} className="text-brand underline">{b.ref}</Link></td>
                  <td className="whitespace-nowrap p-4">{fmtDate(b.date)}</td>
                  <td className="p-4">{b.package_name}</td>
                  <td className="p-4">{b.city} {b.zip}</td>
                  <td className="p-4">{money(amountDue(b))}</td>
                  <td className="p-4">{money(Math.round(earn(b) * 100) / 100)}</td>
                  <td className="p-4"><Badge status={b.status} /></td>
                  <td className="p-4"><Badge status={b.payment_status} /></td>
                </tr>
              ))}
              {!won.length && <tr><td colSpan={8} className="p-8 text-center text-ink-muted">No jobs won yet.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-muted"><tr>{["Emailed", "Booking", "Job date", "Service", "Area", "Their answer"].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-navy/5">
              {rows.map(({ o, b }) => (
                <tr key={o.id} className="hover:bg-sky/40">
                  <td className="p-4">{new Date(o.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="whitespace-nowrap p-4 font-semibold"><Link href={`/admin/bookings/${b.id}`} className="text-brand underline">{b.ref}</Link></td>
                  <td className="whitespace-nowrap p-4">{fmtDate(b.date)}</td>
                  <td className="p-4">{b.package_name}</td>
                  <td className="p-4">{b.city} {b.zip}</td>
                  <td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${o.status === "accepted" ? "bg-palm/15 text-palm-600" : o.status === "passed" ? "bg-amber-100 text-amber-800" : "bg-navy/8 text-navy/70"}`}>{OFFER_LABEL[o.status]}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-ink-muted">No job emails sent to this detailer yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
