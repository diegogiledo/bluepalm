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
  return bookings.length;
}
