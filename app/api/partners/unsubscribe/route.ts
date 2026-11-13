import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/partners";

export const dynamic = "force-dynamic";

/** One-click unsubscribe from mail apps (List-Unsubscribe-Post). */
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  if (t) await unsubscribe(t);
  return new NextResponse("Unsubscribed", { status: 200 });
}
/** Link in the email: show the confirmation page (link scanners can't unsubscribe anyone). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return new NextResponse(null, { status: 303, headers: { Location: `/partners/${encodeURIComponent(t)}?unsubscribe=1`, "Cache-Control": "no-store" } });
}
