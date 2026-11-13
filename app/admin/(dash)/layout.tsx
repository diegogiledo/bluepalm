import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { isSupabase } from "@/lib/db";
import { stripeEnabled } from "@/lib/stripe";
import { Logo } from "@/components/logo";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/recurring", label: "Recurring" },
  { href: "/admin/detailers", label: "Detailers" },
  { href: "/admin/finance", label: "Finance", admin: true },
  { href: "/admin/areas", label: "Service areas", admin: true },
  { href: "/admin/settings", label: "Pricing & commission", admin: true },
  { href: "/admin/outbox", label: "Notifications", admin: true },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaff();
  const integrations = [
    ["Database", isSupabase ? "Supabase" : "Local JSON (dev)"],
    ["Email", process.env.RESEND_API_KEY ? "Resend" : "Logged only"],
    ["Payments", stripeEnabled() ? "Stripe" : "Not configured"],
  ];
  return (
    <div className="min-h-screen bg-[#f5f8fc] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="bg-navy p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <Link href="/admin"><Logo light /></Link>
        <nav className="mt-8 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
          {NAV.filter((n) => !n.admin || staff.role === "admin").map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <div className="mt-8 hidden rounded-2xl bg-white/5 p-4 text-xs text-white/60 lg:block">
          <p className="mb-2 font-bold uppercase tracking-wider text-white/80">Integrations</p>
          {integrations.map(([k, v]) => <p key={k} className="flex justify-between gap-2"><span>{k}</span><span className="text-white/85">{v}</span></p>)}
        </div>
        <div className="mt-6 text-xs text-white/60">
          <p className="truncate">{staff.email}</p><p className="capitalize">Role: {staff.role}</p>
          <form action={logout} className="mt-2"><button className="font-semibold text-white hover:underline">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}
