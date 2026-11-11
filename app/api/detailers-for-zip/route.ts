import { NextResponse } from "next/server";
import { detailersForZip } from "@/lib/services";

// Returns approved detailers covering a ZIP (public label only: "First L.").
export async function GET(req: Request) {
  const zip = new URL(req.url).searchParams.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ detailers: [] });
  return NextResponse.json({ detailers: await detailersForZip(zip) }, { headers: { "Cache-Control": "no-store" } });
}
