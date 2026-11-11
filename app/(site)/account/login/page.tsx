import type { Metadata } from "next";
import Link from "next/link";
import { MagicLinkForm } from "@/components/portal-forms";
import { requestMagicLink } from "../../account/actions";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/account/login">) {
  const { invalid } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 pt-24 pb-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-extrabold">My bookings</h1>
        <p className="mb-6 mt-2 text-ink-muted">Enter the email you booked with and we'll send you a secure sign-in link.</p>
        {invalid && <p className="field-error mb-4">That link is invalid or has expired. Request a new one below.</p>}
        <MagicLinkForm action={requestMagicLink.bind(null, "customer")} />
        <p className="mt-6 text-center text-sm text-ink-muted">
          New to BluePalm? <Link href="/book" className="font-semibold text-brand">Book your first detail</Link>
        </p>
      </div>
    </div>
  );
}
