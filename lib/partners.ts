import "server-only";
import { db, one } from "./db";
import { newId, newToken } from "./auth";
import { escapeHtml, logEmail, mailingAddress, partnerFooterHtml, partnerFooterText, sendEmail, sendPartnerEmails, siteUrl } from "./notify";
import { addMessage, commissionFor, money, now, publicDetailerName, todayFL, vehicleLabel, windowLabel } from "./services";
import { amountDue } from "./pricing";
import { locate } from "./geo";
import { COUNTIES } from "./config";
import type { Booking, Detailer, JobOffer, MarketDetailer } from "./types";

/**
 * Local detailing businesses ("partners") that BluePalm sends customers to.
 *
 * 1. When a customer books AND saves their card, the job is emailed to every
 *    local business serving that county (no sign-up or invite needed).
 * 2. The first business to accept is assigned; the others see "already taken".
 *    The winner gets a BluePalm portal account (address, messages, payouts).
 * Emails never include the customer's contact details. Anyone can unsubscribe.
 */

const unsubUrl = (md: MarketDetailer) => siteUrl(`/api/partners/unsubscribe?t=${encodeURIComponent(md.token)}`);
const validEmail = (e: string | null): e is string => Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

/**
 * Local test mode (your computer only, never on Netlify): job emails to
 * detailers are only logged in the Outbox, and a random detailer serving the
 * county "accepts" each paid booking right away, so the whole flow can be
 * tried without emailing real businesses.
 */
export const detailerTestMode = () => !process.env.NETLIFY && !process.env.VERCEL && process.env.NODE_ENV !== "production";

/** Job emails need a postal address in the footer (CAN-SPAM). */
export const canEmailPartners = () => Boolean(mailingAddress());
/** Businesses that receive job emails: everyone with an email who hasn't unsubscribed. */
export const receivesJobs = (m: MarketDetailer) => m.status !== "unsubscribed" && validEmail(m.email);

export async function unsubscribe(token: string) {
  const m = await one("market_detailers", { token });
  if (!m) return null;
  if (m.status !== "unsubscribed") await db.update("market_detailers", { id: m.id }, { status: "unsubscribed", unsubscribed_at: now() });
  return m;
}
export async function resubscribe(token: string) {
  const m = await one("market_detailers", { token });
  if (m?.status === "unsubscribed") await db.update("market_detailers", { id: m.id }, { status: "new", unsubscribed_at: null });
  return m;
}

const prettyDate = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export type JobEmail = { subject: string; html: string; text: string };

