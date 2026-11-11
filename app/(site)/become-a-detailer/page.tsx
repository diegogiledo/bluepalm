import type { Metadata } from "next";
import { DetailerApplication } from "@/components/detailer-application";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Icon } from "@/components/home/hero";

export const metadata: Metadata = {
  title: "Become a BluePalm Detailer",
  description: "Independent mobile detailers in Tampa Bay and Sarasota: get matched with local customers, keep a flexible schedule and get paid through BluePalm.",
};

const PERKS = [
  { icon: "calendar", title: "Choose your jobs", text: "See available jobs in your service areas and accept the ones that fit your schedule." },
  { icon: "user", title: "We find the customers", text: "BluePalm handles marketing, booking, payments and customer support so you can focus on detailing." },
  { icon: "tag", title: "Platform payouts", text: "Get paid through BluePalm via Stripe for every completed job, minus the platform commission." },
  { icon: "star", title: "Build your reputation", text: "Great work earns strong ratings and preferred-detailer requests from repeat customers." },
];
const STEPS = [
  ["Apply", "Tell us about your experience, service areas and availability."],
  ["Application review", "Our team reviews your experience and may schedule a short call."],
  ["Insurance verification", "Upload proof of general liability insurance."],
  ["Background check", "A standard check before you work at customer homes."],
  ["Orientation", "Learn BluePalm quality standards and how the portal works."],
  ["Payout setup & first jobs", "Connect payouts through Stripe and start accepting jobs."],
];

export default function BecomeDetailer() {
  return (
    <>
      <section className="bg-hero pb-20 pt-32 text-white">
        <div className="container-x max-w-4xl text-center">
          <Reveal><span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ring-1 ring-white/20">For independent detailers</span></Reveal>
          <Reveal delay={0.05}><h1 className="mt-5 font-display text-4xl font-extrabold sm:text-6xl">Become a BluePalm Detailer</h1></Reveal>
          <Reveal delay={0.1}><p className="mx-auto mt-5 max-w-2xl text-lg text-white/80">Grow your mobile detailing business across Tampa Bay and Sarasota. We bring the customers, booking and payments — you bring the shine.</p></Reveal>
          <Reveal delay={0.15}><a href="#apply" className="btn mt-8 bg-white px-8 py-4 text-brand hover:bg-sky">Apply now</a></Reveal>
        </div>
      </section>
      <section className="py-20">
        <Stagger className="container-x grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <StaggerItem key={p.title} className="card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name={p.icon} /></span>
              <h2 className="mt-4 font-display text-lg font-bold">{p.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{p.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <section className="bg-sky py-20">
        <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Reveal><span className="eyebrow">Onboarding & verification</span><h2 className="h2 mt-4">How joining works</h2>
              <p className="lead mt-4">Every detailer goes through the same verification process before taking jobs, so customers can book with confidence.</p></Reveal>
            <ol className="mt-8 space-y-4">
              {STEPS.map(([t, d], i) => (
                <Reveal key={t} delay={i * 0.06} as="li" className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-extrabold text-white">{i + 1}</span>
                  <span><b className="font-display">{t}</b><span className="block text-sm text-ink-muted">{d}</span></span>
                </Reveal>
              ))}
            </ol>
          </div>
          <div id="apply" className="scroll-mt-24"><DetailerApplication /></div>
        </div>
      </section>
    </>
  );
}
