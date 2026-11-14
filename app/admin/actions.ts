"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, one, setSetting } from "@/lib/db";
import { authenticateStaff, endStaffSession, loginRateLimited, requireStaff, startStaffSession } from "@/lib/auth";
import { addMessage, chargeBookingCard, commissionFor, completeBooking, createBooking, nextRecurringDate, notifyConfirmed, savedPaymentOf, todayFL } from "@/lib/services";
import { sendEmail, siteUrl } from "@/lib/notify";
import { createBookingCheckout, refundPaymentIntent, stripeEnabled } from "@/lib/stripe";
import type { BookingStatus } from "@/lib/types";
import { importPartners, type PartnerImport } from "@/lib/partners";
import { amountDue } from "@/lib/pricing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const n = Number(str(f, k)); return Number.isFinite(n) ? n : NaN; };

// ---------- auth ----------
export async function login(_: unknown, form: FormData) {
  const email = str(form, "email").toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const key = `${email}|${ip}`;
  if (loginRateLimited(key)) return { error: "Too many attempts. Try again in 15 minutes.", email };
  const s = await authenticateStaff(email, str(form, "password"), key);
  if (!s) return { error: "Invalid email or password.", email };
  await startStaffSession(s);
  redirect("/admin");
}
export async function logout() {
  await endStaffSession();
  redirect("/admin/login");
}

