import { NextResponse } from "next/server";
import { bookingSchema, fieldErrors } from "@/lib/validation";
import { createBooking, UserError, type SavedPayment } from "@/lib/services";
import { attachPaymentMethod, cardLabel, findOrCreateCustomer, getSetupIntent, markSetupIntentUsed, stripeEnabled } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";

/** Cards are collected at booking whenever Stripe is configured (both keys present). */
const cardsRequired = () => stripeEnabled() && Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`booking:${ip}`, 8, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  const input = parsed.data;
  if (input.website) return NextResponse.json({ ok: true, ref: "BP-000000" }); // honeypot

  // Verify the card / Apple Pay the browser saved with Stripe, then link it to
  // a Stripe customer so it can be charged after the service.
  let payment: SavedPayment | undefined;
  let setupIntentId: string | null = null;
  if (cardsRequired()) {
    if (!/^seti_[A-Za-z0-9]+$/.test(input.setup_intent)) {
      return NextResponse.json({ error: "Please add a card or Apple Pay to finish your booking.", fields: { card: "Add a payment method" } }, { status: 422 });
    }
    try {
      const si = await getSetupIntent(input.setup_intent);
      if (si.status !== "succeeded" || !si.paymentMethod) throw new UserError("card", "Your card wasn't confirmed. Please try again.");
      if (si.used) throw new UserError("card", "This card session was already used. Please re-enter your card.");
      const customer = await findOrCreateCustomer(input.email, input.name, input.phone);
      await attachPaymentMethod(si.paymentMethod, customer);
      payment = { customer, paymentMethod: si.paymentMethod, label: cardLabel(si.card) || "Saved card" };
      setupIntentId = input.setup_intent;
    } catch (e) {
      if (e instanceof UserError) return NextResponse.json({ error: e.message, fields: { card: e.message } }, { status: 422 });
      console.error("card verification failed", e);
      return NextResponse.json({ error: "We couldn't verify your card. Please try again." }, { status: 502 });
    }
  }

  try {
    const { booking, accountToken, promoStatus } = await createBooking(input, { payment });
    if (setupIntentId) await markSetupIntentUsed(setupIntentId, booking.ref).catch(() => {});
    return NextResponse.json({ ok: true, ref: booking.ref, accountToken, promoStatus, card: booking.card_label });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message, fields: { [e.field]: e.message } }, { status: 422 });
    console.error("booking failed", e);
    return NextResponse.json({ error: "Something went wrong saving your request. Please try again." }, { status: 500 });
  }
}
