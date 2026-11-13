import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobEmail } from "@/lib/partners";
import { todayFL } from "@/lib/services";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Admin-only preview of the job email a local detailer receives (sample job, nothing is sent). */
export async function GET() {
  await requireStaff();
  const all = await db.select("market_detailers");
  const first = all.find((m) => m.email && m.owner_name && m.counties.includes("Manatee County")) ?? all.find((m) => m.email && m.counties.includes("Manatee County"));
  const d = new Date(todayFL() + "T12:00"); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); // next Saturday
  const sample = {
    package_name: "Inside & Out", vehicle: "medium", date: d.toISOString().slice(0, 10), time_window: "morning",
    city: "Bradenton", zip: "34209", price_estimate: 149, final_price: null, discount_pct: 0,
  } as unknown as Booking;
  const j = await jobEmail(sample, first ?? { business_name: "Your Detailing Co", owner_name: null }, "#accept", "#unsubscribe");
  const banner = `<div style="font-family:Arial;background:#0B2342;color:#fff;padding:10px 16px;font-size:13px">Preview only, nothing is sent · Subject: <b>${j.subject.replace(/</g, "&lt;")}</b></div>`;
  return new Response(j.html.replace(/<body([^>]*)>/, (tag) => tag + banner), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
