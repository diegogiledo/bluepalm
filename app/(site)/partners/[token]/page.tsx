import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { Submit } from "@/components/portal-forms";
import { joinAction, unsubscribeAction } from "../actions";

export const metadata: Metadata = { title: "BluePalm partner detailers", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PartnerPage({ params, searchParams }: PageProps<"/partners/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const m = await one("market_detailers", { token });
  if (!m) notFound();
  const leaving = sp.unsubscribe === "1";
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 pb-16 pt-28">
      <div className="card w-full max-w-lg p-8">
        <p className="eyebrow">{m.business_name}</p>
        {m.status === "unsubscribed" ? (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-ink-muted">We won&apos;t email {m.business_name} again. Changed your mind? You can join below.</p>
          <form action={joinAction} className="mt-6"><input type="hidden" name="token" value={token} /><Submit className="btn-primary">Send me jobs after all</Submit></form>
        </>) : leaving ? (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Stop BluePalm emails?</h1>
          <p className="mt-3 text-ink-muted">{m.business_name} won&apos;t get any more invitations or job emails from us.</p>
          <form action={unsubscribeAction} className="mt-6"><input type="hidden" name="token" value={token} /><Submit className="btn btn-sm bg-red-600 text-white hover:bg-red-700">Unsubscribe</Submit></form>
        </>) : m.status === "opted_in" ? (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">{sp.joined ? "You're in! 🎉" : "You're getting BluePalm jobs"}</h1>
          <p className="mt-3 text-ink-muted">When a customer books in {m.counties.join(", ") || "your area"}, we&apos;ll email the job to {m.email}. The first detailer to accept gets it.</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>The customer pays by card through BluePalm after the service.</li>
            <li>Your share goes to your bank through Stripe (you&apos;ll set that up once, after your first job).</li>
            <li>No fees to join. Take only the jobs you want.</li>
          </ul>
          <form action={unsubscribeAction} className="mt-6"><input type="hidden" name="token" value={token} /><button className="text-sm text-ink-muted underline">Stop job emails</button></form>
        </>) : (<>
          <h1 className="mt-3 font-display text-3xl font-extrabold">Get customers from BluePalm</h1>
          <p className="mt-3 text-ink-muted">We book mobile detailing for customers in Tampa Bay and Sarasota. Join and we&apos;ll email {m.business_name} the jobs in {m.counties.join(", ") || "your area"}. First to accept gets the job.</p>
          <form action={joinAction} className="mt-6"><input type="hidden" name="token" value={token} /><Submit className="btn-primary">Yes, send me jobs</Submit></form>
          <form action={unsubscribeAction} className="mt-3"><input type="hidden" name="token" value={token} /><button className="text-sm text-ink-muted underline">No thanks, don&apos;t email me</button></form>
        </>)}
      </div>
    </div>
  );
}
