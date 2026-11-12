"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, one } from "@/lib/db";
import { getCustomer, getDetailer, CUSTOMER_COOKIE, DETAILER_COOKIE } from "@/lib/portal";
import { addMessage, createBooking, todayFL, UserError, nextRecurringDate } from "@/lib/services";
import { sendEmail, siteUrl } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { TIME_WINDOWS } from "@/lib/config";

async function customerOrRedirect() {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  return c;
}
async function ownBooking(id: string) {
  const c = await customerOrRedirect();
  const b = await one("bookings", { id });
  if (!b || b.customer_id !== c.id) throw new Error("Not found");
  return { c, b };
}

export async function requestMagicLink(kind: "customer" | "detailer", _: unknown, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!rateLimit(`magic:${ip}`, 6, 15 * 60_000) || !rateLimit(`magic:${email}`, 3, 15 * 60_000)) {
    return { error: "Too many requests. Please try again in a few minutes." };
  }
  if (kind === "customer") {
    const c = await one("customers", { email });
    if (c) await sendEmail(c.email, "Your BluePalm sign-in link", ["Use the button below to view and manage your BluePalm bookings."], { label: "View my bookings", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  } else {
    const d = await one("detailers", { email });
    if (d?.status === "approved") await sendEmail(d.email, "Your BluePalm detailer portal link", ["Use the button below to open your detailer dashboard."], { label: "Open detailer portal", url: siteUrl(`/detailer/enter?token=${d.access_token}`) });
  }
  // Same response either way so emails can't be enumerated.
  return { ok: "If that email is registered with BluePalm, a sign-in link is on its way." };
}

export async function signOut(kind: "customer" | "detailer") {
  (await cookies()).delete(kind === "customer" ? CUSTOMER_COOKIE : DETAILER_COOKIE);
  redirect("/");
}

export async function cancelBooking(form: FormData) {
  const { c, b } = await ownBooking(String(form.get("id")));
  if (!["requested", "confirmed", "assigned"].includes(b.status)) return;
  await db.update("bookings", { id: b.id }, { status: "cancelled", cancel_reason: "Cancelled by customer: " + String(form.get("reason") ?? "").slice(0, 300) });
  await sendEmail(c.email, `Booking ${b.ref} cancelled`, [`Your ${b.package_name} on ${b.date} has been cancelled. If a refund applies, our team will process it and let you know.`]);
  if (process.env.ADMIN_NOTIFY_EMAIL) await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `Customer cancelled ${b.ref}`, [`${b.package_name} on ${b.date} in ${b.city}.`]);
  revalidatePath("/account");
}

export async function sendCustomerMessage(form: FormData) {
  const { b } = await ownBooking(String(form.get("id")));
  await addMessage(b.id, "customer", String(form.get("body") ?? ""));
  revalidatePath("/account");
}

export async function rateBooking(form: FormData) {
  const { b } = await ownBooking(String(form.get("id")));
  const rating = Number(form.get("rating"));
  if (b.status !== "completed" || !(rating >= 1 && rating <= 5)) return;
  await db.update("bookings", { id: b.id }, { customer_rating: Math.round(rating), customer_feedback: String(form.get("feedback") ?? "").slice(0, 1000) });
  revalidatePath("/account");
}

export async function rebook(_: unknown, form: FormData) {
  const { c, b } = await ownBooking(String(form.get("id")));
  const date = String(form.get("date") ?? "");
  const time_window = String(form.get("time_window") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= todayFL()) return { error: "Choose a date from tomorrow onward." };
  if (!TIME_WINDOWS.some((t) => t.id === time_window)) return { error: "Choose a time window." };
  try {
    const { booking } = await createBooking({
      zip: b.zip, address: b.address, city: b.city, vehicle: b.vehicle, vehicle_details: b.vehicle_details,
      package_id: b.package_id, date, time_window, preferred_detailer_id: b.detailer_id ?? b.preferred_detailer_id,
      frequency: "none", name: c.name, email: c.email, phone: c.phone, instructions: b.instructions,
    }, { customer: c });
    revalidatePath("/account");
    return { ok: `Request ${booking.ref} submitted — we'll confirm shortly.` };
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "Couldn't rebook right now." };
  }
}

export async function updatePlan(form: FormData) {
  const c = await customerOrRedirect();
  const plan = await one("recurring_plans", { id: String(form.get("id")) });
  if (!plan || plan.customer_id !== c.id) return;
  const action = String(form.get("action"));
  if (action === "pause") await db.update("recurring_plans", { id: plan.id }, { status: "paused" });
  if (action === "resume") {
    let next = plan.next_date;
    while (next <= todayFL()) next = nextRecurringDate(next, plan.frequency);
    await db.update("recurring_plans", { id: plan.id }, { status: "active", next_date: next });
  }
  if (action === "cancel") await db.update("recurring_plans", { id: plan.id }, { status: "cancelled" });
  if (action === "biweekly" || action === "monthly") await db.update("recurring_plans", { id: plan.id }, { frequency: action });
  revalidatePath("/account");
}

// ----- detailer-side messaging lives here too so both portals share helpers
export async function sendDetailerMessage(form: FormData) {
  const d = await getDetailer();
  if (!d) redirect("/detailer/login");
  const b = await one("bookings", { id: String(form.get("id")) });
  if (!b || b.detailer_id !== d.id) return;
  await addMessage(b.id, "detailer", String(form.get("body") ?? ""));
  revalidatePath("/detailer");
}
