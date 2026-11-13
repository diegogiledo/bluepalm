import "server-only";
import crypto from "crypto";
import { db, one, getSetting } from "./db";
import { newId, newToken } from "./auth";
import { sendEmail, siteUrl } from "./notify";
import { TIME_WINDOWS, VEHICLES, LEGACY_VEHICLE_LABELS, POLICIES, LOYALTY, PROMOS } from "./config";
import { amountDue } from "./pricing";
import { chargeSavedCard, stripeEnabled } from "./stripe";
import type { BookingInput } from "./validation";
import type { Booking, Customer, Detailer, Package } from "./types";

export const now = () => new Date().toISOString();
/** Today's date (YYYY-MM-DD) in Florida time. */
export const todayFL = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const vehicleLabel = (id: string) => { const v = VEHICLES.find((x) => x.id === id); return v ? `${v.label} vehicle` : LEGACY_VEHICLE_LABELS[id] ?? id; };
export const windowLabel = (id: string) => {
  const w = TIME_WINDOWS.find((t) => t.id === id);
  return w ? `${w.label} (${w.hint})` : id;
};
export const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2).replace(/\.00$/, "")}`);

export async function activePackages(): Promise<Package[]> {
  return (await db.select("packages", { active: true })).sort((a, b) => a.sort - b.sort);
}

export async function checkZip(zip: string) {
  const z = await one("service_zips", { zip });
  return z && z.enabled ? { available: true as const, city: z.city, county: z.county } : { available: false as const };
}

/** Approved detailers serving a ZIP's county. Only first name + initial are public. */
export async function detailersForZip(zip: string) {
  const z = await one("service_zips", { zip });
  if (!z?.enabled) return [];
  return (await db.select("detailers", { status: "approved" }))
    .filter((d) => d.counties.includes(z.county))
    .map((d) => ({ id: d.id, label: publicDetailerName(d) }));
}
export const publicDetailerName = (d: Pick<Detailer, "name">) => {
  const [first, last] = d.name.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

function bookingRef() {
  return "BP-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
}

function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const nextRecurringDate = (from: string, freq: "biweekly" | "monthly") => addDays(from, freq === "biweekly" ? 14 : 30);

export async function upsertCustomer(input: { email: string; name: string; phone: string }) {
  const existing = await one("customers", { email: input.email });
  if (existing) {
    await db.update("customers", { id: existing.id }, { phone: input.phone || existing.phone });
    return { customer: existing, isNew: false };
  }
  const c: Customer = {
    id: newId(), email: input.email, name: input.name, phone: input.phone,
    access_token: newToken(), loyalty_points: 0, created_at: now(),
  };
  await db.insert("customers", c);
  return { customer: c, isNew: true };
}

export type SavedPayment = { customer: string; paymentMethod: string; label: string };
export async function createBooking(input: BookingInput, opts: { recurringPlanId?: string; customer?: Customer; payment?: SavedPayment } = {}) {
  const area = await checkZip(input.zip);
  if (!area.available) throw new UserError("zip", "We don't serve this ZIP code yet.");

  const today = todayFL();
  if (input.date <= today) throw new UserError("date", "Please choose a date from tomorrow onward.");
  if (input.date > addDays(today, 120)) throw new UserError("date", "Please choose a date within the next 4 months.");

  let pkg: Package | null = null;
  if (input.package_id !== "custom") {
    pkg = await one("packages", { id: input.package_id });
    if (!pkg?.active) throw new UserError("package_id", "That service is not available.");
  }
  let preferred: string | null = null;
  if (input.preferred_detailer_id) {
    const ok = (await detailersForZip(input.zip)).some((d) => d.id === input.preferred_detailer_id);
    preferred = ok ? input.preferred_detailer_id : null;
  }

  const { customer, isNew } = opts.customer
    ? { customer: opts.customer, isNew: false }
    : await upsertCustomer({ email: input.email, name: input.name, phone: input.phone });

  // Promotions (e.g. WELCOME10). First-booking offers only apply when this
  // customer has no earlier booking that wasn't cancelled.
  const code = (input.promo ?? "").toUpperCase();
  const promo = PROMOS[code];
  let promoStatus: "none" | "applied" | "not_first_booking" | "invalid" = code ? "invalid" : "none";
  if (promo && pkg) {
    const earlier = isNew ? [] : (await db.select("bookings", { customer_id: customer.id })).filter((b) => b.status !== "cancelled");
    promoStatus = promo.firstBookingOnly && earlier.length ? "not_first_booking" : "applied";
  }

  let planId = opts.recurringPlanId ?? null;
  if (!planId && (input.frequency === "biweekly" || input.frequency === "monthly")) {
    planId = newId();
    await db.insert("recurring_plans", {
      id: planId, customer_id: customer.id, frequency: input.frequency, package_id: input.package_id,
      vehicle: input.vehicle, zip: input.zip, address: input.address, city: input.city,
      time_window: input.time_window, preferred_detailer_id: preferred, status: "active",
      next_date: nextRecurringDate(input.date, input.frequency), created_at: now(),
    });
  }

  const booking: Booking = {
    id: newId(), ref: bookingRef(), customer_id: customer.id,
    zip: input.zip, address: input.address, city: input.city,
    vehicle: input.vehicle, vehicle_details: input.vehicle_details ?? "",
    package_id: input.package_id, package_name: pkg?.name ?? "Custom quote",
    price_estimate: pkg?.base_price ?? null,
    date: input.date, time_window: input.time_window, preferred_detailer_id: preferred,
    instructions: input.instructions ?? "", status: "requested", detailer_id: null,
    recurring_plan_id: planId, commission_rate: null, final_price: null,
    payment_status: opts.payment ? "card_on_file" : "unpaid", refund_amount: 0, payment_intent: null, checkout_url: null,
    promo_code: promoStatus === "applied" ? code : null, discount_pct: promoStatus === "applied" ? promo.pct : 0,
    stripe_customer_id: opts.payment?.customer ?? null, payment_method_id: opts.payment?.paymentMethod ?? null,
    card_label: opts.payment?.label ?? null, payment_error: null,
    cancel_reason: "", customer_rating: null, customer_feedback: "",
    created_at: now(), completed_at: null,
  };
  await db.insert("bookings", booking);

  const accountUrl = siteUrl(`/account/enter?token=${customer.access_token}`);
  await sendEmail(customer.email, `We received your booking request ${booking.ref}`, [
    `Hi ${customer.name.split(" ")[0]}, thanks for choosing BluePalm.`,
    `${booking.package_name} for your ${vehicleLabel(booking.vehicle).toLowerCase()} on ${booking.date}, ${windowLabel(booking.time_window)}, in ${booking.city}.`,
    `This is a request, not a confirmed appointment yet. Our team will review it and confirm by email shortly.`,
    booking.price_estimate != null ? `Starting price: ${money(booking.price_estimate)} — the final price may vary with vehicle size and condition. You won't be charged until your service is confirmed.` : "We'll follow up with a custom quote before anything is scheduled.",
    ...(booking.promo_code ? [`Your ${booking.promo_code} offer is applied: ${booking.discount_pct}% off your final price.`] : []),
    ...(booking.card_label ? [`Payment: ${booking.card_label} is saved securely with Stripe. It's only charged after your service is complete.`] : []),
    POLICIES.cancellation,
  ], { label: "View your bookings", url: accountUrl });
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `New booking request ${booking.ref}`, [
      `${booking.package_name} · ${vehicleLabel(booking.vehicle)} · ${booking.city} ${booking.zip} · ${booking.date} ${booking.time_window}`,
    ], { label: "Open in admin", url: siteUrl(`/admin/bookings/${booking.id}`) });
  }
  // email the job to local partner detailers in this county (never fails the booking)
  await (await import("./partners")).offerJob(booking);
  return { booking, isNewCustomer: isNew, accountToken: isNew ? customer.access_token : null, promoStatus };
}

