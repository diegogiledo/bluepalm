"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DETAILER_COOKIE, cookieOpts } from "@/lib/portal";
import { acceptOffer, optIn, passOffer, unsubscribe } from "@/lib/partners";

const tok = (f: FormData) => String(f.get("token") ?? "").slice(0, 100);

export async function joinAction(f: FormData) {
  await optIn(tok(f));
  redirect(`/partners/${encodeURIComponent(tok(f))}?joined=1`);
}
export async function unsubscribeAction(f: FormData) {
  await unsubscribe(tok(f));
  redirect(`/partners/${encodeURIComponent(tok(f))}?left=1`);
}
export async function acceptAction(f: FormData) {
  const r = await acceptOffer(tok(f));
  if (r.ok) {
    // sign them in to their portal right away (same cookie as the email sign-in link)
    (await cookies()).set(DETAILER_COOKIE, r.token, cookieOpts);
    redirect("/detailer?accepted=1");
  }
  redirect(`/jobs/${encodeURIComponent(tok(f))}?result=${r.reason}`);
}
export async function passAction(f: FormData) {
  await passOffer(tok(f));
  redirect(`/jobs/${encodeURIComponent(tok(f))}?result=passed`);
}
