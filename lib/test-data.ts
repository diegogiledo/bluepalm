import "server-only";
import { db } from "./db";
import { createBooking, completeBooking, todayFL, type SavedPayment } from "./services";
import { attachTestCard, findOrCreateCustomer, stripeEnabled } from "./stripe";
import { detailerTestMode } from "./partners";
import { TIME_WINDOWS, VEHICLES } from "./config";

/**
 * Dummy bookings for trying the detailer flow on your computer. Each one
 * books like a real customer (with Stripe's test Visa when test keys are
 * set), is emailed to local detailers (logged only, test mode) and accepted
 * by a random one. Some are then completed, which charges the test card.
 * Everything is marked with @example.com customers so it can be wiped.
 */
export const TEST_DOMAIN = "@example.com";
export const canMakeTestData = () => detailerTestMode() && (!stripeEnabled() || (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"));

const FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Drew", "Reese", "Skyler"];
const LAST = ["Rivera", "Nguyen", "Patel", "Brooks", "Carter", "Diaz", "Foster", "Hayes", "Kim", "Lopez", "Reed", "Shaw"];
const STREETS = ["Palm Ave", "Bayshore Blvd", "Gulf Dr", "Main St", "Coconut Ln", "Pelican Way", "Mangrove Ct", "Sunset Blvd"];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export async function generateTestBookings(count: number) {
  if (!canMakeTestData()) throw new Error("Test data can only be made on your computer with Stripe test keys.");
  const [zips, packages, partners] = await Promise.all([db.select("service_zips", { enabled: true }), db.select("packages", { active: true }), db.select("market_detailers")]);
  // only ZIPs in counties that have detailers with an email, so every booking can be taken
  const covered = new Set(partners.filter((m) => m.email && m.status !== "unsubscribed").flatMap((m) => m.counties));
  const usable = zips.filter((z) => covered.has(z.county));
  if (!usable.length) throw new Error("Load the researched detailers first, so test bookings have someone to go to.");

  let payment: SavedPayment | undefined;
  if (stripeEnabled()) {
    const customer = await findOrCreateCustomer(`bluepalm-test${TEST_DOMAIN}`, "BluePalm Test Customer", "+18135550100");
    payment = { customer, paymentMethod: (await attachTestCard(customer)).id, label: "Visa •••• 4242 (test)" };
  } else {
    payment = { customer: "cus_test_offline", paymentMethod: "pm_test_offline", label: "Test card (Stripe off)" };
  }

  const today = todayFL();
  const made: { ref: string; completed: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const z = pick(usable), first = pick(FIRST), last = pick(LAST);
    const { booking } = await createBooking({
      zip: z.zip, city: z.city, address: `${100 + Math.floor(Math.random() * 9800)} ${pick(STREETS)}`,
      vehicle: pick(VEHICLES).id, vehicle_details: "", package_id: pick(packages).id,
      date: addDays(today, 1 + Math.floor(Math.random() * 30)), time_window: pick(TIME_WINDOWS).id, frequency: "none",
      name: `${first} ${last} (test)`, email: `${first}.${last}.${Math.floor(Math.random() * 1e5)}${TEST_DOMAIN}`.toLowerCase(),
      phone: `813555${String(1000 + Math.floor(Math.random() * 8999))}`, instructions: "[TEST DATA] Dummy booking for testing.",
      promo: "", setup_intent: "", preferred_detailer_id: null,
    }, { payment });
    // about a third become past, finished jobs (charges the Stripe test card)
    const fresh = (await db.select("bookings", { id: booking.id }))[0];
    let completed = false;
    if (fresh?.status === "assigned" && Math.random() < 0.35) {
      const past = addDays(today, -(1 + Math.floor(Math.random() * 20)));
      await db.update("bookings", { id: fresh.id }, { date: past });
      await completeBooking({ ...fresh, date: past });
      completed = true;
    }
    made.push({ ref: booking.ref, completed });
  }
  return made;
}

/** Remove every test booking, test customer and their job emails. */
export async function deleteTestData() {
  if (!detailerTestMode()) throw new Error("Only on your computer.");
  const customers = (await db.select("customers")).filter((c) => c.email.endsWith(TEST_DOMAIN));
  const ids = new Set(customers.map((c) => c.id));
  const bookings = (await db.select("bookings")).filter((b) => ids.has(b.customer_id));
  for (const b of bookings) {
    await db.remove("job_offers", { booking_id: b.id });
    await db.remove("messages", { booking_id: b.id });
    await db.remove("bookings", { id: b.id });
  }
  for (const c of customers) {
    await db.remove("recurring_plans", { customer_id: c.id });
    await db.remove("customers", { id: c.id });
  }
  for (const e of await db.select("expenses")) if (e.note.startsWith("[TEST]")) await db.remove("expenses", { id: e.id });
  return bookings.length;
}

/**
 * Six months of finished test jobs (and test operating expenses) so the
 * Overview and Finance charts have history. Volume grows month over month;
 * jobs are completed, ~6% cancelled, a few partly refunded, about a third
 * from returning customers, and a quarter of first bookings use WELCOME10.
 * Payments are marked paid without contacting Stripe (fake test intents), so
 * refunding these from admin will show a Stripe error, which is expected.
 */
export async function generateTestHistory(months = 6, scale = 1) {
  if (!canMakeTestData()) throw new Error("Test data can only be made on your computer with Stripe test keys.");
  const { newId, newToken } = await import("./auth");
  const { detailerFor } = await import("./partners");
  const [zips, packages, partners, rateSetting] = await Promise.all([
    db.select("service_zips", { enabled: true }), db.select("packages", { active: true }), db.select("market_detailers"), db.select("settings", { key: "commission_rate" }),
  ]);
  const rate = Number(rateSetting[0]?.value ?? 0.2);
  const live = partners.filter((m) => m.email && m.status !== "unsubscribed");
  const usable = zips.filter((z) => live.some((m) => m.counties.includes(z.county)));
  if (!usable.length) throw new Error("Load the researched detailers first.");
  const weights = packages.map((p) => (p.base_price < 100 ? 45 : p.base_price < 200 ? 40 : 15));
  const pkgPick = () => { let x = Math.random() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < packages.length; i++) { x -= weights[i]; if (x <= 0) return packages[i]; } return packages[0]; };
  const SIZE_UP: Record<string, number> = { small: 0, medium: 0.1, large: 0.2 };
  const accounts = new Map<string, string>(); // market detailer id -> portal detailer id
  const pool: { id: string; email: string; name: string }[] = [];
  const customers: import("./types").Customer[] = [], bookings: import("./types").Booking[] = [];
  const today = todayFL();
  const now = new Date(today + "T12:00");

  // Realistic shape: business grows month over month, Florida seasonality
  // (slower in the summer heat and rain, busier from late fall with snowbirds),
  // weekends busiest (Saturday most), mornings the favourite slot.
  const SEASON = [1.2, 1.25, 1.3, 1.2, 1.0, 0.85, 0.8, 0.8, 0.85, 1.0, 1.15, 1.2]; // Jan..Dec
  const WEEKDAY = [1.15, 0.7, 0.75, 0.85, 0.95, 1.25, 1.6]; // Sun..Sat
  const WINDOWS = [["morning", 0.45], ["midday", 0.32], ["afternoon", 0.23]] as const;
  const SIZES = [["small", 0.3], ["medium", 0.45], ["large", 0.25]] as const;
  const weighted = <T,>(opts: readonly (readonly [T, number])[]) => { let x = Math.random(); for (const [v, w] of opts) { x -= w; if (x <= 0) return v; } return opts[0][0]; };
  const FINISH: Record<string, string> = { morning: "15:30", midday: "18:30", afternoon: "21:30" }; // ≈ 11:30am / 2:30pm / 5:30pm Florida, in UTC
  for (let k = months; k >= 0; k--) { // k = 0 is this month, up to yesterday
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - k, 1));
    const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    const lastDay = k === 0 ? Math.max(0, Number(today.slice(8, 10)) - 1) : daysInMonth;
    if (!lastDay) continue;
    const base = (14 + (months - k) * 6) * SEASON[start.getUTCMonth()] * scale; // monthly volume
    // spread the month's bookings over its days by weekday popularity
    for (let day = 1; day <= lastDay; day++) {
      const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
      const expected = (base / daysInMonth) * WEEKDAY[dt.getUTCDay()] / 1.04;
      const n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const date = dt.toISOString().slice(0, 10);
      if (date >= today) continue;
      let cust = pool.length > 8 * scale && Math.random() < 0.33 ? pick(pool) : null;
      const isNew = !cust;
      if (!cust) {
        const first = pick(FIRST), last = pick(LAST);
        cust = { id: newId(), email: `${first}.${last}.${Math.floor(Math.random() * 1e6)}${TEST_DOMAIN}`.toLowerCase(), name: `${first} ${last} (test)` };
        pool.push(cust);
        customers.push({ id: cust.id, email: cust.email, name: cust.name, phone: `813555${1000 + Math.floor(Math.random() * 8999)}`, access_token: newToken(), loyalty_points: 0, created_at: addDays(date, -5) + "T12:00:00.000Z" });
      }
      const z = pick(usable), pkg = pkgPick(), vehicle = weighted(SIZES) as string, window = weighted(WINDOWS) as string;
      const m = pick(live.filter((p) => p.counties.includes(z.county)));
      let detailerId = accounts.get(m.id);
      if (!detailerId) { detailerId = (await detailerFor(m)).id; accounts.set(m.id, detailerId); }
      const cancelled = Math.random() < 0.06;
      const final = Math.round(pkg.base_price * (1 + (SIZE_UP[vehicle] ?? 0)));
      const promo = isNew && Math.random() < 0.25;
      const due = Math.round(final * (promo ? 0.9 : 1) * 100) / 100;
      const refund = !cancelled && Math.random() < 0.04 ? Math.round(due * (Math.random() < 0.5 ? 0.5 : 1)) : 0;
      bookings.push({
        id: newId(), ref: `BP-${Math.random().toString(16).slice(2, 8).toUpperCase()}`, customer_id: cust.id,
        zip: z.zip, address: `${100 + Math.floor(Math.random() * 9800)} ${pick(STREETS)}`, city: z.city, vehicle, vehicle_details: "",
        package_id: pkg.id, package_name: pkg.name, price_estimate: pkg.base_price, date, time_window: window,
        preferred_detailer_id: null, instructions: "[TEST DATA] Past booking for testing.",
        status: cancelled ? "cancelled" : "completed", detailer_id: cancelled ? null : detailerId, recurring_plan_id: null,
        commission_rate: rate, final_price: cancelled ? null : final,
        payment_status: cancelled ? "card_on_file" : refund >= due ? "refunded" : refund ? "partially_refunded" : "paid", refund_amount: refund,
        promo_code: promo ? "WELCOME10" : null, discount_pct: promo ? 10 : 0,
        stripe_customer_id: "cus_test_history", payment_method_id: "pm_test_history", card_label: "Visa •••• 4242 (test)", payment_error: null,
        payment_intent: cancelled ? null : `pi_test_history_${newToken(6)}`, checkout_url: null,
        cancel_reason: cancelled ? "Cancelled by customer (test)" : "",
        customer_rating: !cancelled && Math.random() < 0.7 ? (Math.random() < 0.75 ? 5 : 4) : null, customer_feedback: "",
        created_at: addDays(date, -(1 + Math.floor(Math.random() * 9))) + "T14:00:00.000Z",
        completed_at: cancelled ? null : `${date}T${FINISH[window] ?? "18:00"}:00.000Z`,
      });
    }
    }
  }
  await db.insertMany("customers", customers);
  await db.insertMany("bookings", bookings);

  // test operating expenses sized to each month's actual test sales (replaces earlier test expenses)
  for (const e of await db.select("expenses")) if (e.note.startsWith("[TEST]")) await db.remove("expenses", { id: e.id });
  const all = (await db.select("bookings")).filter((x) => x.status === "completed" && x.instructions.startsWith("[TEST DATA]"));
  const expenses: import("./types").Expense[] = [];
  for (let k = months; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - k, 15)), month = d.toISOString().slice(0, 7);
    const gmv = all.filter((x) => x.date.startsWith(month)).reduce((t, x) => t + (x.final_price ?? 0) * (1 - (x.discount_pct ?? 0) / 100), 0);
    if (!gmv) continue;
    const jobs = all.filter((x) => x.date.startsWith(month)).length;
    // this month is still in progress: only count the share of fixed costs for the days so far
    const share = k === 0 ? Math.max(1, Number(today.slice(8, 10)) - 1) / new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() : 1;
    const lines: [string, number][] = [
      ["Marketing", gmv * (0.05 + Math.random() * 0.02)],                    // ads, flyers, promos (~a third of what BluePalm keeps)
      ["Software", (129 + 49 * Math.ceil(jobs / 500)) * share],               // tools that scale with volume
      ["Insurance", 180 * share],
      ["Office & admin", 80 * share + gmv * 0.012],
      ["Payroll", 1500 * share + gmv * 0.025],                                 // part-time coordinator, more hours as volume grows
    ];
    for (const [category, amount] of lines) expenses.push({ id: newId(), month, category, amount: Math.round(amount), note: "[TEST] sample expense", created_at: new Date().toISOString() });
  }
  await db.insertMany("expenses", expenses);
  return { bookings: bookings.length, completed: bookings.filter((b) => b.status === "completed").length, expenses: expenses.length };
}