// ---------- bookings ----------
async function bookingOr404(id: string) {
  const b = await one("bookings", { id });
  if (!b) throw new Error("Booking not found");
  return b;
}
function done(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/bookings/${id}`);
}

export async function setBookingStatus(form: FormData) {
  await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  const to = str(form, "status") as BookingStatus;
  if (to === "confirmed" && b.status === "requested") {
    await db.update("bookings", { id: b.id }, { status: "confirmed" });
    await notifyConfirmed(b);
  } else if (to === "completed" && ["assigned", "confirmed"].includes(b.status)) {
    await completeBooking(b);
  } else if (to === "confirmed" && b.status === "assigned") {
    await db.update("bookings", { id: b.id }, { status: "confirmed", detailer_id: null }); // unassign
  }
  done(b.id);
}

export async function assignDetailer(form: FormData) {
  await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  const detailerId = str(form, "detailer_id");
  if (!detailerId) {
    await db.update("bookings", { id: b.id }, { detailer_id: null, status: b.status === "assigned" ? "confirmed" : b.status });
    return done(b.id);
  }
  const d = await one("detailers", { id: detailerId });
  if (!d || d.status !== "approved") return;
  const wasRequested = b.status === "requested";
  await db.update("bookings", { id: b.id }, { detailer_id: d.id, status: "assigned", commission_rate: await commissionFor(d.id) });
  if (wasRequested) await notifyConfirmed(b);
  await sendEmail(d.email, `New BluePalm job assigned — ${b.ref}`, [`${b.package_name} on ${b.date} in ${b.city}. Open your portal for the address and instructions.`],
    { label: "Open portal", url: siteUrl(`/detailer/enter?token=${d.access_token}`) });
  done(b.id);
}

export async function updatePricing(form: FormData) {
  await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  const price = num(form, "final_price");
  if (!(price >= 0 && price < 10000)) return;
  await db.update("bookings", { id: b.id }, { final_price: Math.round(price * 100) / 100 });
  done(b.id);
}

export async function sendPaymentLink(form: FormData) {
  await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  const c = await one("customers", { id: b.customer_id });
  const price = amountDue(b); // after any promotion
  if (!c || price == null || !stripeEnabled()) return;
  const rate = b.commission_rate ?? (await commissionFor(b.detailer_id));
  const d = b.detailer_id ? await one("detailers", { id: b.detailer_id }) : null;
  const session = await createBookingCheckout({
    bookingId: b.id, ref: b.ref, amountCents: Math.round(price * 100), commissionCents: Math.round(price * rate * 100),
    customerEmail: c.email, destination: d?.stripe_account_id && d.onboarding.payouts_connected ? d.stripe_account_id : null, description: `BluePalm ${b.package_name} (${b.ref})`,
    successUrl: siteUrl("/account?paid=1"), cancelUrl: siteUrl("/account"),
  });
  await db.update("bookings", { id: b.id }, { payment_status: "payment_link_sent", checkout_url: session.url });
  await sendEmail(c.email, `Payment for ${b.ref}`, [`Your ${b.package_name} total is $${price}. Pay securely with Stripe using the button below.`], { label: "Pay securely", url: session.url });
  done(b.id);
}

export async function markPaid(form: FormData) {
  await requireStaff(["admin"]);
  const b = await bookingOr404(str(form, "id"));
  await db.update("bookings", { id: b.id }, { payment_status: "paid" });
  done(b.id);
}

export async function cancelOrRefund(form: FormData) {
  const staff = await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  const reason = str(form, "reason").slice(0, 300);
  const refund = num(form, "refund") || 0;
  if (refund > 0) {
    if (staff.role !== "admin") return; // refunds are admin-only
    const paid = amountDue(b) ?? 0;
    const amt = Math.min(refund, paid - b.refund_amount);
    if (amt <= 0) return;
    if (b.payment_intent && stripeEnabled()) {
      try { await refundPaymentIntent(b.payment_intent, Math.round(amt * 100)); }
      catch (e) {
        // show the reason on the booking page instead of crashing
        await db.update("bookings", { id: b.id }, { payment_error: `Refund failed: ${String((e as Error).message ?? e).replace(/^Stripe: /, "").slice(0, 280)}` });
        return done(b.id);
      }
    }
    const total = b.refund_amount + amt;
    await db.update("bookings", { id: b.id }, { refund_amount: total, payment_error: null, payment_status: total >= paid ? "refunded" : "partially_refunded" });
    // points were earned when the job was completed; take back the refunded part
    if (b.status === "completed") {
      const c = await one("customers", { id: b.customer_id });
      const per = Number((await one("settings", { key: "loyalty_points_per_dollar" }))?.value ?? 1);
      if (c) await db.update("customers", { id: c.id }, { loyalty_points: Math.max(0, c.loyalty_points - Math.round(amt * per)) });
    }
  }
  if (str(form, "cancel") === "1" && b.status !== "cancelled" && b.status !== "completed") {
    await db.update("bookings", { id: b.id }, { status: "cancelled", cancel_reason: `Cancelled by BluePalm: ${reason}` });
    const c = await one("customers", { id: b.customer_id });
    if (c) await sendEmail(c.email, `Booking ${b.ref} cancelled`, [`Your ${b.package_name} on ${b.date} has been cancelled.${reason ? ` Reason: ${reason}.` : ""}`, refund > 0 ? `A refund of $${refund} has been issued.` : "Contact us with any questions."]);
  }
  done(b.id);
}

/**
 * Permanently delete a booking and its messages (admin only, must tick the
 * confirm box). A booking that still holds a customer's money can't be
 * deleted — refund it first, so no payment loses its record.
 */
export async function deleteBooking(_: unknown, form: FormData): Promise<{ error?: string } | null> {
  await requireStaff(["admin"]);
  const b = await one("bookings", { id: str(form, "id") });
  if (!b) return { error: "This booking was already deleted." };
  if (str(form, "confirm") !== "1") return { error: "Tick the box to confirm." };
  if (b.payment_status === "paid" || b.payment_status === "partially_refunded")
    return { error: "This booking has a payment that hasn't been fully refunded. Refund it first, then delete it." };
  await db.remove("messages", { booking_id: b.id });
  await db.remove("job_offers", { booking_id: b.id });
  await db.remove("bookings", { id: b.id });
  revalidatePath("/admin", "layout");
  redirect("/admin/bookings?deleted=" + encodeURIComponent(b.ref));
}

export async function adminMessage(form: FormData) {
  await requireStaff();
  const b = await bookingOr404(str(form, "id"));
  await addMessage(b.id, "admin", str(form, "body"));
  const c = await one("customers", { id: b.customer_id });
  if (c && str(form, "notify") === "1") await sendEmail(c.email, `New message about ${b.ref}`, [str(form, "body").slice(0, 500)], { label: "Reply", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  done(b.id);
}

// ---------- detailers ----------
export async function reviewDetailer(form: FormData) {
  await requireStaff(["admin"]);
  const d = await one("detailers", { id: str(form, "id") });
  if (!d) return;
  const decision = str(form, "decision");
  if (decision === "approve") {
    await db.update("detailers", { id: d.id }, { status: "approved" });
    await sendEmail(d.email, "Welcome to BluePalm — you're approved!", [
      `Congratulations ${d.name.split(" ")[0]}, your application is approved.`,
      "Open your portal to finish onboarding (insurance verification, background check, orientation and payout setup). You can accept jobs once verification is complete.",
    ], { label: "Open detailer portal", url: siteUrl(`/detailer/enter?token=${d.access_token}`) });
  } else if (decision === "reject") {
    await db.update("detailers", { id: d.id }, { status: "rejected" });
    await sendEmail(d.email, "Your BluePalm application", [`Thank you for your interest in BluePalm, ${d.name.split(" ")[0]}. We're not able to move forward with your application at this time.`]);
  } else if (decision === "suspend") {
    await db.update("detailers", { id: d.id }, { status: "suspended" });
  }
  revalidatePath("/admin/detailers");
}

