"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VEHICLES, TIME_WINDOWS, FREQUENCIES, POLICIES } from "@/lib/config";
import { Icon } from "./home/hero";

type Pkg = { id: string; name: string; base_price: number; tagline: string; features: string[] };
type Data = {
  zip: string; address: string; city: string; vehicle: string; vehicle_details: string; package_id: string;
  date: string; time_window: string; preferred_detailer_id: string; frequency: string;
  name: string; email: string; phone: string; instructions: string; sms_opt_in: boolean; website: string;
};
const STEPS = ["Your car", "Service & time", "Your details"];
const LAST = STEPS.length - 1;

function isoDay(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingWizard({ packages, initialPackage, initialZip }: { packages: Pkg[]; initialPackage?: string; initialZip?: string }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [d, setD] = useState<Data>({
    zip: initialZip ?? "", address: "", city: "", vehicle: "", vehicle_details: "",
    package_id: initialPackage && (packages.some((p) => p.id === initialPackage) || initialPackage === "custom") ? initialPackage : "",
    date: "", time_window: "", preferred_detailer_id: "", frequency: "none",
    name: "", email: "", phone: "", instructions: "", sms_opt_in: false, website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [zipInfo, setZipInfo] = useState<{ city: string; county: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailers, setDetailers] = useState<{ id: string; label: string }[]>([]);
  const [done, setDone] = useState<{ ref: string; accountToken: string | null } | null>(null);
  const [formError, setFormError] = useState("");

  const set = <K extends keyof Data>(k: K, v: Data[K]) => { setD((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const pkg = packages.find((p) => p.id === d.package_id);

  useEffect(() => {
    if (step !== 1 || !/^\d{5}$/.test(d.zip)) return;
    fetch(`/api/detailers-for-zip?zip=${d.zip}`).then((r) => r.json()).then((j) => setDetailers(j.detailers ?? [])).catch(() => setDetailers([]));
  }, [step, d.zip]);

  async function validate(s: number): Promise<boolean> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!/^\d{5}$/.test(d.zip)) e.zip = "Enter a 5-digit ZIP code";
      if (d.address.trim().length < 4) e.address = "Enter your street address";
      let city = d.city.trim();
      if (!e.zip) {
        setBusy(true);
        try {
          const j = await (await fetch(`/api/zip-check?zip=${d.zip}`)).json();
          if (!j.available) e.zip = "Sorry — we don't serve this ZIP code yet.";
          else { setZipInfo({ city: j.city, county: j.county }); if (!city) { city = j.city; set("city", j.city); } }
        } catch { e.zip = "Couldn't verify your ZIP code. Please try again."; }
        setBusy(false);
      }
      if (city.length < 2) e.city = "Enter your city";
      if (!d.vehicle) e.vehicle = "Choose your vehicle type";
    }
    if (s === 1) {
      if (!d.package_id) e.package_id = "Choose a service";
      if (!d.date) e.date = "Choose a preferred date";
      else if (d.date < isoDay(1)) e.date = "Please choose a date from tomorrow onward";
      if (!d.time_window) e.time_window = "Choose a time window";
    }
    if (s === 2) {
      if (d.name.trim().length < 2) e.name = "Enter your full name";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Enter a valid email";
      if (d.phone.replace(/\D/g, "").replace(/^1/, "").length !== 10) e.phone = "Enter a valid US phone number";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const topRef = useRef<HTMLDivElement>(null);
  const toTop = () => { const el = topRef.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  async function next() { if (await validate(step)) { setDir(1); setStep((s) => Math.min(s + 1, LAST)); toTop(); } }
  function back() { setDir(-1); setStep((s) => Math.max(s - 1, 0)); toTop(); }
  function goto(s: number) { setDir(s > step ? 1 : -1); setStep(s); toTop(); }

  async function submit() {
    if (!(await validate(LAST))) return;
    setBusy(true); setFormError("");
    try {
      const r = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, preferred_detailer_id: d.preferred_detailer_id || null }),
      });
      const j = await r.json();
      if (!r.ok) {
        setFormError(j.error ?? "Something went wrong.");
        if (j.fields) {
          setErrors(j.fields);
          const map: Record<string, number> = { zip: 0, address: 0, city: 0, vehicle: 0, package_id: 1, date: 1, time_window: 1, name: 2, email: 2, phone: 2 };
          const first = Object.keys(j.fields).map((k) => map[k]).filter((n) => n !== undefined).sort()[0];
          if (first !== undefined) goto(first);
        }
      } else {
        setDone({ ref: j.ref, accountToken: j.accountToken });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch { setFormError("Network error — please check your connection and try again."); }
    setBusy(false);
  }

  const summary = useMemo(() => [
    ["Your car", `${VEHICLES.find((v) => v.id === d.vehicle)?.label ?? ""}${d.vehicle_details ? ` (${d.vehicle_details})` : ""} · ${d.address}, ${d.city} ${d.zip}`, 0],
    ["Service", `${pkg ? `${pkg.name} · from $${pkg.base_price}` : d.package_id === "custom" ? "Custom quote" : ""}`, 1],
    ["When", `${d.date ? new Date(d.date + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""} · ${TIME_WINDOWS.find((t) => t.id === d.time_window)?.label ?? ""} · ${FREQUENCIES.find((f) => f.id === d.frequency)?.label ?? ""}${detailers.find((x) => x.id === d.preferred_detailer_id) ? ` · ${detailers.find((x) => x.id === d.preferred_detailer_id)!.label}` : ""}`, 1],
  ] as [string, string, number][], [d, pkg, detailers]);

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-xl p-8 text-center sm:p-12">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.15 }} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-palm text-white shadow-lift">
          <Icon name="check" className="h-10 w-10" />
        </motion.span>
        <h2 className="mt-6 font-display text-3xl font-extrabold">Request received!</h2>
        <p className="mt-2 text-ink-muted">Reference <b className="text-navy">{done.ref}</b></p>
        <div className="mt-6 rounded-2xl bg-sky p-5 text-left text-sm leading-relaxed text-navy">
          <p><b>What happens next:</b> this is a booking <b>request</b>. Our team will review it, match you with a local detailer and confirm your appointment by email{d.sms_opt_in ? " and text" : ""}. You won&apos;t be charged until your service is confirmed.</p>
          <p className="mt-3 text-ink-muted">{POLICIES.cancellation}</p>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {done.accountToken
            ? <a href={`/account/enter?token=${done.accountToken}`} className="btn-primary">View my bookings</a>
            : <p className="text-sm text-ink-muted">We&apos;ve emailed a link to manage your bookings.</p>}
          <Link href="/" className="btn-ghost">Back to home</Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-3xl scroll-mt-24">
      {/* progress */}
      <ol className="mb-8 flex items-center gap-2" aria-label="Booking progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" disabled={i > step} onClick={() => goto(i)} className="group w-full text-left disabled:cursor-default" aria-current={i === step ? "step" : undefined}>
              <div className="h-1.5 overflow-hidden rounded-full bg-navy/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-palm" initial={false} animate={{ width: i < step ? "100%" : i === step ? "50%" : "0%" }} transition={{ duration: 0.5 }} />
              </div>
              <span className={`mt-2 hidden text-xs font-semibold sm:block ${i <= step ? "text-navy" : "text-navy/40"}`}>{s}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mb-2 text-sm font-semibold text-brand sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      <div className="card relative overflow-hidden p-6 sm:p-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir}
            initial={{ opacity: 0, x: dir * 48 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -48 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {step === 0 && (
              <Step title="Where's your car?" sub="Your home, office or wherever it's parked.">
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="ZIP code" error={errors.zip} className="sm:col-span-1">
                    <input className="input" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={d.zip} onChange={(e) => { set("zip", e.target.value.replace(/\D/g, "")); setZipInfo(null); }} />
                  </Field>
                  <Field label="Street address" error={errors.address} className="sm:col-span-2">
                    <input className="input" autoComplete="street-address" value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Palm Ave" />
                  </Field>
                  <Field label="City" error={errors.city} className="sm:col-span-3">
                    <input className="input" autoComplete="address-level2" value={d.city} onChange={(e) => set("city", e.target.value)} />
                  </Field>
                </div>
                {zipInfo && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-palm"><Icon name="check" className="h-4 w-4" />We serve {zipInfo.city}, {zipInfo.county}</p>}
                <p className="label mt-8">Vehicle type</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {VEHICLES.map((v) => (
                    <Choice key={v.id} selected={d.vehicle === v.id} onClick={() => set("vehicle", v.id)} label={v.label} />
                  ))}
                </div>
                {errors.vehicle && <p className="field-error">{errors.vehicle}</p>}
                <Field label="Make, model & color (optional)" className="mt-5">
                  <input className="input" maxLength={120} value={d.vehicle_details} onChange={(e) => set("vehicle_details", e.target.value)} placeholder="e.g. White 2021 Toyota RAV4" />
                </Field>
              </Step>
            )}
            {step === 1 && (
              <Step title="Service & time" sub="Starting prices: your final price is confirmed before you pay.">
                <div className="grid gap-3">
                  {packages.map((p) => (
                    <button type="button" key={p.id} onClick={() => set("package_id", p.id)} aria-pressed={d.package_id === p.id}
                      className={`flex items-start justify-between gap-4 rounded-2xl p-5 text-left ring-1 transition ${d.package_id === p.id ? "bg-sky ring-2 ring-brand" : "ring-navy/10 hover:ring-brand/40"}`}>
                      <span><b className="font-display text-lg">{p.name}</b><span className="mt-1 block text-sm text-ink-muted">{p.features.join(" · ")}</span></span>
                      <span className="shrink-0 text-right"><span className="block text-xs text-ink-muted">from</span><b className="font-display text-2xl">${p.base_price}</b></span>
                    </button>
                  ))}
                  <button type="button" onClick={() => set("package_id", "custom")} aria-pressed={d.package_id === "custom"}
                    className={`rounded-2xl p-5 text-left ring-1 transition ${d.package_id === "custom" ? "bg-sky ring-2 ring-brand" : "ring-navy/10 hover:ring-brand/40"}`}>
                    <b className="font-display text-lg">Custom quote</b><span className="mt-1 block text-sm text-ink-muted">Heavy pet hair, stains, fleets or something specific — tell us in your notes and we&apos;ll quote you.</span>
                  </button>
                </div>
                {errors.package_id && <p className="field-error">{errors.package_id}</p>}
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <Field label="Preferred date" error={errors.date}>
                    <input type="date" className="input" min={isoDay(1)} max={isoDay(120)} value={d.date} onChange={(e) => set("date", e.target.value)} />
                  </Field>
                  <Field label="Preferred detailer" hint={detailers.length ? undefined : "Detailer selection becomes available as detailers join your area."}>
                    <select className="input" value={d.preferred_detailer_id} onChange={(e) => set("preferred_detailer_id", e.target.value)} disabled={!detailers.length}>
                      <option value="">No preference</option>
                      {detailers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="label mt-6">Time window</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {TIME_WINDOWS.map((t) => <Choice key={t.id} selected={d.time_window === t.id} onClick={() => set("time_window", t.id)} label={t.label} hint={t.hint} />)}
                </div>
                {errors.time_window && <p className="field-error">{errors.time_window}</p>}
                <p className="mt-3 text-xs text-ink-muted">Time windows are preferences, not reserved slots. We&apos;ll confirm the exact time with you.</p>
                <p className="label mt-6">How often?</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {FREQUENCIES.map((f) => <Choice key={f.id} selected={d.frequency === f.id} onClick={() => set("frequency", f.id)} label={f.label} hint={f.hint} />)}
                </div>
              </Step>
            )}
            {step === 2 && (
              <Step title="Your details" sub="We'll use these to confirm your booking. Detailers only see what they need for the job.">
                <dl className="mb-7 divide-y divide-navy/8 rounded-2xl bg-sky/40 ring-1 ring-navy/10">
                  {summary.map(([k, v, s]) => (
                    <div key={k} className="flex items-start justify-between gap-4 px-5 py-3">
                      <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-ink-muted">{k}</dt><dd className="mt-0.5 text-sm font-medium">{v || "—"}</dd></div>
                      <button type="button" onClick={() => goto(s)} className="shrink-0 text-sm font-semibold text-brand hover:underline">Edit</button>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" error={errors.name}><input className="input" autoComplete="name" value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
                  <Field label="Email" error={errors.email}><input className="input" type="email" autoComplete="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Field>
                  <Field label="Phone number" error={errors.phone}><input className="input" type="tel" autoComplete="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(813) 555-0100" /></Field>
                  <label className="flex items-start gap-3 self-end rounded-2xl bg-sky/60 p-3 text-sm">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={d.sms_opt_in} onChange={(e) => set("sms_opt_in", e.target.checked)} />
                    Text me booking updates. Msg & data rates may apply. Reply STOP to opt out.
                  </label>
                  <Field label="Additional instructions (optional)" className="sm:col-span-2">
                    <textarea className="input min-h-28" maxLength={1000} value={d.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Gate code, parking spot, pet hair, key hand-off…" />
                  </Field>
                  <input tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={d.website} onChange={(e) => set("website", e.target.value)} name="website" />
                </div>
                <p className="mt-6 rounded-2xl bg-sky p-4 text-sm text-navy">
                  {pkg ? <>Starting price <b>${pkg.base_price}</b>. Final price may vary with vehicle size and condition and will be confirmed before payment.</> : <>We&apos;ll send a custom quote before anything is scheduled.</>}
                  {" "}Submitting sends a request — it is not yet a confirmed appointment.
                </p>
                {formError && <p className="field-error mt-4" role="alert">{formError}</p>}
              </Step>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between gap-3">
          <button type="button" onClick={back} className={`btn-ghost ${step === 0 ? "invisible" : ""}`}>Back</button>
          {step < LAST
            ? <button type="button" onClick={next} disabled={busy} className="btn-primary min-w-36">{busy ? "Checking…" : "Continue"}</button>
            : <button type="button" onClick={submit} disabled={busy} className="btn-green min-w-44">{busy ? "Submitting…" : "Submit booking request"}</button>}
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (<div><h2 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h2><p className="mb-7 mt-2 text-ink-muted">{sub}</p>{children}</div>);
}
function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-muted">{hint}</span>}
      {error && <span className="field-error block" role="alert">{error}</span>}
    </label>
  );
}
function Choice({ selected, onClick, label, hint }: { selected: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClick} aria-pressed={selected}
      className={`rounded-2xl px-4 py-4 text-left ring-1 transition ${selected ? "bg-sky ring-2 ring-brand" : "bg-white ring-navy/10 hover:ring-brand/40"}`}>
      <b className="block font-display">{label}</b>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </motion.button>
  );
}
