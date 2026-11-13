"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, one } from "@/lib/db";
import { getDetailer } from "@/lib/portal";
import { commissionFor, completeBooking, publicDetailerName, todayFL, windowLabel } from "@/lib/services";
import { sendEmail, siteUrl } from "@/lib/notify";
import { createAccountLink, createConnectAccount, stripeEnabled } from "@/lib/stripe";

async function me() {
  const d = await getDetailer();
  if (!d) redirect("/detailer/login");
  return d;
}
const canAcceptJobs = async (d: { source?: string; onboarding: { insurance_verified: boolean; background_check: boolean } }) =>
  d.source === "market" || (d.onboarding.insurance_verified && d.onboarding.background_check);

export async function acceptJob(form: FormData) {
  const d = await me();
  if (!(await canAcceptJobs(d))) return;
  const b = await one("bookings", { id: String(form.get("id")) });
  if (!b || b.status !== "confirmed" || b.detailer_id || b.date < todayFL()) return;
  const zip = await one("service_zips", { zip: b.zip });
  if (!zip || !d.counties.includes(zip.county)) return;
  if (b.preferred_detailer_id && b.preferred_detailer_id !== d.id) return;
  // Conditional update on status guards against two detailers accepting at once.
  const updated = await db.update("bookings", { id: b.id, status: "confirmed" }, { status: "assigned", detailer_id: d.id, commission_rate: await commissionFor(d.id) });
  if (!updated.length) return;
  const c = await one("customers", { id: b.customer_id });
  if (c) {
    await sendEmail(c.email, `Your detailer is assigned — ${b.ref}`, [
      `${publicDetailerName(d)} will take care of your ${b.package_name} on ${b.date}, ${windowLabel(b.time_window)}.`,
      "Need to share anything? Message us from your account — BluePalm keeps your contact details private.",
    ], { label: "View booking", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  }
  revalidatePath("/detailer");
}

export async function markComplete(form: FormData) {
  const d = await me();
  const b = await one("bookings", { id: String(form.get("id")) });
  // Detailers can only close out jobs on or after the service date.
  if (!b || b.detailer_id !== d.id || b.status !== "assigned" || b.date > todayFL()) return;
  await completeBooking(b);
  revalidatePath("/detailer");
}

export async function connectPayouts() {
  const d = await me();
  if (!stripeEnabled()) redirect("/detailer?payouts=unavailable");
  let account = d.stripe_account_id;
  if (!account) {
    account = (await createConnectAccount(d.email)).id;
    await db.update("detailers", { id: d.id }, { stripe_account_id: account });
  }
  const link = await createAccountLink(account, siteUrl("/detailer?payouts=done"), siteUrl("/detailer?payouts=retry"));
  redirect(link.url);
}
