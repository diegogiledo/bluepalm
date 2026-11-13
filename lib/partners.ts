import "server-only";
import { db, one } from "./db";
import { newId, newToken } from "./auth";
import { mailingAddress, sendEmail, sendPartnerEmails, siteUrl } from "./notify";
import { commissionFor, money, now, publicDetailerName, todayFL, vehicleLabel, windowLabel } from "./services";
import { amountDue } from "./pricing";
import { locate } from "./geo";
import { COUNTIES } from "./config";
import type { Booking, Detailer, JobOffer, MarketDetailer } from "./types";

/**
 * Local detailing businesses ("partners") that BluePalm sends customers to.
 *
 * 1. Admin sends a one-time invite. Only partners who click "Yes" get jobs.
 * 2. Every new booking is emailed to opted-in partners serving its county.
 * 3. The first partner to accept is assigned; the others see "already taken".
 *    The winner gets a BluePalm portal account (address, messages, payouts).
 * Emails never include the customer's contact details.
 */

const unsubUrl = (md: MarketDetailer) => siteUrl(`/api/partners/unsubscribe?t=${encodeURIComponent(md.token)}`);
const validEmail = (e: string | null): e is string => Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

export const canEmailPartners = () => Boolean(mailingAddress());

/** Send the one-time invite to the given partners (skips unsubscribed / no email). */
export async function invitePartners(ids: string[]): Promise<{ sent: number; skipped: number }> {
  if (!canEmailPartners()) throw new Error("Set BUSINESS_MAILING_ADDRESS before emailing partners.");
  const all = await db.select("market_detailers");
  const targets = all.filter((m) => ids.includes(m.id) && validEmail(m.email) && (m.status === "new" || m.status === "invited"));
  const sent = await sendPartnerEmails(targets.map((m) => ({
    to: m.email!,
    title: `Free customer leads for ${m.business_name}`,
    lines: [
      `Hi${m.owner_name ? ` ${m.owner_name.split(" ")[0]}` : ""},`,
      `BluePalm Auto Care books mobile car detailing for customers in ${m.counties.join(", ") || "Tampa Bay and Sarasota"}. We're looking for local detailers like ${m.business_name} to take those jobs.`,
      "How it works: when a customer books in your area we email you the job (service, vehicle size, city, date and your payout). The first detailer to accept gets it. The customer pays by card through BluePalm and your share is paid to your bank through Stripe.",
      "No sign-up fee, no monthly cost and no minimum: take only the jobs you want.",
      "Want job emails? Click below. If not, ignore this email and we won't send another.",
    ],
    cta: { label: "Yes, send me jobs", url: siteUrl(`/partners/${m.token}`) },
    unsubscribeUrl: unsubUrl(m),
  })));
  if (sent) {
    const sentIds = new Set(targets.slice(0, sent).map((m) => m.id));
    for (const m of targets) if (sentIds.has(m.id)) await db.update("market_detailers", { id: m.id }, { status: m.status === "new" ? "invited" : m.status, invited_at: now() });
  }
  return { sent, skipped: ids.length - targets.length };
}

export async function optIn(token: string) {
  const m = await one("market_detailers", { token });
  if (!m || m.status === "unsubscribed") return m;
  if (m.status !== "opted_in") await db.update("market_detailers", { id: m.id }, { status: "opted_in", opted_in_at: now() });
  return { ...m, status: "opted_in" as const };
}

export async function unsubscribe(token: string) {
  const m = await one("market_detailers", { token });
  if (!m) return null;
  if (m.status !== "unsubscribed") await db.update("market_detailers", { id: m.id }, { status: "unsubscribed", unsubscribed_at: now() });
  return m;
}

/** What the detailer earns, shown in job emails. */
async function payoutText(b: Booking) {
  const due = amountDue(b);
  if (due == null) return "Custom quote: price agreed before the job";
  const rate = await commissionFor(null);
  return `about ${money(Math.round(due * (1 - rate) * 100) / 100)} (customer price ${money(due)}, less BluePalm's ${(rate * 100).toFixed(0)}% fee)`;
}

/** Email a new booking to every opted-in partner serving its county. Never throws. */
export async function offerJob(b: Booking) {
  try {
    if (!canEmailPartners()) return 0;
    const zip = await one("service_zips", { zip: b.zip });
    if (!zip) return 0;
    const partners = (await db.select("market_detailers", { status: "opted_in" }))
      .filter((m) => validEmail(m.email) && m.counties.includes(zip.county));
    if (!partners.length) return 0;
    const payout = await payoutText(b);
    const offers: JobOffer[] = partners.map((m) => ({ id: newId(), booking_id: b.id, market_detailer_id: m.id, token: newToken(), status: "sent", sent_at: now(), responded_at: null }));
    await db.insertMany("job_offers", offers);
    return await sendPartnerEmails(partners.map((m, i) => ({
      to: m.email!,
      title: `New job in ${b.city}: ${b.package_name} on ${b.date}`,
      lines: [
        `A BluePalm customer in ${b.city} (${b.zip}) needs a detailer.`,
        `Service: ${b.package_name} · ${vehicleLabel(b.vehicle)}`,
        `When: ${b.date}, ${windowLabel(b.time_window)}`,
        `Your payout: ${payout}`,
        "First to accept gets the job. The address and instructions are shown once you accept.",
      ],
      cta: { label: "View & accept job", url: siteUrl(`/jobs/${offers[i].token}`) },
      unsubscribeUrl: unsubUrl(m),
    })));
  } catch (e) {
    console.error("offerJob failed", e);
    return 0;
  }
}

/** Is this booking still open for a partner to take? */
export const jobOpen = (b: Booking) => (b.status === "requested" || b.status === "confirmed") && !b.detailer_id && b.date >= todayFL();

/** The portal account a partner uses after winning a job (created on first win). */
async function detailerFor(m: MarketDetailer): Promise<Detailer> {
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
export async function acceptOffer(token: string): Promise<AcceptResult> {
  const offer = await one("job_offers", { token });
  if (!offer) return { ok: false, reason: "invalid" };
  const [b, m] = await Promise.all([one("bookings", { id: offer.booking_id }), one("market_detailers", { id: offer.market_detailer_id })]);
  if (!b || !m || !validEmail(m.email) || m.status === "unsubscribed") return { ok: false, reason: "invalid" };
  if (offer.status === "accepted" && b.detailer_id) {
    const d = await one("detailers", { id: b.detailer_id });
    if (d && d.id === m.detailer_id) return { ok: true, token: d.access_token };
  }
  if (!jobOpen(b)) {
    if (offer.status === "sent") await db.update("job_offers", { id: offer.id }, { status: "taken", responded_at: now() });
    return { ok: false, reason: b.detailer_id ? "taken" : "closed" };
  }
  const d = await detailerFor(m);
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
  await sendEmail(d.email, `You got the job: ${b.ref} on ${b.date}`, [
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
