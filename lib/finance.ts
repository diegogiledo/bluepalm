import "server-only";
import { db, getSetting } from "./db";
import { amountDue, listPrice } from "./pricing";
import { todayFL, vehicleLabel } from "./services";
import type { Expense } from "./types";

/**
 * BluePalm's money, one row per booking that made (or refunded) money.
 *
 *  GMV            what the customer was charged, after promotions
 *  refunds        money returned to the customer
 *  net GMV        GMV − refunds
 *  net revenue    BluePalm's commission on net GMV (the take rate)
 *  detailer pay   net GMV − commission
 *  Stripe fees    estimated 2.9% + 30¢ per card charge (Stripe keeps fees on refunds)
 *  gross profit   net revenue − Stripe fees
 *  EBITDA         gross profit − operating expenses (entered in the Finance tab).
 *                 BluePalm has no depreciation, amortisation, interest or tax
 *                 lines yet, so EBITDA is operating profit before tax.
 */
export const STRIPE_PCT = 0.029, STRIPE_FIXED = 0.3;

export type FinRow = {
  id: string; ref: string; date: string; month: string; status: string; payment: string;
  service: string; vehicle: string; county: string; city: string; detailer: string;
  customer: string; customerId: string; newCustomer: boolean; promo: string;
  list: number; discount: number; gmv: number; refund: number; netGmv: number;
  commission: number; payout: number; fee: number; profit: number; rate: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Calendar day in Florida for a timestamp (a job finished at 9pm isn't "tomorrow" in UTC). */
const flDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null);

export async function financeData(): Promise<{ rows: FinRow[]; expenses: Expense[]; cancelled: { month: string }[]; detailersActive: Record<string, number> }> {
  const [bookings, zips, detailers, customers, expenses, defaultRate] = await Promise.all([
    db.select("bookings"), db.select("service_zips"), db.select("detailers"), db.select("customers"), db.select("expenses"), getSetting("commission_rate", 0.2),
  ]);
  const county = Object.fromEntries(zips.map((z) => [z.zip, z.county]));
  const dName = Object.fromEntries(detailers.map((d) => [d.id, d.business_name || d.name]));
  const cName = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  // a customer's first completed booking counts as "new"; later ones are "returning"
  const done = bookings.filter((b) => b.status === "completed").sort((a, b) => (a.completed_at ?? a.date).localeCompare(b.completed_at ?? b.date));
  const dayOf = (b: (typeof bookings)[number]) => flDay(b.completed_at) ?? b.date;
  const seen = new Set<string>();
  const rows: FinRow[] = done.map((b) => {
    const gmv = amountDue(b) ?? 0, list = listPrice(b) ?? 0, rate = b.commission_rate ?? defaultRate;
    const refund = Math.min(b.refund_amount ?? 0, gmv), netGmv = gmv - refund;
    const charged = gmv > 0 && ["paid", "refunded", "partially_refunded"].includes(b.payment_status);
    const fee = charged ? gmv * STRIPE_PCT + STRIPE_FIXED : 0;
    const commission = netGmv * rate;
    const newCustomer = !seen.has(b.customer_id);
    seen.add(b.customer_id);
    const date = flDay(b.completed_at) ?? b.date;
    return {
      id: b.id, ref: b.ref, date, month: date.slice(0, 7), status: b.status, payment: b.payment_status,
      service: b.package_name, vehicle: vehicleLabel(b.vehicle).replace(/ vehicle$/, ""), county: (county[b.zip] ?? "Unknown").replace(/ County$/, ""), city: b.city,
      detailer: b.detailer_id ? dName[b.detailer_id] ?? "Unknown" : "Unassigned", customer: cName[b.customer_id] ?? "", customerId: b.customer_id,
      newCustomer, promo: b.promo_code ?? "",
      list: r2(list), discount: r2(list - gmv), gmv: r2(gmv), refund: r2(refund), netGmv: r2(netGmv),
      commission: r2(commission), payout: r2(netGmv - commission), fee: r2(fee), profit: r2(commission - fee), rate,
    };
  });
  const cancelled = bookings.filter((b) => b.status === "cancelled").map((b) => ({ month: b.date.slice(0, 7) }));
  // detailers who completed at least one job, per month
  const active: Record<string, Set<string>> = {};
  for (const b of done) if (b.detailer_id) (active[dayOf(b).slice(0, 7)] ??= new Set()).add(b.detailer_id);
  const detailersActive = Object.fromEntries(Object.entries(active).map(([m, s]) => [m, s.size]));
  return { rows, expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) })), cancelled, detailersActive };
}

/** Revenue and gross profit per month for the last `n` months (Overview chart). */
export async function monthlyRevenueProfit(n = 6) {
  const { rows } = await financeData();
  const [y, m] = todayFL().split("-").map(Number); // Florida calendar, not the server's UTC clock
  const months = Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 15)); return d.toISOString().slice(0, 7); });
  return months.map((m) => {
    const rs = rows.filter((r) => r.month === m);
    return { month: m, revenue: r2(rs.reduce((s, r) => s + r.netGmv, 0)), profit: r2(rs.reduce((s, r) => s + r.profit, 0)) };
  });
}

export const EXPENSE_CATEGORIES = ["Marketing", "Software", "Insurance", "Payroll", "Office & admin", "Other"] as const;
