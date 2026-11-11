"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { COUNTY_NAMES } from "@/lib/validation";
import { Icon } from "./home/hero";

const AVAIL = ["Weekday mornings", "Weekday afternoons", "Weekends", "Evenings"];

export function DetailerApplication() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(""); setErrors({});
    try {
      const r = await fetch("/api/detailer-applications", { method: "POST", body: new FormData(e.currentTarget) });
      const j = await r.json();
      if (r.ok) setDone(true);
      else { setMsg(j.error ?? "Something went wrong."); setErrors(j.fields ?? {}); }
    } catch { setMsg("Network error — please try again."); }
    setBusy(false);
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-10 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-palm text-white"><Icon name="check" className="h-8 w-8" /></span>
        <h3 className="mt-5 font-display text-2xl font-extrabold">Application received</h3>
        <p className="mt-2 text-ink-muted">Thanks for applying! We&apos;ve emailed you a confirmation and will be in touch about next steps.</p>
      </motion.div>
    );
  }

  const E = ({ k }: { k: string }) => (errors[k] ? <span className="field-error block" role="alert">{errors[k]}</span> : null);
  return (
    <form onSubmit={submit} className="card space-y-8 p-6 sm:p-10" noValidate>
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold">Contact information</legend>
        <label><span className="label">Full name</span><input name="name" className="input" autoComplete="name" required /><E k="name" /></label>
        <label><span className="label">Email</span><input name="email" type="email" className="input" autoComplete="email" required /><E k="email" /></label>
        <label><span className="label">Mobile phone</span><input name="phone" type="tel" className="input" autoComplete="tel" required /><E k="phone" /></label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold">Business information</legend>
        <label><span className="label">Business name (if any)</span><input name="business_name" className="input" /></label>
        <label><span className="label">Business type</span>
          <select name="business_type" className="input" defaultValue="individual">
            <option value="individual">Sole proprietor / individual</option><option value="llc">LLC</option>
            <option value="corporation">Corporation</option><option value="other">Other</option>
          </select></label>
        <label><span className="label">EIN last 4 digits (optional)</span><input name="ein_last4" inputMode="numeric" maxLength={4} className="input" /><E k="ein_last4" /></label>
        <label><span className="label">Years of detailing experience</span><input name="years_experience" type="number" min={0} max={60} defaultValue={1} className="input" /><E k="years_experience" /></label>
        <label className="sm:col-span-2"><span className="label">Describe your experience</span>
          <textarea name="experience" className="input min-h-32" maxLength={2000} placeholder="Services you offer, equipment (water tank, generator, extractor), products you use, past clients…" /><E k="experience" /></label>
      </fieldset>

      <fieldset>
        <legend className="mb-4 font-display text-lg font-bold">Service areas</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {COUNTY_NAMES.map((c) => (
            <label key={c} className="flex items-center gap-3 rounded-2xl p-4 ring-1 ring-navy/10 has-[:checked]:bg-sky has-[:checked]:ring-2 has-[:checked]:ring-brand">
              <input type="checkbox" name="counties" value={c} className="h-4 w-4 accent-brand" /> {c}
            </label>
          ))}
        </div><E k="counties" />
      </fieldset>

      <fieldset>
        <legend className="mb-4 font-display text-lg font-bold">Availability</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {AVAIL.map((a) => (
            <label key={a} className="flex items-center gap-2 rounded-2xl p-3 text-sm ring-1 ring-navy/10 has-[:checked]:bg-sky has-[:checked]:ring-2 has-[:checked]:ring-brand">
              <input type="checkbox" name="availability" value={a} className="h-4 w-4 accent-brand" /> {a}
            </label>
          ))}
        </div><E k="availability" />
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold">Insurance documentation</legend>
        <label><span className="label">Certificate of insurance (PDF, JPG or PNG, max 8 MB)</span>
          <input name="insurance" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="input file:mr-3 file:rounded-full file:border-0 file:bg-sky file:px-3 file:py-1.5 file:font-semibold file:text-brand" /><E k="insurance" />
          <span className="mt-1.5 block text-xs text-ink-muted">Optional now, required before you can accept jobs.</span></label>
        <label><span className="label">Policy expiration date</span><input name="insurance_expires" type="date" className="input" /></label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-4 font-display text-lg font-bold">Agreements</legend>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="agree_contractor" className="mt-1 h-4 w-4 accent-brand" />
          <span>I have read and agree to the <Link href="/detailer-agreement" target="_blank" className="font-semibold text-brand underline">Independent Contractor Agreement</Link>. I understand I am an independent contractor, not an employee of BluePalm.</span></label><E k="agree_contractor" />
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="agree_customer_policy" className="mt-1 h-4 w-4 accent-brand" />
          <span>I agree to BluePalm&apos;s customer relationship policy: all bookings, payments and customer communication for BluePalm customers stay on the BluePalm platform, and I won&apos;t solicit BluePalm customers for off-platform work.</span></label><E k="agree_customer_policy" />
      </fieldset>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      {msg && <p className="field-error" role="alert">{msg}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
    </form>
  );
}
