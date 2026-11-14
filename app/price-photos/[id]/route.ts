import { cookies } from "next/headers";
import { getStaff } from "@/lib/auth";
import { one } from "@/lib/db";
import { readDocument } from "@/lib/files";
import { CUSTOMER_COOKIE, DETAILER_COOKIE } from "@/lib/portal";

export const dynamic = "force-dynamic";

/** Photo attached to a price-change request: only the booking's customer, the detailer who sent it, or an admin. */
export async function GET(_: Request, ctx: RouteContext<"/price-photos/[id]">) {
  const pc = await one("price_changes", { id: (await ctx.params).id });
  if (!pc?.photo_file) return new Response("Not found", { status: 404 });
  const b = await one("bookings", { id: pc.booking_id });
  const jar = await cookies();
  const cust = jar.get(CUSTOMER_COOKIE)?.value, det = jar.get(DETAILER_COOKIE)?.value;
  const [c, d, staff] = await Promise.all([
    cust ? one("customers", { access_token: cust }) : null, det ? one("detailers", { access_token: det }) : null, getStaff(),
  ]);
  const allowed = Boolean(staff) || (c && b?.customer_id === c.id) || (d && d.id === pc.detailer_id);
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const doc = await readDocument(pc.photo_file);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.body), { headers: { "Content-Type": doc.type, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
