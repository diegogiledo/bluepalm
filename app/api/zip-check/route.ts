import { NextResponse } from "next/server";
import { checkZip } from "@/lib/services";

export async function GET(req: Request) {
  const zip = new URL(req.url).searchParams.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Enter a 5-digit ZIP code" }, { status: 400 });
  return NextResponse.json(await checkZip(zip), { headers: { "Cache-Control": "no-store" } });
}
