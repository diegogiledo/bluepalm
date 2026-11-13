import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { Submit } from "@/components/portal-forms";
import { resubscribeAction, unsubscribeAction } from "../actions";

export const metadata: Metadata = { title: "BluePalm job emails", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Unsubscribe / resubscribe page linked from every job email. */
export default async function PartnerPage({ params, searchParams }: PageProps<"/partners/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const m = await one("market_detailers", { token });
  if (!m) notFound();
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 pb-16 pt-28">
      <div className="card w-full max-w-lg p-8">
        <p className="eyebrow">{m.business_name}</p>
        {m.status === "unsubscribed" ? (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-ink-muted">We won&apos;t email {m.business_name} any more jobs. Changed your mind?</p>
          <form action={resubscribeAction} className="mt-6"><input type="hidden" name="token" value={token} /><Submit className="btn-primary">Send me jobs again</Submit></form>
        </>) : sp.back ? (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Welcome back 👋</h1>
          <p className="mt-3 text-ink-muted">We&apos;ll email {m.business_name} paid jobs near you again. First to accept gets the job.</p>
        </>) : (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Stop BluePalm job emails?</h1>
          <p className="mt-3 text-ink-muted">{m.business_name} won&apos;t get any more customer jobs from us.</p>
          <form action={unsubscribeAction} className="mt-6"><input type="hidden" name="token" value={token} /><Submit className="btn btn-sm bg-red-600 text-white hover:bg-red-700">Unsubscribe</Submit></form>
        </>)}
      </div>
    </div>
  );
}