export class UserError extends Error {
  constructor(public field: string, message: string) { super(message); }
}

/** Called when admin confirms a request. */
export async function notifyConfirmed(b: Booking) {
  const c = await one("customers", { id: b.customer_id });
  if (!c) return;
  const url = siteUrl(`/account/enter?token=${c.access_token}`);
  await sendEmail(c.email, `Your BluePalm detail is confirmed — ${b.ref}`, [
    `Great news, ${c.name.split(" ")[0]}! Your ${b.package_name} on ${b.date}, ${windowLabel(b.time_window)}, is confirmed.`,
    `We'll let you know when a detailer is assigned. You can message us any time from your account page — please keep all communication through BluePalm.`,
    POLICIES.cancellation,
  ], { label: "Manage booking", url });
}

export async function completeBooking(b: Booking) {
  const price = b.final_price ?? b.price_estimate ?? 0;
  const paid = amountDue({ ...b, final_price: price }) ?? 0; // after any promotion
  const rate = b.commission_rate ?? (await commissionFor(b.detailer_id));
  await db.update("bookings", { id: b.id }, { status: "completed", completed_at: now(), final_price: price, commission_rate: rate });
  if (b.payment_method_id && b.payment_status !== "paid") await chargeBookingCard({ ...b, final_price: price, commission_rate: rate });
  const c = await one("customers", { id: b.customer_id });
  if (c) {
    const per = await getSetting("loyalty_points_per_dollar", LOYALTY.pointsPerDollar);
    await db.update("customers", { id: c.id }, { loyalty_points: c.loyalty_points + Math.round(paid * per) });
    await sendEmail(c.email, `Your car is sparkling — ${b.ref} complete`, [
      `Thanks for choosing BluePalm, ${c.name.split(" ")[0]}! Your ${b.package_name} is complete.`,
      `You earned ${Math.round(paid * per)} loyalty points. Rate your detailer and rebook in one tap from your account.`,
      POLICIES.guarantee,
    ], { label: "Rate & rebook", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  }
}

/**
 * Charge the card / Apple Pay saved at booking for what the customer owes.
 * The detailer's share goes straight to their Stripe account when connected;
 * BluePalm keeps the commission. Failures are recorded for staff to follow up.
 */
export async function chargeBookingCard(b: Booking): Promise<{ ok: boolean; error?: string }> {
  if (!b.payment_method_id || !b.stripe_customer_id || !stripeEnabled()) return { ok: false, error: "No saved card" };
  const due = amountDue(b);
  if (due == null || due <= 0) return { ok: false, error: "No amount to charge yet" };
  const rate = b.commission_rate ?? (await commissionFor(b.detailer_id));
  const d = b.detailer_id ? await one("detailers", { id: b.detailer_id }) : null;
  try {
    const pi = await chargeSavedCard({
      bookingId: b.id, ref: b.ref, amountCents: Math.round(due * 100), commissionCents: Math.round(due * rate * 100),
      customer: b.stripe_customer_id, paymentMethod: b.payment_method_id, destination: d?.stripe_account_id && d.onboarding.payouts_connected ? d.stripe_account_id : null,
      description: `BluePalm ${b.package_name} (${b.ref})`,
    });
    const paid = pi.status === "succeeded";
    await db.update("bookings", { id: b.id }, { payment_intent: pi.id, payment_status: paid ? "paid" : "payment_failed", payment_error: paid ? null : `Payment ${pi.status}` });
    return { ok: paid, error: paid ? undefined : `Payment ${pi.status}` };
  } catch (e) {
    const msg = String((e as Error).message ?? e).replace(/^Stripe: /, "").slice(0, 300);
    await db.update("bookings", { id: b.id }, { payment_status: "payment_failed", payment_error: msg });
    if (process.env.ADMIN_NOTIFY_EMAIL) {
      await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `Card charge failed for ${b.ref}`, [`${msg}`, "Open the booking to retry the card or send the customer a payment link."],
        { label: "Open booking", url: siteUrl(`/admin/bookings/${b.id}`) });
    }
    return { ok: false, error: msg };
  }
}

export async function commissionFor(detailerId: string | null) {
  const global = await getSetting("commission_rate", 0.2);
  if (!detailerId) return global;
  const d = await one("detailers", { id: detailerId });
  return d?.commission_rate ?? global;
}

export async function addMessage(bookingId: string, sender: "customer" | "detailer" | "admin", body: string) {
  body = body.trim().slice(0, 1500);
  if (!body) return;
  await db.insert("messages", { id: newId(), booking_id: bookingId, sender, body, created_at: now() });
}

/** The card saved on an earlier booking, so rebookings and recurring visits reuse it. */
export const savedPaymentOf = (b?: Pick<Booking, "payment_method_id" | "stripe_customer_id" | "card_label"> | null): SavedPayment | undefined =>
  b?.payment_method_id && b.stripe_customer_id ? { customer: b.stripe_customer_id, paymentMethod: b.payment_method_id, label: b.card_label ?? "Saved card" } : undefined;
