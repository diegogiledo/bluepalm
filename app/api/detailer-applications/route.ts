import { NextResponse } from "next/server";
import { detailerSchema, fieldErrors } from "@/lib/validation";
import { db, one } from "@/lib/db";
import { newId, newToken } from "@/lib/auth";
import { saveDocument } from "@/lib/files";
import { sendEmail, siteUrl } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { now } from "@/lib/services";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`apply:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid submission" }, { status: 400 }); }
  const raw = Object.fromEntries([...form.keys()].filter((k) => k !== "insurance").map((k) => [k, k === "counties" || k === "availability" ? form.getAll(k) : form.get(k)]));
  const parsed = detailerSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  const v = parsed.data;
  if (v.website) return NextResponse.json({ ok: true });

  if (await one("detailers", { email: v.email })) {
    return NextResponse.json({ error: "An application with this email already exists. We'll be in touch — or email us if you need to update it.", fields: { email: "Already applied" } }, { status: 409 });
  }

  const file = form.get("insurance");
  let insurance_file: string | null = null;
  if (file instanceof File && file.size > 0) {
    try { insurance_file = await saveDocument(file); }
    catch (e) { return NextResponse.json({ error: (e as Error).message, fields: { insurance: (e as Error).message } }, { status: 422 }); }
  }

  await db.insert("detailers", {
    id: newId(), name: v.name, email: v.email, phone: v.phone, business_name: v.business_name, business_type: v.business_type,
    ein_last4: v.ein_last4, years_experience: v.years_experience, experience: v.experience, counties: v.counties,
    availability: v.availability, insurance_file, insurance_expires: v.insurance_expires || null, status: "pending",
    access_token: newToken(), agreement_accepted_at: now(), commission_rate: null,
    onboarding: { insurance_verified: false, background_check: false, orientation: false, payouts_connected: false },
    stripe_account_id: null, admin_notes: "", created_at: now(),
  });

  await sendEmail(v.email, "We received your BluePalm detailer application", [
    `Thanks for applying, ${v.name.split(" ")[0]}! Our team reviews every application.`,
    "Next steps: application review → insurance verification → background check → short orientation → payout setup. We'll email you at each stage.",
    insurance_file ? "We received your insurance document." : "Please have your proof of general liability insurance ready — it's required before you can accept jobs.",
  ]);
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `New detailer application: ${v.name}`, [`${v.counties.join(", ")} · ${v.years_experience} yrs experience`], { label: "Review", url: siteUrl("/admin/detailers") });
  }
  return NextResponse.json({ ok: true });
}
