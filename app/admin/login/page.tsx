import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import { AdminLoginForm } from "./form";
import { isSupabase } from "@/lib/db";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function AdminLogin() {
  const unconfigured = !isSupabase && (!process.env.ADMIN_EMAIL || (process.env.ADMIN_PASSWORD ?? "").length < 10);
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lift">
        <LogoMark className="h-11 w-11" />
        <h1 className="mt-5 font-display text-2xl font-extrabold">BluePalm admin</h1>
        <p className="mb-6 mt-1 text-sm text-ink-muted">Staff access only.</p>
        {unconfigured && <p className="mb-4 rounded-xl bg-amber-100 p-3 text-xs text-amber-900">No staff accounts configured. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) in .env.local.</p>}
        <AdminLoginForm />
      </div>
    </div>
  );
}