/** The email a local detailer gets for a paid booking near them. */
export async function jobEmail(b: Booking, m: Pick<MarketDetailer, "business_name" | "owner_name">, acceptUrl: string, unsub: string, rateIn?: number): Promise<JobEmail> {
  const due = amountDue(b);
  const rate = rateIn ?? (await commissionFor(null));
  const pay = due != null ? money(Math.round(due * (1 - rate) * 100) / 100) : null;
  const when = `${prettyDate(b.date)}, ${windowLabel(b.time_window).toLowerCase()}`;
  const hi = m.owner_name ? m.owner_name.split(" ")[0] : `${m.business_name} team`;
  const subject = pay ? `${pay} detailing job in ${b.city} on ${prettyDate(b.date).split(",")[0]}` : `Detailing job in ${b.city}, customer ready to book`;
  const e = escapeHtml;
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#5b6b80">${e(k)}</td><td style="padding:6px 0;text-align:right;font-weight:700">${e(v)}</td></tr>`;
  const step = (n: number, t: string, d: string) => `<tr><td style="vertical-align:top;padding:0 12px 12px 0"><div style="width:26px;height:26px;border-radius:13px;background:#EAF3FF;color:#1264D6;font-weight:800;text-align:center;line-height:26px">${n}</div></td><td style="padding:0 0 12px"><b>${e(t)}</b><br><span style="color:#5b6b80">${e(d)}</span></td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#EAF3FF;font-family:Arial,Helvetica,sans-serif;color:#0B2342">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px">
    <div style="font-weight:800;font-size:20px;color:#1264D6;margin-bottom:14px">BluePalm Auto Care</div>
    <div style="background:#fff;border-radius:16px;padding:26px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.04em">Customer's card is on file</p>
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">${pay ? `Earn ${e(pay)} detailing a car in ${e(b.city)}` : `A customer in ${e(b.city)} needs a detailer`}</h1>
      <p style="line-height:1.55;margin:0 0 16px">Hi ${e(hi)}, a customer near you just booked a detail with BluePalm and we'd like <b>${e(m.business_name)}</b> to do it.</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;border-top:1px solid #e5edf7;border-bottom:1px solid #e5edf7;margin-bottom:20px">
        ${row("Service", b.package_name)}${row("Vehicle", vehicleLabel(b.vehicle))}${row("When", when)}${row("Where", `${b.city} ${b.zip}`)}
        ${row("You earn", pay ?? "Custom quote, agreed before the job")}
      </table>
      <p style="text-align:center;margin:0 0 8px"><a href="${e(acceptUrl)}" style="display:inline-block;background:#16a34a;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:800;font-size:16px">Accept this job</a></p>
      <p style="text-align:center;margin:0 0 22px;font-size:13px;color:#5b6b80">First detailer to accept gets it.</p>
      <h2 style="font-size:16px;margin:0 0 4px">What is BluePalm?</h2>
      <p style="line-height:1.55;margin:0 0 14px;color:#33465e">We bring customers to local mobile detailers in Tampa Bay and Sarasota. You keep running your business your way; we just send you extra paid jobs. No sign-up, no fees to join, no contract.</p>
      <table style="border-collapse:collapse;font-size:14px;line-height:1.45">
        ${step(1, "Accept the job", "See the address and the customer's notes right away.")}
        ${step(2, "Do the detail", "Show up in the time window and make it shine.")}
        ${step(3, "Get paid", "Mark it done. The customer's card is charged and your share goes to your bank through Stripe.")}
      </table>
      <p style="line-height:1.55;margin:6px 0 0;font-size:13px;color:#5b6b80">Not a fit this time? Just ignore this email.</p>
    </div>
    ${partnerFooterHtml(unsub)}
  </div></body></html>`;
  const text = [
    `Hi ${hi},`,
    `A customer near you just booked a detail with BluePalm (card on file) and we'd like ${m.business_name} to do it.`,
    `Service: ${b.package_name}\nVehicle: ${vehicleLabel(b.vehicle)}\nWhen: ${when}\nWhere: ${b.city} ${b.zip}\nYou earn: ${pay ?? "custom quote"}`,
    `Accept this job (first to accept gets it): ${acceptUrl}`,
    "What is BluePalm? We bring customers to local mobile detailers in Tampa Bay and Sarasota. No sign-up, no fees, no contract.",
    "1. Accept the job: see the address and notes. 2. Do the detail. 3. Mark it done: the customer's card is charged and your share goes to your bank through Stripe.",
    partnerFooterText(unsub),
  ].join("\n\n");
  return { subject, html, text };
}

/**
 * Email a booking to every local business serving its county, once the
 * customer's card is saved. Never throws (a booking must never fail because
 * of this). Returns how many emails went out.
 */
export async function offerJob(b: Booking) {
  try {
    const test = detailerTestMode();
    if (!canEmailPartners() && !test) { console.warn("offerJob: BUSINESS_MAILING_ADDRESS is not set, so no detailers were emailed"); return 0; }
    if (!b.payment_method_id) return 0;
    if ((await db.select("job_offers", { booking_id: b.id })).length) return 0; // already offered
    const zip = await one("service_zips", { zip: b.zip });
    if (!zip) return 0;
    // never offer jobs to a business whose BluePalm account you suspended or rejected
    const blocked = new Set((await db.select("detailers")).filter((d) => d.status !== "approved").flatMap((d) => [d.id, d.email.toLowerCase()]));
    let partners = (await db.select("market_detailers")).filter((m) => receivesJobs(m) && m.counties.includes(zip.county)
      && !(m.detailer_id && blocked.has(m.detailer_id)) && !blocked.has((m.email ?? "").toLowerCase()));
    // stay inside the email limit (bookings made from admin or recurring plans skip the booking-form check)
    const { remainingEmails } = await import("./email-budget");
    const room = (await remainingEmails()) - 6; // keep room for the accept + completion emails
    if (room < partners.length) {
      partners = partners.sort(() => Math.random() - 0.5).slice(0, Math.max(0, room));
      console.warn(`offerJob: email limit, offered ${b.ref} to ${partners.length} detailers instead of all`);
    }
    if (!partners.length) return 0;
    const rate = await commissionFor(null);
    const offers: JobOffer[] = partners.map((m) => ({ id: newId(), booking_id: b.id, market_detailer_id: m.id, token: newToken(), status: "sent", sent_at: now(), responded_at: null }));
    await db.insertMany("job_offers", offers);
    const mails = await Promise.all(partners.map(async (m, i) => {
      const unsub = unsubUrl(m);
      const j = await jobEmail(b, m, siteUrl(`/jobs/${offers[i].token}`), unsub, rate);
      return { to: m.email!, title: j.subject, html: j.html, text: j.text, unsubscribeUrl: unsub };
    }));
    if (test) {
      for (const m of mails) await logEmail(m.to, m.title, m.text);
      const pick = offers[Math.floor(Math.random() * offers.length)];
      await acceptOffer(pick.token, { simulated: true });
      return 0;
    }
    return await sendPartnerEmails(mails);
  } catch (e) {
    console.error("offerJob failed", e);
    return 0;
  }
}

