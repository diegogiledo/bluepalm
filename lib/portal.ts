import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { one } from "./db";
import { tokenValid } from "./auth";

/**
 * Customer & detailer portals use passwordless magic links. The emailed
 * token is exchanged for an httpOnly cookie at /account/enter or
 * /detailer/enter so it doesn't linger in the URL bar or history.
 */
export const CUSTOMER_COOKIE = "bp_customer";
export const DETAILER_COOKIE = "bp_detailer";
export const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 };

/**
 * Response for /account/enter and /detailer/enter. The redirect uses a
 * relative Location so the browser stays on the host the user clicked
 * (behind Netlify, req.url can carry an internal host, which would put the
 * cookie and the next page on different domains), and it is never cached.
 */
export function magicLinkResponse(token: string | null, cookieName: string, home: string) {
  const ok = tokenValid(token);
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: ok ? home : `${home}/login?invalid=1`, "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" },
  });
  if (ok) res.cookies.set(cookieName, token, cookieOpts);
  return res;
}

export async function getCustomer() {
  const t = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  return tokenValid(t) ? one("customers", { access_token: t }) : null;
}
export async function getDetailer() {
  const t = (await cookies()).get(DETAILER_COOKIE)?.value;
  if (!tokenValid(t)) return null;
  const d = await one("detailers", { access_token: t });
  return d && d.status === "approved" ? d : null;
}
