import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/stripe";
import { db } from "@/lib/db";

// Stripe → BluePalm payment status sync. Configure STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const id = s.metadata?.booking_id ?? s.client_reference_id;
    if (id && s.payment_status === "paid") await db.update("bookings", { id }, { payment_status: "paid", payment_intent: s.payment_intent ?? null });
  }
  // saved-card charges made after the service
  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const pi = event.data.object;
    const id = pi.metadata?.booking_id;
    if (id) {
      const ok = event.type === "payment_intent.succeeded";
      await db.update("bookings", { id }, { payment_status: ok ? "paid" : "payment_failed", payment_intent: pi.id, payment_error: ok ? null : pi.last_payment_error?.message ?? "Payment failed" });
    }
  }
  if (event.type === "account.updated") {
    const a = event.data.object;
    if (a.payouts_enabled) {
      const [d] = await db.select("detailers", { stripe_account_id: a.id });
      if (d) await db.update("detailers", { id: d.id }, { onboarding: { ...d.onboarding, payouts_connected: true } });
    }
  }
  return NextResponse.json({ received: true });
}