export async function updateDetailer(form: FormData) {
  await requireStaff(["admin"]);
  const d = await one("detailers", { id: str(form, "id") });
  if (!d) return;
  const rateRaw = str(form, "commission_rate");
  const rate = rateRaw === "" ? null : Number(rateRaw) / 100;
  await db.update("detailers", { id: d.id }, {
    onboarding: {
      insurance_verified: form.get("insurance_verified") === "on", background_check: form.get("background_check") === "on",
      orientation: form.get("orientation") === "on", payouts_connected: form.get("payouts_connected") === "on",
    },
    commission_rate: rate != null && rate >= 0 && rate <= 0.6 ? rate : null,
    admin_notes: str(form, "admin_notes").slice(0, 2000),
  });
  revalidatePath("/admin/detailers");
}

// ---------- settings (admin only) ----------
export async function savePackage(form: FormData) {
  await requireStaff(["admin"]);
  const id = str(form, "id");
  const p = await one("packages", { id });
  const price = num(form, "base_price");
  if (!p || !(price > 0 && price < 5000)) return;
  await db.update("packages", { id }, {
    name: str(form, "name").slice(0, 60) || p.name, tagline: str(form, "tagline").slice(0, 160),
    base_price: Math.round(price), duration_hint: str(form, "duration_hint").slice(0, 40),
    features: str(form, "features").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12),
    active: form.get("active") === "on",
  });
  revalidatePath("/", "layout");
}

export async function saveCommission(form: FormData) {
  await requireStaff(["admin"]);
  const r = num(form, "commission_rate") / 100;
  if (r >= 0 && r <= 0.6) await setSetting("commission_rate", r);
  const pts = num(form, "loyalty_points_per_dollar");
  if (pts >= 0 && pts <= 10) await setSetting("loyalty_points_per_dollar", pts);
  revalidatePath("/admin", "layout");
}

export async function saveZip(form: FormData) {
  await requireStaff(["admin"]);
  const zip = str(form, "zip");
  if (!/^\d{5}$/.test(zip)) return;
  const existing = await one("service_zips", { zip });
  const action = str(form, "action");
  if (action === "toggle" && existing) await db.update("service_zips", { zip }, { enabled: !existing.enabled });
  else if (action === "delete" && existing) await db.remove("service_zips", { zip });
  else if (action === "add" && !existing) {
    const city = str(form, "city").slice(0, 60), county = str(form, "county").slice(0, 60);
    if (city && county) await db.insert("service_zips", { zip, city, county, enabled: form.get("enabled") === "on" });
  }
  revalidatePath("/admin/areas");
}

// ---------- recurring ----------
export async function generateRecurring(form: FormData) {
  await requireStaff();
  const plan = await one("recurring_plans", { id: str(form, "id") });
  if (!plan || plan.status !== "active") return;
  const c = await one("customers", { id: plan.customer_id });
  if (!c) return;
  let date = plan.next_date;
  while (date <= todayFL()) date = nextRecurringDate(date, plan.frequency);
  await createBooking({
    zip: plan.zip, address: plan.address, city: plan.city, vehicle: plan.vehicle, vehicle_details: "",
    package_id: plan.package_id, date, time_window: plan.time_window, preferred_detailer_id: plan.preferred_detailer_id,
    frequency: "none", name: c.name, email: c.email, phone: c.phone, instructions: "Recurring plan visit", promo: "", setup_intent: "",
  }, { customer: c, recurringPlanId: plan.id, payment: savedPaymentOf((await db.select("bookings", { customer_id: c.id })).filter((x) => x.payment_method_id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]) });
  await db.update("recurring_plans", { id: plan.id }, { next_date: nextRecurringDate(date, plan.frequency) });
  revalidatePath("/admin/recurring");
}

