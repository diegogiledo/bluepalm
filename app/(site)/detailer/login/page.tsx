import type { Metadata } from "next";
import Link from "next/link";
import { MagicLinkForm } from "@/components/portal-forms";
import { requestMagicLink } from "../../account/actions";

export const metadata: Metadata = { title: "Detailer portal", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/detailer/login">) {
  const { invalid } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 pt-24 pb-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-display text-3xl font-extrabold">Detailer portal</h1>
        <p className="mb-6 mt-2 text-ink-muted">Approved BluePalm detailers: enter your email and we'll send a secure sign-in link.</p>
        {invalid && <p className="field-error mb-4">That link is invalid or has expired. Request a new one below.</p>}
        <MagicLinkForm action={requestMagicLink.bind(null, "detailer")} />
        <p className="mt-6 text-center text-sm text-ink-muted">
          Not a detailer yet? <Link href="/become-a-detailer" className="font-semibold text-brand">Apply to join</Link>
        </p>
      </div>
    </div>
  );
}
