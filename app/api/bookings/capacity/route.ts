import { NextResponse } from "next/server";
import { bookingCapacity, LIMIT_MESSAGE } from "@/lib/email-budget";

export const dynamic = "force-dynamic";

/** Checked by the booking form before it saves the card: are we still taking bookings today? */
export async function GET(req: Request) {
  const zip = (new URL(req.url).searchParams.get("zip") ?? "").slice(0, 5);
  const card = Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  try {
    const c = await bookingCapacity(zip, card);
    return NextResponse.json(c.ok ? { ok: true } : { ok: false, reason: c.reason, message: LIMIT_MESSAGE[c.reason] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("capacity check failed", e);
    return NextResponse.json({ ok: true }); // never block a booking because the check itself failed
  }
}
