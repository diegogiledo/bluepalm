"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BRAND, COUNTIES } from "@/lib/config";
import { Reveal } from "../motion";
import { Icon } from "./hero";

// Simple equirectangular projection over the region's bounding box.
const W = 440, H = 700;
const LON0 = -82.9, LON1 = -82.1, LAT0 = 26.95, LAT1 = 28.12;
const px = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;

// Approximate (stylized) coastline of Pinellas, Tampa Bay and the Gulf coast.
const COAST: [number, number][] = [
  [28.12, -82.1], [28.12, -82.79], [28.0, -82.83], [27.88, -82.85], [27.78, -82.78], [27.7, -82.74], [27.67, -82.71],
  [27.7, -82.65], [27.77, -82.62], [27.85, -82.63], [27.93, -82.67], [28.0, -82.69], [28.04, -82.66],
  [27.99, -82.58], [27.92, -82.55], [27.85, -82.53], [27.83, -82.5], [27.87, -82.48], [27.93, -82.46],
  [27.89, -82.42], [27.82, -82.41], [27.75, -82.42], [27.68, -82.47], [27.62, -82.53], [27.58, -82.6], [27.55, -82.66],
  [27.53, -82.73], [27.45, -82.69], [27.35, -82.6], [27.25, -82.54], [27.15, -82.49], [27.08, -82.45], [27.0, -82.4],
  [26.95, -82.36], [26.95, -82.1],
];
const coastPath = "M" + COAST.map(([lat, lon]) => `${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join(" L") + " Z";

const COLORS: Record<string, string> = {
  "manatee-county": "#1264D6", "sarasota-county": "#20A575", "pinellas-county": "#7c5cff", "hillsborough-county": "#f28c28",
};
const LABEL_RIGHT = new Set(["Ellenton", "Parrish", "Lakewood Ranch", "Brandon", "Riverview", "North Port", "Tampa"]);

type ZipResult = { state: "idle" | "loading" | "ok" | "no" | "error"; city?: string; county?: string; message?: string };

export function ServiceArea() {
  const [active, setActive] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  const [res, setRes] = useState<ZipResult>({ state: "idle" });

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip)) { setRes({ state: "error", message: "Enter a 5-digit ZIP code." }); return; }
    setRes({ state: "loading" });
    try {
      const r = await fetch(`/api/zip-check?zip=${zip}`);
      const j = await r.json();
      setRes(j.available ? { state: "ok", city: j.city, county: j.county } : { state: "no" });
    } catch { setRes({ state: "error", message: "Couldn't check right now. Please try again." }); }
  }

  return (
    <section id="service-area" className="relative overflow-hidden bg-gradient-to-b from-white to-sky py-24 sm:py-28">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Reveal>
            <span className="eyebrow">Service area</span>
            <h2 className="h2 mt-4">Serving Tampa Bay & the Suncoast</h2>
            <p className="lead mt-4">Check your ZIP code to see if we come to you.</p>
          </Reveal>

          <Reveal delay={0.1}>
            <form onSubmit={check} className="mt-8 flex flex-col gap-3 rounded-3xl bg-white p-3 shadow-card ring-1 ring-navy/5 sm:flex-row" noValidate>
              <label htmlFor="zip-check" className="sr-only">ZIP code</label>
              <input id="zip-check" inputMode="numeric" autoComplete="postal-code" maxLength={5} placeholder="Enter your ZIP code"
                value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, "")); setRes({ state: "idle" }); }}
                className="input border-0 text-lg focus:ring-0" />
              <button className="btn-primary shrink-0" disabled={res.state === "loading"}>{res.state === "loading" ? "Checking…" : "Check availability"}</button>
            </form>
            <div aria-live="polite" className="min-h-[88px]">
              <AnimatePresence mode="wait">
                {res.state === "ok" && (
                  <motion.div key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-start gap-3 rounded-2xl bg-palm/10 p-4 text-navy">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-palm text-white"><Icon name="check" className="h-5 w-5" /></span>
                    <div><b>Great news — we serve {res.city}, {res.county}.</b>
                      <div className="mt-1"><Link href={`/book?zip=${zip}`} className="font-semibold text-brand hover:underline">Book your detail →</Link></div></div>
                  </motion.div>
                )}
                {res.state === "no" && (
                  <motion.div key="no" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl bg-white p-4 text-navy ring-1 ring-navy/10">
                    <b>We&apos;re not in {zip} yet.</b> We&apos;re expanding across the region — email us at{" "}
                    <a className="font-semibold text-brand" href={`mailto:${BRAND.supportEmail}?subject=Service%20request%20${zip}`}>{BRAND.supportEmail}</a> and we&apos;ll let you know when we arrive.
                  </motion.div>
                )}
                {res.state === "error" && <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="field-error mt-4">{res.message}</motion.p>}
              </AnimatePresence>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="grid gap-3 sm:grid-cols-2">
            {COUNTIES.map((c) => (
              <button key={c.slug} type="button" onMouseEnter={() => setActive(c.slug)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(c.slug)} onBlur={() => setActive(null)} onClick={() => setActive(active === c.slug ? null : c.slug)}
                className={`rounded-2xl bg-white p-4 text-left ring-1 transition ${active === c.slug ? "ring-2 shadow-card" : "ring-navy/8"}`}
                style={active === c.slug ? { ["--tw-ring-color" as string]: COLORS[c.slug] } : undefined}>
                <span className="flex items-center gap-2 font-display font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[c.slug] }} />{c.name}</span>
                <span className="mt-1 block text-sm text-ink-muted">{c.cities.map((x) => x.name).join(", ")}{c.nearby ? " & nearby communities" : ""}</span>
              </button>
            ))}
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative mx-auto w-full max-w-md">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#cfe6ff] shadow-lift ring-1 ring-navy/10">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Stylized map of the BluePalm service area from Tampa to North Port">
              <defs>
                <pattern id="waves" width="40" height="16" patternUnits="userSpaceOnUse">
                  <path d="M0 8 Q10 2 20 8 T40 8" fill="none" stroke="#b5d8ff" strokeWidth="1.5" />
                </pattern>
              </defs>
              <rect width={W} height={H} fill="url(#waves)" />
              <motion.path d={coastPath} fill="#fbfdff" stroke="#9cc3ef" strokeWidth="2"
                initial={{ pathLength: 0, fillOpacity: 0 }} whileInView={{ pathLength: 1, fillOpacity: 1 }} viewport={{ once: true }}
                transition={{ pathLength: { duration: 2, ease: "easeInOut" }, fillOpacity: { delay: 1, duration: 1 } }} />
              <text x={px(-82.84)} y={py(27.05)} className="fill-[#5f8fc7] text-[15px] font-bold italic" style={{ letterSpacing: 4 }}>THE GULF</text>
              <text x={px(-82.6)} y={py(27.66)} className="fill-[#5f8fc7] text-[11px] font-semibold italic">Tampa Bay</text>
              {COUNTIES.flatMap((c, ci) => c.cities.map((city, i) => {
                const x = px(city.lon), y = py(city.lat);
                const dim = active && active !== c.slug;
                const right = LABEL_RIGHT.has(city.name);
                return (
                  <motion.g key={city.name} initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: dim ? 0.25 : 1, scale: 1 }} animate={{ opacity: dim ? 0.25 : 1 }}
                    viewport={{ once: true }} transition={{ delay: 1.2 + ci * 0.2 + i * 0.07, type: "spring", stiffness: 260, damping: 18 }}
                    style={{ transformOrigin: `${x}px ${y}px` }}>
                    <circle cx={x} cy={y} r="9" fill={COLORS[c.slug]} opacity="0.35" className="map-pulse" style={{ animationDelay: `${(ci + i) * 0.3}s` }} />
                    <circle cx={x} cy={y} r={active === c.slug ? 7 : 5.5} fill={COLORS[c.slug]} stroke="#fff" strokeWidth="2.5" />
                    <text x={right ? x + 11 : x - 11} y={y + 4} textAnchor={right ? "start" : "end"}
                      className="fill-navy text-[12.5px] font-bold" style={{ paintOrder: "stroke", stroke: "#fbfdff", strokeWidth: 4 }}>{city.name}</text>
                  </motion.g>
                );
              }))}
            </svg>
            <span className="absolute bottom-3 right-3 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold text-ink-muted backdrop-blur">Stylized map · not to scale</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
