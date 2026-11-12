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
    customerEmail: c.email, destination: d?.stripe_account_id ?? null, description: `BluePalm ${b.package_name} (${b.ref})`,
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
    if (b.payment_intent && stripeEnabled()) await refundPaymentIntent(b.payment_intent, Math.round(amt * 100));
    const total = b.refund_amount + amt;
    await db.update("bookings", { id: b.id }, { refund_amount: total, payment_status: total >= paid ? "refunded" : "partially_refunded" });
  }
  if (str(form, "cancel") === "1" && b.status !== "cancelled" && b.status !== "completed") {
    await db.update("bookings", { id: b.id }, { status: "cancelled", cancel_reason: `Cancelled by BluePalm: ${reason}` });
    const c = await one("customers", { id: b.customer_id });
    if (c) await sendEmail(c.email, `Booking ${b.ref} cancelled`, [`Your ${b.package_name} on ${b.date} has been cancelled.${reason ? ` Reason: ${reason}.` : ""}`, refund > 0 ? `A refund of $${refund} has been issued.` : "Contact us with any questions."]);
  }
  done(b.id);
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
