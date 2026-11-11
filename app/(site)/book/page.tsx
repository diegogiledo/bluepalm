import type { Metadata } from "next";
import { BookingWizard } from "@/components/booking-wizard";
import { activePackages } from "@/lib/services";

export const metadata: Metadata = {
  title: "Book Mobile Car Detailing",
  description: "Request a mobile car wash or detail at your home or office in Tampa Bay and Sarasota. Choose your package, vehicle and preferred time.",
};
export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const sp = await searchParams;
  const packages = (await activePackages()).map(({ id, name, base_price, tagline, features }) => ({ id, name, base_price, tagline, features }));
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const zip = one(sp.zip);
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky to-white pb-24 pt-28 sm:pt-32">
      <div className="container-x">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <span className="eyebrow">Book your detail</span>
          <h1 className="h2 mt-4">Let&apos;s get your car sparkling</h1>
          <p className="lead mt-3">A few quick steps. No payment needed to request — we confirm first.</p>
        </div>
        <BookingWizard packages={packages} initialPackage={one(sp.package)} initialZip={zip && /^\d{5}$/.test(zip) ? zip : undefined} />
      </div>
    </div>
  );
}
