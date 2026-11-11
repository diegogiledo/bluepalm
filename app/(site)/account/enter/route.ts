import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, cookieOpts } from "@/lib/portal";
import { tokenValid } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!tokenValid(token)) return NextResponse.redirect(new URL("/account/login?invalid=1", url));
  const res = NextResponse.redirect(new URL("/account", url));
  res.cookies.set(CUSTOMER_COOKIE, token, cookieOpts);
  return res;
}
