import Link from "next/link";
import { Nav, FloatingBook } from "@/components/site-chrome";
import { Logo } from "@/components/logo";
import { BRAND, COUNTIES } from "@/lib/config";

const LOCATION_PAGES = [
  { href: "/locations/manatee-county", label: "Manatee County" },
  { href: "/locations/sarasota-county", label: "Sarasota County" },
  { href: "/locations/st-petersburg", label: "St. Petersburg" },
  { href: "/locations/tampa", label: "Tampa" },
];

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <Nav />
      <main id="main">{children}</main>
      <FloatingBook />
      <footer className="bg-navy text-white/75">
        <div className="container-x grid gap-10 py-16 md:grid-cols-4">
          <div className="md:col-span-1">
            <Logo light />
            <p className="mt-4 text-sm leading-relaxed">{BRAND.tagline} Mobile car detailing marketplace serving {BRAND.region}.</p>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">Customers</h3>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/book">Book a detail</Link></li>
              <li><Link className="hover:text-white" href="/#services">Services & pricing</Link></li>
              <li><Link className="hover:text-white" href="/account/login">My bookings</Link></li>
              <li><Link className="hover:text-white" href="/#faq">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">Service areas</h3>
            <ul className="space-y-2 text-sm">
              {LOCATION_PAGES.map((l) => <li key={l.href}><Link className="hover:text-white" href={l.href}>Mobile detailing {l.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">Detailers</h3>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:text-white" href="/become-a-detailer">Become a BluePalm detailer</Link></li>
              <li><Link className="hover:text-white" href="/detailer/login">Detailer portal</Link></li>
              <li><Link className="hover:text-white" href="/detailer-agreement">Contractor agreement</Link></li>
              <li><a className="hover:text-white" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="container-x flex flex-col gap-2 py-6 text-xs text-white/50 sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} BluePalm Auto Care. Services are performed by vetted independent detailing professionals.</p>
            <p>{COUNTIES.map((c) => c.name).join(" · ")}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
