import { NextResponse } from "next/server";
import { DETAILER_COOKIE, cookieOpts } from "@/lib/portal";
import { tokenValid } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!tokenValid(token)) return NextResponse.redirect(new URL("/detailer/login?invalid=1", url));
  const res = NextResponse.redirect(new URL("/detailer", url));
  res.cookies.set(DETAILER_COOKIE, token, cookieOpts);
  return res;
}