export async function setPlanStatus(form: FormData) {
  await requireStaff();
  const status = str(form, "status");
  if (!["active", "paused", "cancelled"].includes(status)) return;
  await db.update("recurring_plans", { id: str(form, "id") }, { status: status as "active" });
  revalidatePath("/admin/recurring");
}

export async function chargeCard(form: FormData) {
  await requireStaff(["admin"]);
  const b = await bookingOr404(str(form, "id"));
  if (b.payment_status === "paid") return;
  await chargeBookingCard(b);
  done(b.id);
}

// ---------- partner detailers (existing local businesses) ----------
const partnerDone = () => revalidatePath("/admin/detailers");
type PartnerState = { ok?: string; error?: string } | null;

/** Load the researched list bundled with the site (skips ones already added). */
export async function importResearchedPartners(_: PartnerState): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const rows = (await import("@/lib/data/market-detailers.json")).default as PartnerImport[];
  const added = await importPartners(rows);
  partnerDone();
  return { ok: added ? `Added ${added} detailer${added > 1 ? "s" : ""}.` : "Everything in the researched list is already here." };
}

export async function addPartner(_: PartnerState, form: FormData): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const name = str(form, "business_name");
  if (!name) return { error: "Business name is required." };
  const added = await importPartners([{
    business_name: name, owner_name: str(form, "owner_name") || null, email: str(form, "email") || null,
    phone: str(form, "phone") || null, website: str(form, "website") || null, logo_url: str(form, "logo_url") || null,
    address: str(form, "address") || null, city: str(form, "city"), counties: form.getAll("counties").map(String),
    radius_miles: num(form, "radius_miles") || 15, mobile: true,
  }]);
  partnerDone();
  return added ? { ok: `${name} added.` } : { error: "That business is already in the list." };
}

export async function setPartnerStatus(form: FormData) {
  await requireStaff(["admin"]);
  const m = await one("market_detailers", { id: str(form, "id") });
  if (!m) return;
  const to = str(form, "status");
  if (to === "unsubscribed") await db.update("market_detailers", { id: m.id }, { status: "unsubscribed", unsubscribed_at: new Date().toISOString() });
  if (to === "active") await db.update("market_detailers", { id: m.id }, { status: "new", unsubscribed_at: null });
  partnerDone();
}

export async function updatePartner(form: FormData) {
  await requireStaff(["admin"]);
  const m = await one("market_detailers", { id: str(form, "id") });
  if (!m) return;
  const email = str(form, "email").toLowerCase();
  await db.update("market_detailers", { id: m.id }, {
    business_name: str(form, "business_name") || m.business_name, owner_name: str(form, "owner_name") || null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, phone: str(form, "phone") || null,
    website: str(form, "website") || null, logo_url: /^https:\/\//.test(str(form, "logo_url")) ? str(form, "logo_url") : null,
    counties: form.getAll("counties").map(String), radius_miles: Math.min(Math.max(num(form, "radius_miles") || m.radius_miles, 1), 60),
  });
  partnerDone();
}

export async function deletePartner(form: FormData) {
  await requireStaff(["admin"]);
  const id = str(form, "id");
  await db.remove("job_offers", { market_detailer_id: id });
  await db.remove("market_detailers", { id });
  partnerDone();
}

// ---------- test data (your computer only) ----------
export async function makeTestBookings(_: PartnerState, form: FormData): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const { canMakeTestData, generateTestBookings } = await import("@/lib/test-data");
  if (!canMakeTestData()) return { error: "Test data can only be made on your computer with Stripe test keys." };
  const n = Math.min(Math.max(Math.round(num(form, "count")) || 10, 1), 30);
  try {
    const made = await generateTestBookings(n);
    revalidatePath("/admin", "layout");
    return { ok: `Made ${made.length} test bookings (${made.filter((m) => m.completed).length} completed): ${made.map((m) => m.ref).join(", ")}` };
  } catch (e) { return { error: String((e as Error).message ?? e) }; }
}

