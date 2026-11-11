import "server-only";
import { cookies } from "next/headers";
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
