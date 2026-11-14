import "server-only";
import { db, getSetting } from "./db";
import { pricingRules } from "./pricing-rules";
import { jobEmail, jobOpen } from "./partners";
import { sendPartnerEmails, siteUrl } from "./notify";
import { money, now } from "./services";

/**
 * Payout boost: when a paid job sits with no taker for `afterHours`, BluePalm
 * takes a smaller cut (commission drops by `step` points, never below
 * `minCommission`) and the job is emailed again, with the higher payout, to
 * detailers who haven't passed on it. Runs hourly (Netlify scheduled function
 * → /api/cron/boost) and can be run by hand from admin.
 */
export async function runBoosts(): Promise<{ boosted: string[]; emailed: number }> {
  const rules = (await pricingRules()).boost;
  if (!rules.enabled) return { boosted: [], emailed: 0 };
  const defaultRate = await getSetting("commission_rate", 0.2);
  const [bookings, offers, partners] = await Promise.all([db.select("bookings"), db.select("job_offers"), db.select("market_detailers")]);
  const byId = new Map(partners.map((m) => [m.id, m]));
  const boosted: string[] = [];
  let emailed = 0;
  for (const b of bookings) {
    if (!jobOpen(b) || !b.payment_method_id) continue;
    const mine = offers.filter((o) => o.booking_id === b.id);
    if (!mine.length || mine.some((o) => o.status === "accepted")) continue;
    if ((b.boost_count ?? 0) >= rules.maxBoosts) continue;
    const since = b.boosted_at ?? mine.reduce((t, o) => (o.sent_at < t ? o.sent_at : t), mine[0].sent_at);
    if (Date.now() - new Date(since).getTime() < rules.afterHours * 3600_000) continue;
    const rate = Math.round(Math.max(rules.minCommission / 100, (b.commission_rate ?? defaultRate) - rules.step / 100) * 10000) / 10000;
    if (rate >= (b.commission_rate ?? defaultRate)) continue; // already at the floor
    const updated = { ...b, commission_rate: rate, boost_count: (b.boost_count ?? 0) + 1, boosted_at: now() };
    await db.update("bookings", { id: b.id }, { commission_rate: rate, boost_count: updated.boost_count, boosted_at: updated.boosted_at });
    boosted.push(b.ref);
    // re-send to everyone still "sent" (not those who passed), within the email limit
    const { remainingEmails } = await import("./email-budget");
    let room = (await remainingEmails()) - 6;
    const mails = [];
    for (const o of mine.filter((x) => x.status === "sent")) {
      const m = byId.get(o.market_detailer_id);
      if (!m?.email || m.status === "unsubscribed" || room-- <= 0) continue;
      const unsub = siteUrl(`/api/partners/unsubscribe?t=${encodeURIComponent(m.token)}`);
      const j = await jobEmail(updated, m, siteUrl(`/jobs/${o.token}`), unsub, rate);
      mails.push({ to: m.email, title: `Higher payout: ${j.subject}`, html: j.html, text: j.text, unsubscribeUrl: unsub });
    }
    emailed += await sendPartnerEmails(mails);
    console.info(`boost: ${b.ref} commission → ${Math.round(rate * 100)}%, re-sent to ${mails.length} (${money(b.final_price ?? b.price_estimate)})`);
  }
  return { boosted, emailed };
}
