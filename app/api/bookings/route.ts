import { NextResponse } from "next/server";
import { bookingSchema, fieldErrors } from "@/lib/validation";
import { createBooking, UserError } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`booking:${ip}`, 8, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  if (parsed.data.website) return NextResponse.json({ ok: true, ref: "BP-000000" }); // honeypot
  try {
    const { booking, accountToken } = await createBooking(parsed.data);
    return NextResponse.json({ ok: true, ref: booking.ref, accountToken });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message, fields: { [e.field]: e.message } }, { status: 422 });
    console.error("booking failed", e);
    return NextResponse.json({ error: "Something went wrong saving your request. Please try again." }, { status: 500 });
  }
}
