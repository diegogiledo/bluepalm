"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reveal, Stagger, StaggerItem, Counter } from "../motion";
import { Icon } from "./hero";
import type { Package } from "@/lib/types";

function SectionHead({ eyebrow, title, lead, center = true }: { eyebrow: string; title: string; lead?: string; center?: boolean }) {
  return (
    <Reveal className={`mb-12 max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="h2 mt-4">{title}</h2>
      {lead && <p className="lead mt-4">{lead}</p>}
    </Reveal>
  );
}

const STEPS = [
  { icon: "car", title: "Choose your service", text: "Pick a package and a time." },
  { icon: "user", title: "We connect you with a local detailer", text: "A vetted pro near you." },
  { icon: "spark", title: "Enjoy a spotless car at your doorstep", text: "At home or at work." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-white py-24 sm:py-28">
      <div className="container-x">
        <SectionHead eyebrow="How it works" title="Three easy steps" />
        <Stagger className="relative grid gap-6 md:grid-cols-3">
          <motion.div aria-hidden className="absolute left-[16%] right-[16%] top-12 hidden h-0.5 origin-left bg-gradient-to-r from-brand via-brand/50 to-palm md:block"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.3 }} />
          {STEPS.map((s, i) => (
            <StaggerItem key={s.title} className="relative text-center">
              <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-[1.75rem] bg-gradient-to-br from-brand to-[#2a8bf0] text-white shadow-lift">
                <Icon name={s.icon} className="h-10 w-10" />
                <span className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-palm font-display text-sm font-extrabold ring-4 ring-white">{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-xl font-bold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-ink-muted">{s.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export function Services({ packages }: { packages: Package[] }) {
  return (
    <section id="services" className="relative overflow-hidden bg-sky py-24 sm:py-28">
      <div aria-hidden className="absolute -top-40 left-1/2 h-80 w-[900px] -translate-x-1/2 rounded-full bg-white/70 blur-3xl" />
      <div className="container-x relative">
        <SectionHead eyebrow="Services & pricing" title="Simple, honest pricing" />
        <Stagger className="grid gap-6 lg:grid-cols-3">
          {packages.map((p, i) => {
            const featured = i === 1;
            return (
              <StaggerItem key={p.id}>
                <motion.div whileHover={{ y: -8 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={`relative flex h-full flex-col rounded-3xl p-7 ${featured ? "bg-navy text-white shadow-lift" : "card"}`}>
                  {featured && <span className="absolute -top-3 left-7 rounded-full bg-palm px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Most popular</span>}
                  <h3 className="font-display text-2xl font-extrabold">{p.name}</h3>
                  <p className="mt-5 flex items-end gap-2">
                    <span className={`text-sm font-semibold ${featured ? "text-white/70" : "text-ink-muted"}`}>Starting at</span>
                    <span className="font-display text-5xl font-extrabold leading-none">${p.base_price}</span>
                  </p>
                  <p className={`mt-1 text-xs ${featured ? "text-white/60" : "text-ink-muted"}`}>{p.duration_hint}</p>
                  <ul className="mt-6 flex-1 space-y-3 text-[15px]">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${featured ? "bg-palm text-white" : "bg-palm/12 text-palm"}`}><Icon name="check" className="h-3.5 w-3.5" /></span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/book?package=${p.id}`} className={`mt-8 w-full ${featured ? "btn bg-white text-navy hover:bg-sky" : "btn-primary"}`}>Select {p.name}</Link>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>
        <Reveal className="mt-8 text-center text-sm text-ink-muted">
          Starting prices — may vary with vehicle size and condition. <Link href="/book?package=custom" className="font-semibold text-brand hover:underline">Custom quote</Link>
        </Reveal>
      </div>
    </section>
  );
}

const WHY = [
  { icon: "home", title: "Convenience at home or work", text: "We come to your driveway, office lot or condo parking — where property rules allow." },
  { icon: "shield", title: "Vetted independent professionals", text: "Every detailer applies, is reviewed and must provide proof of insurance before taking jobs." },
  { icon: "tag", title: "Transparent pricing", text: "Clear starting prices up front. Your final price is confirmed before you pay." },
  { icon: "clock", title: "Easy online booking", text: "Request a detail in a few minutes from any device — no phone tag." },
  { icon: "calendar", title: "Flexible scheduling", text: "Pick a date and time window that fits your day, or set up recurring washes." },
  { icon: "chat", title: "Real customer support", text: "BluePalm manages your booking from start to finish and is one message away." },
  { icon: "star", title: "Satisfaction-focused service", text: "If something isn't right, tell us within 24 hours and we'll work to make it right." },
  { icon: "repeat", title: "Rewards for regulars", text: "Earn loyalty points on every completed service and keep your favorite detailer." },
];

export function WhyBluePalm() {
  return (
    <section id="why" className="bg-white py-24 sm:py-28">
      <div className="container-x">
        <SectionHead eyebrow="Why BluePalm" title="Detailing you can trust" />
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {WHY.map((w) => (
            <StaggerItem key={w.title}>
              <motion.div whileHover={{ y: -6 }} title={w.text}
                className="group flex h-full flex-col items-center gap-3 rounded-3xl border border-navy/8 bg-gradient-to-b from-white to-sky/50 p-5 text-center transition-shadow hover:shadow-card">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white"><Icon name={w.icon} /></span>
                <h3 className="font-display text-[15px] font-bold leading-snug">{w.title}</h3>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/** Counters only render figures that come from real data. */
export function Stats({ stats }: { stats: { label: string; value: number; suffix?: string; decimals?: number }[] }) {
  if (!stats.length) return null;
  return (
    <section className="bg-navy py-16 text-white">
      <Stagger className="container-x grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StaggerItem key={s.label}>
            <p className="font-display text-5xl font-extrabold text-white"><Counter value={s.value} suffix={s.suffix} decimals={s.decimals} /></p>
            <p className="mt-2 text-sm text-white/70">{s.label}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

const PLACEHOLDER_REVIEWS = [
  { name: "Customer name", area: "Lakewood Ranch", text: "This is placeholder text. A genuine review from a BluePalm customer will appear here once reviews are collected." },
  { name: "Customer name", area: "St. Petersburg", text: "Placeholder testimonial. We only publish real feedback from verified, completed bookings." },
  { name: "Customer name", area: "Sarasota", text: "Placeholder testimonial. Reviews will be added after customers complete their first services." },
];

export function Testimonials() {
  return (
    <section id="reviews" className="bg-sky/60 py-24 sm:py-28">
      <div className="container-x">
        <SectionHead eyebrow="Customer stories" title="What our customers say" lead="Real reviews coming soon." />
        <Stagger className="grid gap-6 md:grid-cols-3">
          {PLACEHOLDER_REVIEWS.map((r, i) => (
            <StaggerItem key={i}>
              <figure className="card relative h-full p-7">
                <span className="absolute right-5 top-5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">Placeholder</span>
                <svg className="h-8 w-8 text-brand/25" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9 7H5a2 2 0 00-2 2v4a2 2 0 002 2h2v2a2 2 0 01-2 2h-.5v2H5a4 4 0 004-4V7zm12 0h-4a2 2 0 00-2 2v4a2 2 0 002 2h2v2a2 2 0 01-2 2h-.5v2h.5a4 4 0 004-4V7z" /></svg>
                <blockquote className="mt-4 italic text-ink-muted">{r.text}</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sky-200 text-brand"><Icon name="user" className="h-5 w-5" /></span>
                  <span className="text-sm"><b className="block text-navy">{r.name}</b><span className="text-ink-muted">{r.area} · sample only</span></span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

export type Faq = { q: string; a: string };

export function FAQ({ items }: { items: Faq[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="bg-white py-24 sm:py-28">
      <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHead center={false} eyebrow="FAQ" title="Questions, answered" />
        <Reveal>
          <ul className="divide-y divide-navy/8 rounded-3xl border border-navy/8 bg-white">
            {items.map((f, i) => {
              const isOpen = open === i;
              return (
                <li key={f.q}>
                  <h3>
                    <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-display text-[17px] font-bold text-navy hover:text-brand"
                      aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                      {f.q}
                      <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky text-brand">
                        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 1v12M1 7h12" /></svg>
                      </motion.span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div id={`faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <p className="px-6 pb-6 leading-relaxed text-ink-muted">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="bg-white pb-24">
      <div className="container-x">
        <Reveal>
          <div className="bg-hero relative overflow-hidden rounded-[2.5rem] px-6 py-16 text-center text-white sm:px-16 sm:py-20">
            <motion.div aria-hidden className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 8, repeat: Infinity }} />
            <motion.div aria-hidden className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-palm/30 blur-2xl" animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 9, repeat: Infinity }} />
            <h2 className="relative font-display text-3xl font-extrabold sm:text-5xl">Your car deserves a little BluePalm.</h2>
            <Link href="/book" className="btn relative mt-8 bg-white px-9 py-4 text-brand hover:-translate-y-0.5 hover:bg-sky">BOOK YOUR DETAIL</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
