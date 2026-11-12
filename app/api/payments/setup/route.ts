import { NextResponse } from "next/server";
import { createSetupIntent, stripeEnabled } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";

// Starts a secure Stripe session for saving a card / Apple Pay at booking.
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`setup:${ip}`, 20, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  try {
    const si = await createSetupIntent();
    return NextResponse.json({ clientSecret: si.client_secret }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("setup intent failed", e);
    return NextResponse.json({ error: "Couldn't start the card form. Please try again." }, { status: 502 });
  }
}
