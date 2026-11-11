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
