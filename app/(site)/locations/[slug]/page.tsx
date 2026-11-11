import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCATIONS } from "@/lib/locations";
import { BRAND } from "@/lib/config";
import { FAQS } from "@/lib/faq";
import { activePackages } from "@/lib/services";
import { Services, HowItWorks, FAQ, FinalCTA } from "@/components/home/sections";
import { ServiceArea } from "@/components/home/service-area";
import { Reveal } from "@/components/motion";

export const revalidate = 300;
export const dynamicParams = false;
export function generateStaticParams() { return LOCATIONS.map((l) => ({ slug: l.slug })); }

export async function generateMetadata({ params }: PageProps<"/locations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const l = LOCATIONS.find((x) => x.slug === slug);
  if (!l) return {};
  return {
    title: { absolute: `${l.title} | BluePalm` }, description: l.description,
    alternates: { canonical: `/locations/${l.slug}` },
    openGraph: { title: l.title, description: l.description, url: `/locations/${l.slug}` },
  };
}

export default async function LocationPage({ params }: PageProps<"/locations/[slug]">) {
  const { slug } = await params;
  const l = LOCATIONS.find((x) => x.slug === slug);
  if (!l) notFound();
  const packages = await activePackages();
  const ld = {
    "@context": "https://schema.org", "@type": "Service", serviceType: "Mobile car detailing",
    provider: { "@type": "AutoWash", name: BRAND.name, url: BRAND.siteUrl },
    areaServed: l.communities.filter((c) => !c.startsWith("Nearby")).map((c) => ({ "@type": "City", name: `${c}, FL` })),
    offers: packages.map((p) => ({ "@type": "Offer", name: p.name, priceCurrency: "USD", price: p.base_price, description: `Starting price. ${p.tagline}` })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="bg-hero pb-20 pt-32 text-white sm:pt-40">
        <div className="container-x max-w-4xl">
          <Reveal><p className="text-sm font-semibold text-white/70"><Link href="/" className="hover:text-white">Home</Link> / Service areas / {l.name}</p></Reveal>
          <Reveal delay={0.05}><h1 className="mt-4 font-display text-4xl font-extrabold sm:text-6xl">{l.h1}</h1></Reveal>
          <Reveal delay={0.1}><p className="mt-5 max-w-2xl text-lg text-white/80">{l.intro}</p></Reveal>
          <Reveal delay={0.15} className="mt-8 flex flex-wrap gap-2">
            {l.communities.map((c) => <span key={c} className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold ring-1 ring-white/20">{c}</span>)}
          </Reveal>
          <Reveal delay={0.2} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/book" className="btn bg-white px-8 py-4 text-brand hover:bg-sky">BOOK YOUR DETAIL</Link>
            <a href="#services" className="btn px-8 py-4 text-white ring-1 ring-white/35 hover:bg-white/10">EXPLORE SERVICES</a>
          </Reveal>
        </div>
      </section>
      <HowItWorks />
      <Services packages={packages} />
      <ServiceArea />
      <section className="bg-white py-16">
        <div className="container-x max-w-3xl text-center">
          <h2 className="font-display text-2xl font-extrabold">Popular in {l.name}</h2>
          <p className="mt-3 text-ink-muted">{l.highlights.join(" · ")}</p>
          <p className="mt-6 text-sm text-ink-muted">Also serving: {LOCATIONS.filter((x) => x.slug !== l.slug).map((x, i) => (
            <span key={x.slug}>{i > 0 && " · "}<Link href={`/locations/${x.slug}`} className="font-semibold text-brand hover:underline">{x.name}</Link></span>))}</p>
        </div>
      </section>
      <FAQ items={FAQS.slice(0, 6)} />
      <FinalCTA />
    </>
  );
}
