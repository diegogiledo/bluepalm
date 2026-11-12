import { Hero } from "@/components/home/hero";
import { HowItWorks, Services, WhyBluePalm, Stats, Testimonials, FAQ, FinalCTA } from "@/components/home/sections";
import { ServiceArea } from "@/components/home/service-area";
import { TravelCar } from "@/components/home/travel-car";
import { activePackages } from "@/lib/services";
import { db } from "@/lib/db";
import { FAQS } from "@/lib/faq";

export const revalidate = 300;

// Only genuine figures from the database are shown. Each counter appears once
// it passes a minimum threshold so tiny early numbers aren't showcased.
async function genuineStats() {
  const [bookings, zips] = await Promise.all([db.select("bookings"), db.select("service_zips", { enabled: true })]);
  const completed = bookings.filter((b) => b.status === "completed");
  const rated = completed.filter((b) => b.customer_rating != null);
  const out: { label: string; value: number; suffix?: string; decimals?: number }[] = [];
  if (completed.length >= 25) out.push({ label: "Completed services", value: completed.length, suffix: "+" });
  const cities = new Set(zips.map((z) => z.city)).size;
  if (cities > 0 && out.length) out.push({ label: "Communities served", value: cities });
  if (rated.length >= 20) {
    const satisfied = rated.filter((b) => (b.customer_rating ?? 0) >= 4).length;
    out.push({ label: "Customer satisfaction (4★+)", value: Math.round((satisfied / rated.length) * 100), suffix: "%" });
  }
  return out;
}

export default async function Home() {
  const [packages, stats] = await Promise.all([activePackages(), genuineStats()]);
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Hero fromPrice={packages.length ? Math.min(...packages.map((p) => p.base_price)) : null} />
      <HowItWorks />
      <Services packages={packages} />
      <WhyBluePalm />
      <Stats stats={stats} />
      <ServiceArea />
      <Testimonials />
      <FAQ items={FAQS} />
      <FinalCTA parking />
      <TravelCar />
    </>
  );
}
