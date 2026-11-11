import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabase, one } from "./db";
import type { StaffRole } from "./types";

const COOKIE = "bp_staff";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return "dev-only-insecure-session-secret-change-me-please";
}

export const newToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");
export const newId = () => crypto.randomUUID();

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()) as T; } catch { return null; }
}
function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export type StaffSession = { email: string; role: StaffRole; exp: number };

// Very small in-memory limiter for login attempts (per email+IP).
const attempts = new Map<string, { n: number; until: number }>();
export function loginRateLimited(key: string) {
  const a = attempts.get(key);
  return Boolean(a && a.n >= 5 && a.until > Date.now());
}
function noteFailure(key: string) {
  const a = attempts.get(key);
  const until = Date.now() + 15 * 60_000;
  attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until });
}

/**
 * Verify staff credentials.
 *  - Supabase mode: Supabase Auth email/password, then role from the `staff` table.
 *  - Local mode: ADMIN_EMAIL/ADMIN_PASSWORD (+ optional DISPATCHER_*) env vars.
 */
export async function authenticateStaff(email: string, password: string, rlKey: string): Promise<StaffSession | null> {
  email = email.trim().toLowerCase();
  let role: StaffRole | null = null;
  if (isSupabase) {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY! },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) role = (await one("staff", { email }))?.role ?? null;
  } else {
    const users: { email?: string; password?: string; role: StaffRole }[] = [
      { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: "admin" },
      { email: process.env.DISPATCHER_EMAIL, password: process.env.DISPATCHER_PASSWORD, role: "dispatcher" },
    ];
    for (const u of users) {
      if (u.email && u.password && u.password.length >= 10 && safeEqual(u.email.toLowerCase(), email) && safeEqual(u.password, password)) role = u.role;
    }
  }
  if (!role) { noteFailure(rlKey); return null; }
  attempts.delete(rlKey);
  return { email, role, exp: Date.now() + MAX_AGE * 1000 };
}

export async function startStaffSession(s: StaffSession) {
  (await cookies()).set(COOKIE, sign(s), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
export async function endStaffSession() {
  (await cookies()).delete(COOKIE);
}
export async function getStaff(): Promise<StaffSession | null> {
  const s = verify<StaffSession>((await cookies()).get(COOKIE)?.value);
  return s && s.exp > Date.now() ? s : null;
}

/** Role-based guard for admin pages and server actions. */
export async function requireStaff(roles: StaffRole[] = ["admin", "dispatcher"]): Promise<StaffSession> {
  const s = await getStaff();
  if (!s) redirect("/admin/login");
  if (!roles.includes(s.role)) redirect("/admin?denied=1");
  return s;
}

/** Resolve a magic-link token (customer or detailer portals). */
export function tokenValid(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}
