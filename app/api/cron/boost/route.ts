import { NextResponse } from "next/server";
import { runBoosts } from "@/lib/boost";

export const dynamic = "force-dynamic";

/** Called hourly by the Netlify scheduled function (netlify/functions/boost-jobs.mts). */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await runBoosts());
}
