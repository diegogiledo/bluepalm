import "server-only";
import crypto from "crypto";

/**
 * Stripe Connect (Express accounts, destination charges) via the REST API.
 * Card data never touches BluePalm servers — customers pay on Stripe Checkout.
 * All functions throw StripeNotConfigured when STRIPE_SECRET_KEY is unset.
 */
export class StripeNotConfigured extends Error {
  constructor() { super("Stripe is not configured (set STRIPE_SECRET_KEY)."); }
}
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

function flatten(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) =>
      typeof item === "object" ? flatten(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item)));
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T = Record<string, unknown>>(path: string, params: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfigured();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: flatten(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${json?.error?.message ?? res.status}`);
  return json as T;
}

export async function createConnectAccount(email: string) {
  return stripe<{ id: string }>("accounts", {
    type: "express", country: "US", email,
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
  });
}
export async function createAccountLink(account: string, returnUrl: string, refreshUrl: string) {
  return stripe<{ url: string }>("account_links", { account, return_url: returnUrl, refresh_url: refreshUrl, type: "account_onboarding" });
}

/** Checkout Session for a completed/confirmed booking. Platform keeps the commission. */
export async function createBookingCheckout(opts: {
  bookingId: string; ref: string; amountCents: number; commissionCents: number;
  customerEmail: string; destination: string | null; successUrl: string; cancelUrl: string; description: string;
}) {
  return stripe<{ id: string; url: string }>("checkout/sessions", {
    mode: "payment",
    customer_email: opts.customerEmail,
    success_url: opts.successUrl, cancel_url: opts.cancelUrl,
    client_reference_id: opts.bookingId,
    metadata: { booking_id: opts.bookingId, ref: opts.ref },
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: opts.amountCents, product_data: { name: opts.description } } }],
    payment_intent_data: {
      metadata: { booking_id: opts.bookingId },
      ...(opts.destination ? { application_fee_amount: opts.commissionCents, transfer_data: { destination: opts.destination } } : {}),
    },
  }, `checkout-${opts.bookingId}-${opts.amountCents}`);
}

export async function refundPaymentIntent(paymentIntent: string, amountCents: number) {
  return stripe("refunds", { payment_intent: paymentIntent, amount: amountCents, reverse_transfer: true, refund_application_fee: true });
}

/** Verify a Stripe webhook signature (v1 scheme, 5 minute tolerance). */
export function verifyWebhook(payload: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// ---------- saved cards (card / Apple Pay / Google Pay at booking) ----------
async function stripeGet<T = Record<string, unknown>>(path: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfigured();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${json?.error?.message ?? res.status}`);
  return json as T;
}
/** Saved for charging later. Which payment methods appear (cards, Apple Pay, Google Pay…) is set in the Stripe Dashboard → Settings → Payment methods. */
export const createSetupIntent = () =>
  stripe<{ id: string; client_secret: string }>("setup_intents", { usage: "off_session", automatic_payment_methods: { enabled: true } });

type SavedCard = { brand: string; last4: string; wallet: string | null };
export async function getSetupIntent(id: string) {
  const si = await stripeGet<{ id: string; status: string; payment_method: { id: string; card?: { brand: string; last4: string; wallet?: { type: string } | null } } | null; metadata: Record<string, string> }>(
    `setup_intents/${encodeURIComponent(id)}?expand[]=payment_method`,
  );
  const c = si.payment_method?.card;
  const card: SavedCard | null = c ? { brand: c.brand, last4: c.last4, wallet: c.wallet?.type ?? null } : null;
  return { status: si.status, paymentMethod: si.payment_method?.id ?? null, card, used: si.metadata?.booking_ref ?? null };
}
export async function markSetupIntentUsed(id: string, ref: string) {
  await stripe(`setup_intents/${encodeURIComponent(id)}`, { metadata: { booking_ref: ref } });
}
export async function findOrCreateCustomer(email: string, name: string, phone: string) {
  const found = await stripeGet<{ data: { id: string }[] }>(`customers?email=${encodeURIComponent(email)}&limit=1`);
  if (found.data[0]) return found.data[0].id;
  return (await stripe<{ id: string }>("customers", { email, name, phone })).id;
}
export async function attachPaymentMethod(paymentMethod: string, customer: string) {
  try { await stripe(`payment_methods/${encodeURIComponent(paymentMethod)}/attach`, { customer }); }
  catch (e) { if (!String(e).includes("already been attached")) throw e; }
}
export const cardLabel = (c: SavedCard | null) => c ? `${c.wallet === "apple_pay" ? "Apple Pay · " : c.wallet === "google_pay" ? "Google Pay · " : ""}${c.brand.replace(/^\w/, (m) => m.toUpperCase())} •••• ${c.last4}` : "";

/** Charge a saved card without the customer present (after the service). */
export async function chargeSavedCard(opts: {
  bookingId: string; ref: string; amountCents: number; commissionCents: number;
  customer: string; paymentMethod: string; destination: string | null; description: string;
}) {
  return stripe<{ id: string; status: string }>("payment_intents", {
    amount: opts.amountCents, currency: "usd", customer: opts.customer, payment_method: opts.paymentMethod,
    off_session: true, confirm: true, description: opts.description,
    metadata: { booking_id: opts.bookingId, ref: opts.ref },
    ...(opts.destination ? { application_fee_amount: opts.commissionCents, transfer_data: { destination: opts.destination } } : {}),
  }, `charge-${opts.bookingId}-${opts.amountCents}`);
}
