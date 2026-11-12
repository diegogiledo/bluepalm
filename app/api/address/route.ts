import { NextResponse } from "next/server";
import { details, geoProvider, reverse, searchable, suggest } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/address?q=...            → suggestions while typing
// GET /api/address?id=...           → full address for a suggestion (Google only)
// GET /api/address?lat=..&lon=..    → address for "Use my current location"
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`addr:${ip}`, 120, 10 * 60_000)) return NextResponse.json({ error: "Too many lookups. Please type your address." }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const session = (sp.get("s") ?? "").slice(0, 64);
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const q = sp.get("q")?.trim();
    if (q !== undefined) {
      if (!searchable(q) || q.length > 120) return NextResponse.json({ suggestions: [], provider: geoProvider, needsNumber: !/^\s*\d/.test(q) }, { headers });
      return NextResponse.json({ suggestions: await suggest(q, session), provider: geoProvider }, { headers });
    }
    const id = sp.get("id");
    if (id) return NextResponse.json({ address: await details(id.slice(0, 300), session) }, { headers });
    const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return NextResponse.json({ address: await reverse(Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5) }, { headers });
    }
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  } catch (e) {
    console.error("address lookup failed", e);
    return NextResponse.json({ error: "Address lookup is unavailable right now. Please type your address." }, { status: 502 });
  }
}
