import "server-only";
import { countOutboxSince, one, db } from "./db";
import { canEmailPartners, detailerTestMode, receivesJobs } from "./partners";

/**
 * Email sending budget, so a new booking never pushes Resend past its plan
 * limit (free plan: 100 emails a day, 3,000 a month). When the limit would be
 * reached, the booking is turned away *before* the card is saved, with a
 * "try again tomorrow" message, instead of half the emails silently failing.
 *
 *  EMAIL_DAILY_LIMIT    default 100 (set 0 to turn the check off, e.g. on a paid Resend plan)
 *  EMAIL_MONTHLY_LIMIT  default 3000 (0 = off)
 *
 * Counted: emails Resend accepted ("sent") in the last 24 hours and this
 * calendar month. Without a Resend key (your computer), nothing is really sent,
 * so the check only runs if you set EMAIL_DAILY_LIMIT yourself to try it out,
 * and then it counts the logged emails instead.
 */
const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Math.max(0, Number(v) || 0));

export function emailLimits() {
  const live = Boolean(process.env.RESEND_API_KEY);
  const explicit = process.env.EMAIL_DAILY_LIMIT !== undefined;
  return {
    on: live || explicit,
    daily: num(process.env.EMAIL_DAILY_LIMIT, 100),
    monthly: num(process.env.EMAIL_MONTHLY_LIMIT, live ? 3000 : 0),
    statuses: live ? ["sent"] : ["sent", "logged"],
  };
}

/** Emails one booking will cause: confirmation + admin alert now, one per local detailer, then "accepted" (×3) and "completed". */
export async function emailsForBooking(zip: string, willHaveCard: boolean) {
  let partners = 0;
  if (willHaveCard && (canEmailPartners() || detailerTestMode())) {
    const z = await one("service_zips", { zip });
    if (z) partners = (await db.select("market_detailers")).filter((m) => receivesJobs(m) && m.counties.includes(z.county)).length;
  }
  const admin = process.env.ADMIN_NOTIFY_EMAIL ? 1 : 0;
  return 1 + admin + partners + (2 + admin) + 1;
}

export type Capacity = { ok: true } | { ok: false; reason: "daily" | "monthly" };

/** Can we take a booking for this ZIP without going over the email limits? */
export async function bookingCapacity(zip: string, willHaveCard: boolean): Promise<Capacity> {
  const L = emailLimits();
  if (!L.on || (!L.daily && !L.monthly)) return { ok: true };
  const need = await emailsForBooking(zip, willHaveCard);
  const now = new Date();
  if (L.daily) {
    const day = await countOutboxSince(new Date(now.getTime() - 864e5).toISOString(), L.statuses);
    if (day + need > L.daily) return { ok: false, reason: "daily" };
  }
  if (L.monthly) {
    const month = await countOutboxSince(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), L.statuses);
    if (month + need > L.monthly) return { ok: false, reason: "monthly" };
  }
  return { ok: true };
}

export const LIMIT_MESSAGE = {
  daily: "We're sorry, but we've reached our limit of details for today. Please try again tomorrow.",
  monthly: "We're sorry, but we've reached our limit of details for this month. Please try again in a few days.",
};

/** How many more emails can go out right now (daily and monthly), or Infinity when no limit applies. */
export async function remainingEmails(): Promise<number> {
  const L = emailLimits();
  if (!L.on) return Infinity;
  const now = new Date();
  let left = Infinity;
  if (L.daily) left = Math.min(left, L.daily - (await countOutboxSince(new Date(now.getTime() - 864e5).toISOString(), L.statuses)));
  if (L.monthly) left = Math.min(left, L.monthly - (await countOutboxSince(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), L.statuses)));
  return left;
}