/** Is this booking still open for a partner to take? */
export const jobOpen = (b: Booking) => (b.status === "requested" || b.status === "confirmed") && !b.detailer_id && b.date >= todayFL();

/** The portal account a partner uses after winning a job (created on first win). */
export async function detailerFor(m: MarketDetailer): Promise<Detailer> {
  if (m.detailer_id) {
    const d = await one("detailers", { id: m.detailer_id });
    if (d) return d;
  }
  const existing = m.email ? await one("detailers", { email: m.email }) : null;
  const d: Detailer = existing ?? {
    id: newId(), name: m.owner_name || m.business_name, email: m.email!, phone: m.phone ?? "", business_name: m.business_name,
    business_type: "Existing business", ein_last4: "", years_experience: 0, experience: m.notes,
    counties: m.counties, availability: [], insurance_file: null, insurance_expires: null, status: "approved",
    access_token: newToken(), agreement_accepted_at: now(), commission_rate: null,
    onboarding: { insurance_verified: false, background_check: false, orientation: false, payouts_connected: false },
    stripe_account_id: null, admin_notes: "Added automatically when they accepted a job from email.", created_at: now(), source: "market",
  };
  if (!existing) await db.insert("detailers", d);
  await db.update("market_detailers", { id: m.id }, { detailer_id: d.id });
  return d;
}

export type AcceptResult = { ok: true; token: string } | { ok: false; reason: "taken" | "closed" | "invalid" };

/** First partner to accept wins: the booking is claimed with a conditional update. */
export async function acceptOffer(token: string, opts: { simulated?: boolean } = {}): Promise<AcceptResult> {
  const offer = await one("job_offers", { token });
  if (!offer) return { ok: false, reason: "invalid" };
  const [b, m] = await Promise.all([one("bookings", { id: offer.booking_id }), one("market_detailers", { id: offer.market_detailer_id })]);
  if (!b || !m || !validEmail(m.email) || m.status === "unsubscribed") return { ok: false, reason: "invalid" };
  if (offer.status === "passed") return { ok: false, reason: "closed" }; // they said no; the link can't be reused to win it
  if (offer.status === "accepted") {
    // re-opening the link signs them in only while the job is still theirs and active;
    // a forwarded or old email can't be used as a permanent portal login
    const d = b.detailer_id ? await one("detailers", { id: b.detailer_id }) : null;
    if (d && d.id === m.detailer_id && d.status === "approved" && b.status === "assigned") return { ok: true, token: d.access_token };
    return { ok: false, reason: "closed" };
  }
  if (!jobOpen(b)) {
    if (offer.status === "sent") await db.update("job_offers", { id: offer.id }, { status: "taken", responded_at: now() });
    return { ok: false, reason: b.detailer_id ? "taken" : "closed" };
  }
  const d = await detailerFor(m);
  if (d.status !== "approved") return { ok: false, reason: "invalid" }; // suspended or rejected account
  const rate = await commissionFor(d.id);
  const wasRequested = b.status === "requested";
  // Only one update can win: it must still have the status we read.
  const claimed = await db.update("bookings", { id: b.id, status: b.status }, { status: "assigned", detailer_id: d.id, commission_rate: rate });
  if (!claimed.length || claimed[0].detailer_id !== d.id) return { ok: false, reason: "taken" };

  await db.update("job_offers", { id: offer.id }, { status: "accepted", responded_at: now() });
  for (const o of await db.select("job_offers", { booking_id: b.id })) {
    if (o.id !== offer.id && o.status === "sent") await db.update("job_offers", { id: o.id }, { status: "taken" });
  }
  const portal = siteUrl(`/detailer/enter?token=${d.access_token}`);
  const toDetailer = opts.simulated
    ? (to: string, title: string, lines: string[]) => logEmail(to, title, lines.join("\n\n"))
    : (to: string, title: string, lines: string[], cta?: { label: string; url: string }) => sendEmail(to, title, lines, cta);
  if (opts.simulated) await addMessage(b.id, "admin", `Test mode: ${m.business_name} was picked at random to accept this job. No email was sent to them.`);
  await toDetailer(d.email, `You got the job: ${b.ref} on ${b.date}`, [
    `${b.package_name} · ${vehicleLabel(b.vehicle)} · ${b.date}, ${windowLabel(b.time_window)} in ${b.city}.`,
    "Open your BluePalm portal for the exact address, instructions and to message the customer. Mark the job complete there when you're done; the customer's card is charged then.",
    d.stripe_account_id ? "" : "To get paid automatically, tap \"Set up payouts with Stripe\" in your portal (about 5 minutes, once).",
  ].filter(Boolean), { label: "Open my portal", url: portal });
  const c = await one("customers", { id: b.customer_id });
  if (c) {
    await sendEmail(c.email, `Your detail is confirmed: ${b.ref}`, [
      `Good news, ${c.name.split(" ")[0]}! ${publicDetailerName(d)} will take care of your ${b.package_name} on ${b.date}, ${windowLabel(b.time_window)}.`,
      wasRequested ? "You can message us any time from your account page. BluePalm keeps your contact details private." : "Need to share anything? Message us from your account.",
    ], { label: "View booking", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  }
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `${m.business_name} took ${b.ref}`, [`${b.package_name} in ${b.city} on ${b.date}.`], { label: "Open booking", url: siteUrl(`/admin/bookings/${b.id}`) });
  }
  return { ok: true, token: d.access_token };
}

