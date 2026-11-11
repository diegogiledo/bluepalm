import { getStaff } from "@/lib/auth";
import { readDocument } from "@/lib/files";

export async function GET(_: Request, ctx: RouteContext<"/admin/files/[name]">) {
  const s = await getStaff();
  if (!s || s.role !== "admin") return new Response("Forbidden", { status: 403 });
  const doc = await readDocument((await ctx.params).name);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.body), { headers: { "Content-Type": doc.type, "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
