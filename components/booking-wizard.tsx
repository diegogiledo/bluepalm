"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VEHICLES, TIME_WINDOWS, FREQUENCIES, POLICIES, PROMOS } from "@/lib/config";
import { Icon } from "./home/hero";
import { AddressAutocomplete, type PickedAddress } from "./address-autocomplete";
import { CardField, cardsEnabled, type CardHandle } from "./card-field";

type Pkg = { id: string; name: string; base_price: number; tagline: string; features: string[] };
type Data = {
  zip: string; address: string; city: string; vehicle: string; vehicle_details: string; package_id: string;
  date: string; time_window: string; frequency: string;
  name: string; email: string; phone: string; instructions: string; website: string; promo: string;
};
const STEPS = ["Your car", "Service & time", "Your details"];
const LAST = STEPS.length - 1;

function isoDay(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingWizard({ packages, initialPackage, initialZip, initialPromo }: { packages: Pkg[]; initialPackage?: string; initialZip?: string; initialPromo?: string }) {
  const promo = initialPromo && PROMOS[initialPromo] ? { code: initialPromo, ...PROMOS[initialPromo] } : null;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [d, setD] = useState<Data>({
    zip: initialZip ?? "", address: "", city: "", vehicle: "", vehicle_details: "",
    package_id: initialPackage && (packages.some((p) => p.id === initialPackage) || initialPackage === "custom") ? initialPackage : "",
    date: "", time_window: "", frequency: "none",
    name: "", email: "", phone: "", instructions: "", website: "", promo: promo?.code ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [zipInfo, setZipInfo] = useState<{ city: string; county: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; accountToken: string | null; promoStatus?: string; card?: string | null } | null>(null);
  const [formError, setFormError] = useState("");
  const [limitMsg, setLimitMsg] = useState(""); // "we're full today" pop-up

  const set = <K extends keyof Data>(k: K, v: Data[K]) => { setD((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const pkg = packages.find((p) => p.id === d.package_id);
  const [help, setHelp] = useState<string | null>(null);
  const cardRef = useRef<CardHandle>(null);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState("");

  async function checkZipNow(zip: string) {
    try {
      const j = await (await fetch(`/api/zip-check?zip=${zip}`)).json();
      if (j.available) { setZipInfo({ city: j.city, county: j.county }); setErrors((e) => ({ ...e, zip: "" })); }
      else setErrors((e) => ({ ...e, zip: "Sorry — we don't serve this ZIP code yet." }));
    } catch {}
  }
  function applyAddress(a: PickedAddress) {
    setD((x) => ({ ...x, address: a.line1, city: a.city || x.city, zip: a.zip || x.zip }));
    setErrors((e) => ({ ...e, address: "", city: "", zip: "" }));
    setZipInfo(null);
    if (/^\d{5}$/.test(a.zip)) checkZipNow(a.zip);
    setLocNote(/^\d/.test(a.line1) ? "" : "Add your house number to the start of the address.");
  }
  function useMyLocation() {
    if (!("geolocation" in navigator)) { setLocNote("Your browser can't share your location. Please type your address."); return; }
    setLocating(true); setLocNote("");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const j = await (await fetch(`/api/address?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, { signal: AbortSignal.timeout(10000) })).json();
        if (j.address) applyAddress(j.address);
        else setLocNote("We couldn't find an address here. Please type it instead.");
      } catch { setLocNote("Couldn't look up your address. Please type it instead."); }
      setLocating(false);
    }, (err) => {
      setLocNote(err.code === err.PERMISSION_DENIED ? "Location access is blocked. Allow it in your browser, or type your address." : "Couldn't get your location. Please type your address.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

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
      // still taking bookings today? (checked before the card is saved)
      try {
        const cap = await (await fetch(`/api/bookings/capacity?zip=${encodeURIComponent(d.zip)}`, { cache: "no-store" })).json();
        if (cap && cap.ok === false) { setLimitMsg(cap.message); setBusy(false); return; }
      } catch {}
      // save the card / Apple Pay with Stripe first (nothing is charged)
      let setup_intent = "";
      if (cardsEnabled) {
        const res = await cardRef.current?.confirm({ name: d.name.trim(), email: d.email.trim(), phone: d.phone });
        if (!res?.setupIntent) {
          setErrors((e) => ({ ...e, card: res?.error ?? "Please add a payment method." }));
          setFormError(res?.error ?? "Please add a payment method.");
          setBusy(false); return;
        }
        setup_intent = res.setupIntent;
      }
      const r = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...d, setup_intent }),
      });
      const j = await r.json();
      if (!r.ok && j.limit) { setLimitMsg(j.error); setBusy(false); return; }
      if (!r.ok) {
        setFormError(j.error ?? "Something went wrong.");
        if (j.fields) {
          setErrors(j.fields);
          const map: Record<string, number> = { zip: 0, address: 0, city: 0, vehicle: 0, package_id: 1, date: 1, time_window: 1, name: 2, email: 2, phone: 2 };
          const first = Object.keys(j.fields).map((k) => map[k]).filter((n) => n !== undefined).sort()[0];
          if (first !== undefined) goto(first);
        }
      } else {
        setDone({ ref: j.ref, accountToken: j.accountToken, promoStatus: j.promoStatus, card: j.card });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch { setFormError("Network error — please check your connection and try again."); }
    setBusy(false);
  }

  const summary = useMemo(() => [
    ["Your car", `${VEHICLES.find((v) => v.id === d.vehicle)?.label ?? ""}${d.vehicle_details ? ` (${d.vehicle_details})` : ""} · ${d.address}, ${d.city} ${d.zip}`, 0],
    ["Service", `${pkg ? `${pkg.name} · from $${pkg.base_price}` : d.package_id === "custom" ? "Custom quote" : ""}${promo && pkg ? ` · ${promo.code}: ${promo.pct}% off` : ""}`, 1],
    ["When", `${d.date ? new Date(d.date + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""} · ${TIME_WINDOWS.find((t) => t.id === d.time_window)?.label ?? ""} · ${FREQUENCIES.find((f) => f.id === d.frequency)?.label ?? ""}`, 1],
  ] as [string, string, number][], [d, pkg]);

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-xl p-8 text-center sm:p-12">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.15 }} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-palm text-white shadow-lift">
          <Icon name="check" className="h-10 w-10" />
        </motion.span>
        <h2 className="mt-6 font-display text-3xl font-extrabold">Request received!</h2>
        <p className="mt-2 text-ink-muted">Reference <b className="text-navy">{done.ref}</b></p>
        {done.promoStatus === "applied" && <p className="mt-3 inline-flex rounded-full bg-palm/15 px-3 py-1 text-sm font-bold text-palm-600">🎁 {promo?.label ?? "Your discount"} is applied</p>}
        {done.promoStatus === "not_first_booking" && <p className="mt-3 text-sm text-ink-muted">The {promo?.code} offer is for first-time customers, so it wasn&apos;t applied to this booking.</p>}
        <div className="mt-6 rounded-2xl bg-sky p-5 text-left text-sm leading-relaxed text-navy">
          <p><b>What happens next:</b> this is a booking <b>request</b>. Our team will review it, match you with a local detailer and confirm your appointment by email. {done.card ? <>Your <b>{done.card}</b> is saved securely and only charged after your service is complete.</> : <>You won&apos;t be charged until your service is confirmed.</>}</p>
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
      {promo && (
        <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl bg-palm/10 px-4 py-3 text-center text-sm font-semibold text-palm-600 ring-1 ring-palm/30">
          🎁 {promo.label}: code <b>{promo.code}</b> applies if this is your first BluePalm booking.
        </motion.p>
      )}
      {/* "we're full today" pop-up (email limit reached); nothing was saved or charged */}
      <AnimatePresence>
        {limitMsg && (
          <motion.div key="limit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-navy/50 p-4 backdrop-blur-sm" onClick={() => setLimitMsg("")}>
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="limit-title" aria-describedby="limit-body"
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-7 text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-sky text-2xl" aria-hidden>🗓️</div>
              <h2 id="limit-title" className="font-display text-2xl font-extrabold">We&apos;re fully booked for today</h2>
              <p id="limit-body" className="mt-3 text-ink-muted">{limitMsg}</p>
              <p className="mt-2 text-sm text-ink-muted">Nothing was charged and your card wasn&apos;t saved.</p>
              <button type="button" autoFocus onClick={() => setLimitMsg("")} className="btn-primary mt-6 w-full">OK</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <span className="label mb-0" id="addr-label">Street address</span>
                  <button type="button" onClick={useMyLocation} disabled={locating}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-sky-200 disabled:opacity-60">
                    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
                    {locating ? "Finding you…" : "Use my current location"}
                  </button>
                </div>
                <div className="mt-1.5" aria-labelledby="addr-label">
                  <AddressAutocomplete value={d.address} invalid={Boolean(errors.address)}
                    onChange={(v) => { set("address", v); setLocNote(""); }}
                    onPick={(a) => applyAddress(a)} />
                  {errors.address && <span className="field-error block" role="alert">{errors.address}</span>}
                  {locNote && <span className="mt-1.5 block text-sm text-ink-muted" role="status">{locNote}</span>}
                </div>
                <div className="mt-5 grid grid-cols-[1fr_2fr] gap-4">
                  <Field label="ZIP code" error={errors.zip}>
                    <input className="input" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={d.zip}
                      onChange={(e) => { const z = e.target.value.replace(/\D/g, ""); set("zip", z); setZipInfo(null); if (z.length === 5) checkZipNow(z); }} />
                  </Field>
                  <Field label="City" error={errors.city}>
                    <input className="input" autoComplete="address-level2" value={d.city} onChange={(e) => set("city", e.target.value)} />
                  </Field>
                </div>
                {zipInfo && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-palm"><Icon name="check" className="h-4 w-4" />We serve {zipInfo.city}, {zipInfo.county}</p>}

                <p className="label mt-8">Vehicle size</p>
                <div className="grid grid-cols-3 gap-3">
                  {VEHICLES.map((v) => (
                    <div key={v.id} className="relative">
                      <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => set("vehicle", v.id)} aria-pressed={d.vehicle === v.id}
                        className={`flex w-full flex-col items-center gap-1 rounded-2xl px-2 pb-3 pt-4 text-center ring-1 transition ${d.vehicle === v.id ? "bg-sky ring-2 ring-brand" : "bg-white ring-navy/10 hover:ring-brand/40"}`}>
                        <VehicleIcon size={v.id} active={d.vehicle === v.id} />
                        <b className="font-display">{v.label}</b>
                      </motion.button>
                      <button type="button" onClick={() => setHelp(help === v.id ? null : v.id)} aria-expanded={help === v.id} aria-label={`What counts as a ${v.label.toLowerCase()} vehicle?`}
                        className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold transition ${help === v.id ? "bg-brand text-white" : "bg-navy/5 text-navy/50 hover:bg-sky hover:text-brand"}`}>?</button>
                    </div>
                  ))}
                </div>
                <AnimatePresence>
                  {help && (() => { const v = VEHICLES.find((x) => x.id === help)!; return (
                    <motion.div key={help} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="note">
                      <div className="mt-3 rounded-2xl bg-sky/60 p-4 text-sm text-navy">
                        <b>{v.label}:</b> {v.hint}<span className="mt-1 block text-ink-muted">For example: {v.examples}.</span>
                      </div>
                    </motion.div>
                  ); })()}
                </AnimatePresence>
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
                      <span className="shrink-0 text-right"><span className="block text-xs text-ink-muted">from</span>
                        {promo
                          ? <><s className="mr-1 text-sm text-ink-muted">${p.base_price}</s><b className="font-display text-2xl text-palm-600">${Math.round(p.base_price * (100 - promo.pct)) / 100}</b></>
                          : <b className="font-display text-2xl">${p.base_price}</b>}</span>
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
                  <Field label="Additional instructions (optional)" className="sm:col-span-2">
                    <textarea className="input min-h-28" maxLength={1000} value={d.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Gate code, parking spot, pet hair, key hand-off…" />
                  </Field>
                  <input tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={d.website} onChange={(e) => set("website", e.target.value)} name="website" />
                </div>
                {cardsEnabled && (
                  <section className="mt-8" aria-labelledby="pay-heading">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <h3 id="pay-heading" className="font-display text-lg font-bold">Payment</h3>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                        Secured by Stripe
                      </span>
                    </div>
                    <p className="mb-4 rounded-2xl bg-palm/10 px-4 py-3 text-sm font-semibold text-palm-600">
                      You won&apos;t be charged now. Your card is saved securely and only charged after your service is complete.
                    </p>
                    <CardField handle={cardRef} />
                    {errors.card && <p className="field-error" role="alert">{errors.card}</p>}
                  </section>
                )}
                <p className="mt-6 rounded-2xl bg-sky p-4 text-sm text-navy">
                  {pkg ? <>Starting price <b>${pkg.base_price}</b>{promo ? <>, {promo.pct}% off with <b>{promo.code}</b> if this is your first booking</> : null}. Final price may vary with vehicle size and condition and will be confirmed before payment.</> : <>We&apos;ll send a custom quote before anything is scheduled.</>}
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

/** Side-view silhouettes for the three vehicle sizes. */
function VehicleIcon({ size, active }: { size: string; active: boolean }) {
  const body = active ? "#1264D6" : "#9fb4cf", glass = active ? "#0b2342" : "#51627a", tire = "#0b2342";
  const shapes: Record<string, { body: string; glass: string; wheels: number[] }> = {
    // compact car
    small: { body: "M8 34 Q8 27 15 26 L24 25 Q31 16 41 15 L58 15 Q67 16 73 25 L84 27 Q90 28 90 34 L90 38 L8 38 Z", glass: "M28 25 Q33 18 41 17.5 L48 17.5 L48 25 Z M51 17.5 L58 17.5 Q65 18.5 69 25 L51 25 Z", wheels: [24, 74] },
    // crossover / SUV
    medium: { body: "M6 36 Q6 24 14 23 L22 22 L30 12 Q32 10 36 10 L70 10 Q75 10 78 14 L84 22 Q92 23 93 30 L93 39 L6 39 Z", glass: "M27 21 L33 13 L48 13 L48 21 Z M51 13 L69 13 Q72 13 74 16 L78 21 L51 21 Z", wheels: [24, 76] },
    // full-size truck / van
    large: { body: "M4 38 L4 26 Q4 23 7 23 L36 23 L40 9 Q41 7 44 7 L64 7 Q68 7 70 11 L75 23 L92 23 Q96 24 96 29 L96 40 L4 40 Z", glass: "M43 21 L46 10 L56 10 L56 21 Z M59 10 L65 10 Q67 10 68 12 L72 21 L59 21 Z", wheels: [22, 78] },
  };
  const s = shapes[size] ?? shapes.small;
  return (
    <svg viewBox="0 0 100 50" className="h-10 w-20 sm:h-12 sm:w-24" aria-hidden="true">
      <path d={s.body} fill={body} className="transition-colors" />
      <path d={s.glass} fill={glass} opacity="0.85" />
      {s.wheels.map((x) => <g key={x}><circle cx={x} cy="40" r="7" fill={tire} /><circle cx={x} cy="40" r="3" fill="#dde6f2" /></g>)}
    </svg>
  );
}