export async function wipeTestBookings(_: PartnerState): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const { deleteTestData } = await import("@/lib/test-data");
  try {
    const n = await deleteTestData();
    revalidatePath("/admin", "layout");
    return { ok: n ? `Deleted ${n} test bookings.` : "No test bookings to delete." };
  } catch (e) { return { error: String((e as Error).message ?? e) }; }
}

export async function makeTestHistory(_: PartnerState, form: FormData): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const { canMakeTestData, generateTestHistory } = await import("@/lib/test-data");
  if (!canMakeTestData()) return { error: "Test data can only be made on your computer with Stripe test keys." };
  try {
    const scale = [1, 5, 10, 12].includes(num(form, "scale")) ? num(form, "scale") : 1;
    const r = await generateTestHistory(6, scale);
    revalidatePath("/admin", "layout");
    return { ok: `Added ${r.bookings} past bookings (${r.completed} completed) and ${r.expenses} test expenses over the last 6 months.` };
  } catch (e) { return { error: String((e as Error).message ?? e) }; }
}

// ---------- finance: operating expenses ----------
export async function addExpense(_: PartnerState, form: FormData): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const month = str(form, "month"), category = str(form, "category").slice(0, 40), amount = num(form, "amount");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick a month." };
  if (!category) return { error: "Pick a category." };
  if (!(amount >= 0) || amount > 1e7) return { error: "Enter an amount." };
  const { newId } = await import("@/lib/auth");
  await db.insert("expenses", { id: newId(), month, category, amount: Math.round(amount * 100) / 100, note: str(form, "note").slice(0, 120), created_at: new Date().toISOString() });
  revalidatePath("/admin/finance");
  return { ok: `Added ${category} for ${month}.` };
}
export async function deleteExpense(form: FormData) {
  await requireStaff(["admin"]);
  await db.remove("expenses", { id: str(form, "id") });
  revalidatePath("/admin/finance");
}

// ---------- pricing rules: size fees, add-ons, payout boost ----------
export async function savePricingRules(_: PartnerState, form: FormData): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const { pricingRules } = await import("@/lib/pricing-rules");
  const cur = await pricingRules();
  const money = (k: string, max = 1000) => { const n = num(form, k); return n >= 0 && n <= max ? Math.round(n) : null; };
  const sizeFees = { small: money("size_small") ?? cur.sizeFees.small, medium: money("size_medium") ?? cur.sizeFees.medium, large: money("size_large") ?? cur.sizeFees.large };
  const addons = cur.addons.map((a) => ({
    ...a,
    label: str(form, `addon_${a.id}_label`).slice(0, 60) || a.label,
    price: money(`addon_${a.id}_price`) ?? a.price,
    hint: str(form, `addon_${a.id}_hint`).slice(0, 100),
    active: form.get(`addon_${a.id}_active`) === "on",
  })).filter((a) => form.get(`addon_${a.id}_remove`) !== "on");
  const newLabel = str(form, "addon_new_label").slice(0, 60);
  const newPrice = money("addon_new_price");
  if (newLabel && newPrice != null) {
    const id = newLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || `addon_${Date.now()}`;
    if (!addons.some((a) => a.id === id)) addons.push({ id, label: newLabel, price: newPrice, hint: str(form, "addon_new_hint").slice(0, 100), active: true });
  }
  const boost = {
    enabled: form.get("boost_enabled") === "on",
    afterHours: Math.min(Math.max(num(form, "boost_after") || cur.boost.afterHours, 1), 48),
    step: Math.min(Math.max(num(form, "boost_step") || cur.boost.step, 1), 20),
    maxBoosts: Math.min(Math.max(Math.round(num(form, "boost_max") || cur.boost.maxBoosts), 1), 5),
    minCommission: Math.min(Math.max(num(form, "boost_min") ?? cur.boost.minCommission, 0), 50),
  };
  await setSetting("pricing_rules", { sizeFees, addons, boost });
  revalidatePath("/", "layout");
  return { ok: "Pricing saved. New bookings use it right away." };
}

/** Run the payout boost check now (it also runs hourly on the live site). */
export async function runBoostNow(_: PartnerState): Promise<PartnerState> {
  await requireStaff(["admin"]);
  const { runBoosts } = await import("@/lib/boost");
  const r = await runBoosts();
  revalidatePath("/admin", "layout");
  return { ok: r.boosted.length ? `Boosted ${r.boosted.join(", ")}; re-sent ${r.emailed} job emails.` : "No jobs needed a boost right now." };
}
