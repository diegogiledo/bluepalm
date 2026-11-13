import { amountDue } from "@/lib/pricing";
import { requireStaff } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
import { money } from "@/lib/services";
import { Badge } from "@/components/ui";
import { StateForm, Submit } from "@/components/portal-forms";
import { CoverageMap, type MapPartner } from "@/components/admin/coverage-map";
import { COUNTIES } from "@/lib/config";
import { canEmailPartners } from "@/lib/partners";
import type { MarketDetailer } from "@/lib/types";
import { addPartner, deletePartner, importResearchedPartners, invitePartnerAction, reviewDetailer, setPartnerStatus, updateDetailer, updatePartner } from "../../actions";

async function SignedUp() {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const [detailers, bookings] = await Promise.all([db.select("detailers"), db.select("bookings")]);
  const defaultRate = await getSetting("commission_rate", 0.2);
  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 } as const;
  const rows = detailers.sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-4">
      <div><h2 className="font-display text-2xl font-extrabold">BluePalm portal accounts ({rows.length})</h2>
        <p className="text-sm text-ink-muted">Detailers who applied on the site, plus local businesses that took a job (they get an account automatically). Track onboarding and set commission overrides.</p></div>
      {!rows.length && <p className="card p-8 text-center text-ink-muted">None yet.</p>}
      <ul className="space-y-4">
        {rows.map((d) => {
          const jobs = bookings.filter((b) => b.detailer_id === d.id && b.status === "completed");
          const rated = jobs.filter((b) => b.customer_rating != null);
          const avg = rated.length ? rated.reduce((s, b) => s + (b.customer_rating ?? 0), 0) / rated.length : null;
          const earned = jobs.reduce((s, b) => s + (amountDue(b) ?? 0) * (1 - (b.commission_rate ?? defaultRate)), 0);
          return (
            <li key={d.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 font-display text-xl font-bold">{d.name} <Badge status={d.status} />{d.source === "market" && <span className="rounded-full bg-sky px-2.5 py-1 text-xs font-bold text-brand">Local business</span>}</p>
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

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Logo({ m }: { m: MarketDetailer }) {
  return (
    <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sky font-display font-extrabold text-brand ring-1 ring-navy/10">
      {initials(m.business_name)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.logo_url && <img src={m.logo_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 size-full bg-white object-contain p-1" />}
    </span>
  );
}

const STATUSES = ["all", "opted_in", "invited", "new", "unsubscribed"] as const;
const STATUS_LABEL: Record<string, string> = { all: "All", opted_in: "Getting jobs", invited: "Invited", new: "Not invited", unsubscribed: "Unsubscribed" };

export default async function Detailers({ searchParams }: PageProps<"/admin/detailers">) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const sp = await searchParams;
  const COUNTY_NAMES = COUNTIES.map((c) => c.name);
  const county = typeof sp.county === "string" && COUNTY_NAMES.includes(sp.county) ? sp.county : "";
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [partners, offers] = await Promise.all([db.select("market_detailers"), db.select("job_offers")]);
  const stats = (id: string) => {
    const o = offers.filter((x) => x.market_detailer_id === id);
    return { sent: o.length, responded: o.filter((x) => x.responded_at && x.status !== "taken").length, won: o.filter((x) => x.status === "accepted").length };
  };
  const inCounty = partners.filter((m) => !county || m.counties.includes(county));
  const rows = inCounty
    .filter((m) => status === "all" || m.status === status)
    .filter((m) => !q || [m.business_name, m.owner_name, m.email, m.city, m.phone].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => ["opted_in", "invited", "new", "unsubscribed"].indexOf(a.status) - ["opted_in", "invited", "new", "unsubscribed"].indexOf(b.status) || a.business_name.localeCompare(b.business_name));
  const mapData: MapPartner[] = inCounty.filter((m) => m.lat != null && m.lon != null).map((m) => ({
    id: m.id, name: m.business_name, city: m.city, lat: m.lat!, lon: m.lon!, radius_miles: Number(m.radius_miles) || 15,
    status: m.status, logo_url: m.logo_url, sent: stats(m.id).sent, won: stats(m.id).won,
  }));
  const totals = { sent: offers.length, responded: offers.filter((x) => x.responded_at && x.status !== "taken").length, won: offers.filter((x) => x.status === "accepted").length };
  const link = (p: Record<string, string>) => "/admin/detailers?" + new URLSearchParams({ ...(county ? { county } : {}), ...(status !== "all" ? { status } : {}), ...(q ? { q } : {}), ...p }).toString();
  const newWithEmail = inCounty.filter((m) => m.status === "new" && m.email).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Detailers</h1>
        <p className="text-ink-muted">Local detailing businesses in your areas. Opted-in detailers get every new booking in their county by email; the first to accept gets the job.</p>
      </div>

      {!canEmailPartners() && (
        <p className="rounded-2xl bg-amber-100 p-4 text-sm text-amber-900"><b>Emails to detailers are off.</b> U.S. law (CAN-SPAM) requires a postal address in business outreach emails. Add <code>BUSINESS_MAILING_ADDRESS</code> (a P.O. box or virtual mailbox works) to your settings to turn on invites and job emails.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[["Detailers", inCounty.length], ["With email", inCounty.filter((m) => m.email).length], ["Getting jobs", inCounty.filter((m) => m.status === "opted_in").length],
          ["Job emails sent", totals.sent], ["Responses", totals.responded], ["Jobs taken", totals.won]].map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs text-ink-muted">{k}</p><p className="mt-1 font-display text-2xl font-extrabold">{v}</p></div>
        ))}
      </div>

      <section className="card p-6">
        <h2 className="mb-3 font-display text-lg font-bold">Coverage map</h2>
        {mapData.length ? <CoverageMap partners={mapData} /> : <p className="text-sm text-ink-muted">Detailers appear here once they&apos;re added.</p>}
      </section>

      {isAdmin && (
        <section className="card flex flex-wrap items-start gap-6 p-6">
          <StateForm action={importResearchedPartners} className="flex flex-col items-start">
            <Submit className="btn-primary btn-sm" pending="Loading… (about a minute)">Load researched detailers</Submit>
            <span className="mt-1 text-xs text-ink-muted">Adds new ones only; existing entries are kept.</span>
          </StateForm>
          <StateForm action={invitePartnerAction} className="flex flex-col items-start">
            <input type="hidden" name="all" value="1" /><input type="hidden" name="county" value={county} />
            <Submit className="btn-green btn-sm" pending="Sending…">Invite {newWithEmail ? `${Math.min(newWithEmail, 50)} new` : "new"} detailers{county ? ` in ${county}` : ""}</Submit>
            <span className="mt-1 text-xs text-ink-muted">One intro email each, max 50 per click. Only those who say yes get jobs.</span>
          </StateForm>
          <details className="w-full">
            <summary className="cursor-pointer text-sm font-semibold text-brand">+ Add a detailer by hand</summary>
            <StateForm action={addPartner} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input name="business_name" required placeholder="Business name *" className="input py-2" />
              <input name="owner_name" placeholder="Owner name" className="input py-2" />
              <input name="email" type="email" placeholder="Email" className="input py-2" />
              <input name="phone" placeholder="Phone" className="input py-2" />
              <input name="website" placeholder="Website" className="input py-2" />
              <input name="logo_url" placeholder="Logo image URL (https://…)" className="input py-2" />
              <input name="address" placeholder="Street address (for the map)" className="input py-2" />
              <input name="city" placeholder="City" className="input py-2" />
              <input name="radius_miles" type="number" min="1" max="60" placeholder="Travel radius (miles), default 15" className="input py-2" />
              <fieldset className="flex flex-wrap gap-4 text-sm sm:col-span-3">{COUNTIES.map(({ name: c }) => <label key={c} className="flex items-center gap-2"><input type="checkbox" name="counties" value={c} className="accent-brand" /> {c}</label>)}</fieldset>
              <div><Submit className="btn-primary btn-sm">Add detailer</Submit></div>
            </StateForm>
          </details>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <a href={link({ county: "" })} className={`rounded-full px-4 py-2 text-sm font-semibold ${!county ? "bg-brand text-white" : "bg-white ring-1 ring-navy/10"}`}>All areas ({partners.length})</a>
          {COUNTY_NAMES.map((c) => (
            <a key={c} href={link({ county: c })} className={`rounded-full px-4 py-2 text-sm font-semibold ${county === c ? "bg-brand text-white" : "bg-white ring-1 ring-navy/10"}`}>{c} ({partners.filter((m) => m.counties.includes(c)).length})</a>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <a key={s} href={link({ status: s === "all" ? "" : s })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? "bg-navy text-white" : "bg-white ring-1 ring-navy/10"}`}>
              {STATUS_LABEL[s]} ({s === "all" ? inCounty.length : inCounty.filter((m) => m.status === s).length})</a>
          ))}
          <form className="ml-auto flex gap-2"><input type="hidden" name="county" value={county} /><input name="q" defaultValue={q} placeholder="Search name, email, city" className="input w-56 py-1.5" /><button className="btn-ghost btn-sm">Search</button></form>
        </div>

        {!rows.length && <p className="card p-8 text-center text-ink-muted">{partners.length ? "No detailers match these filters." : "No detailers yet. Click “Load researched detailers” to add the local businesses we found."}</p>}
        <ul className="space-y-3">
          {rows.map((m) => {
            const st = stats(m.id);
            return (
              <li key={m.id} className="card p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Logo m={m} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">{m.business_name} <Badge status={m.status} /></p>
                    <p className="text-sm text-ink-muted">{m.owner_name ? `${m.owner_name} · ` : ""}{m.email ?? <span className="text-amber-700">no email</span>}{m.phone ? ` · ${m.phone}` : ""}
                      {m.website && <> · <a href={m.website} target="_blank" rel="noreferrer noopener" className="text-brand underline">website</a></>}</p>
                    <p className="mt-1 text-sm">{m.city || "City unknown"} · {m.counties.join(", ") || "no county"} · {Number(m.radius_miles)} mi radius{m.lat == null ? " · not on map" : ""}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div><dt className="text-xs text-ink-muted">Job emails</dt><dd className="font-display text-xl font-extrabold">{st.sent}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Responded</dt><dd className="font-display text-xl font-extrabold">{st.responded}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Won</dt><dd className="font-display text-xl font-extrabold">{st.won}</dd></div>
                  </dl>
                </div>
                {isAdmin && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {m.email && (m.status === "new" || m.status === "invited") && (
                      <StateForm action={invitePartnerAction}><input type="hidden" name="id" value={m.id} />
                        <Submit className="btn-green btn-sm" pending="Sending…">{m.status === "invited" ? "Resend invite" : "Send invite"}</Submit></StateForm>
                    )}
                    {m.invited_at && <span className="text-xs text-ink-muted">Invited {fmtDay(m.invited_at)}{m.opted_in_at ? ` · joined ${fmtDay(m.opted_in_at)}` : ""}</span>}
                    {m.status !== "unsubscribed" && <form action={setPartnerStatus}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="unsubscribed" /><button className="btn-ghost btn-sm">Stop emailing</button></form>}
                    <details className="w-full">
                      <summary className="cursor-pointer text-sm font-semibold text-brand">Edit details</summary>
                      <form action={updatePartner} className="mt-3 grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="id" value={m.id} />
                        <label className="text-xs font-semibold">Business<input name="business_name" defaultValue={m.business_name} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Owner<input name="owner_name" defaultValue={m.owner_name ?? ""} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Email<input name="email" type="email" defaultValue={m.email ?? ""} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Phone<input name="phone" defaultValue={m.phone ?? ""} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Website<input name="website" defaultValue={m.website ?? ""} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Logo URL<input name="logo_url" defaultValue={m.logo_url ?? ""} className="input mt-1 py-2" /></label>
                        <label className="text-xs font-semibold">Travel radius (miles)<input name="radius_miles" type="number" min="1" max="60" defaultValue={Number(m.radius_miles)} className="input mt-1 py-2" /></label>
                        <fieldset className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">{COUNTY_NAMES.map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" name="counties" value={c} defaultChecked={m.counties.includes(c)} className="accent-brand" /> {c}</label>)}</fieldset>
                        <div className="flex gap-2 sm:col-span-3"><Submit className="btn-primary btn-sm">Save</Submit></div>
                      </form>
                      <form action={deletePartner} className="mt-3"><input type="hidden" name="id" value={m.id} /><button className="text-xs font-semibold text-red-600 underline">Remove from list</button></form>
                    </details>
                  </div>
                )}
                {m.source_url && <p className="mt-2 text-xs text-ink-muted">Source: <a href={m.source_url} target="_blank" rel="noreferrer noopener" className="underline">{m.source_url.replace(/^https?:\/\//, "").slice(0, 60)}</a>{m.notes ? ` · ${m.notes}` : ""}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <SignedUp />
    </div>
  );
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