export async function passOffer(token: string) {
  const offer = await one("job_offers", { token });
  if (offer?.status === "sent") await db.update("job_offers", { id: offer.id }, { status: "passed", responded_at: now() });
}

/** Load researched businesses; matches existing rows by email or website so re-imports don't duplicate. */
/** "Hillsborough" / "Hillsborough County" → the county names used across BluePalm. */
export const normCounties = (list: string[]) => [...new Set(list.map((c) => COUNTIES.find((k) => k.name.toLowerCase().startsWith(c.trim().toLowerCase().replace(/ county$/, "")))?.name).filter((c): c is string => Boolean(c)))];

export type PartnerImport = Partial<MarketDetailer> & { service_radius_miles?: number | null; active_evidence?: string };
export async function importPartners(rows: PartnerImport[]) {
  const existing = await db.select("market_detailers");
  const key = (r: Partial<MarketDetailer>) => [r.email?.toLowerCase(), r.website?.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), r.business_name?.toLowerCase()];
  const seen = new Set(existing.flatMap((r) => key(r).filter(Boolean)));
  const fresh: MarketDetailer[] = [];
  for (const r of rows) {
    if (!r.business_name || key(r).some((k) => k && seen.has(k))) continue;
    // the researched list already carries coordinates; only hand-added ones are looked up
    const known = COUNTIES.flatMap((c) => c.cities).find((c) => c.name.toLowerCase() === (r.city ?? "").trim().toLowerCase());
    const at = r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon }
      : (r.address && await locate(r.address, r.city ?? "")) || known || (r.city ? await locate(null, r.city) : null);
    const radius = Number(r.service_radius_miles ?? r.radius_miles) || (r.mobile === false ? 5 : 15);
    const row: MarketDetailer = {
      id: newId(), business_name: r.business_name.slice(0, 120), owner_name: r.owner_name ?? null,
      email: validEmail(r.email ?? null) ? r.email!.toLowerCase() : null, phone: r.phone ?? null,
      website: r.website ?? null, logo_url: r.logo_url && /^https:\/\//.test(r.logo_url) ? r.logo_url : null,
      city: r.city ?? "", counties: normCounties(r.counties ?? []),
      mobile: r.mobile ?? true, address: r.address ?? null, lat: at?.lat ?? null, lon: at?.lon ?? null, radius_miles: Math.min(Math.max(radius, 1), 60),
      source_url: r.source_url ?? null, notes: (r.notes ?? r.active_evidence ?? "").slice(0, 300), status: "new", token: newToken(),
      invited_at: null, opted_in_at: null, unsubscribed_at: null, detailer_id: null, created_at: now(),
    };
    fresh.push(row);
    key(row).forEach((k) => k && seen.add(k));
  }
  await db.insertMany("market_detailers", fresh); // one database call
  return fresh.length;
}
