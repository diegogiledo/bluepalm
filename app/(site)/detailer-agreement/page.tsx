import type { Metadata } from "next";

export const metadata: Metadata = { title: "Independent Contractor Agreement (Draft)", robots: { index: false } };

const SECTIONS: [string, string][] = [
  ["Independent contractor relationship", "You perform services as an independent contractor. You control how you perform the work, supply your own equipment and products, and are responsible for your own taxes, licenses and insurance. Nothing in this agreement creates an employment, partnership or joint-venture relationship."],
  ["Platform role", "BluePalm operates the marketplace: it markets services, accepts bookings, collects customer payments, coordinates scheduling and provides customer support. You may accept or decline any job offered through the platform."],
  ["Customer relationship & non-solicitation", "Customers introduced through BluePalm remain BluePalm customers. You agree to keep all communication, scheduling and payment for these customers on the BluePalm platform and not to solicit them for off-platform services during the agreement and for 12 months afterwards."],
  ["Customer privacy", "You receive only the customer information needed to complete a job. You may use it only for that job and must not copy, store or share it."],
  ["Payments & commission", "Customers pay BluePalm. After a job is completed, BluePalm pays you the job price minus the platform commission shown in your portal, via Stripe Connect."],
  ["Insurance", "You must maintain general liability insurance (and auto insurance for any vehicle used for work) and provide current proof before accepting jobs."],
  ["Quality standards", "You agree to follow BluePalm service checklists, arrive within the confirmed window and treat customers' vehicles and property with care. Repeated quality issues may result in removal from the platform."],
  ["Termination", "Either party may end this agreement at any time with written notice. Sections on customer relationship, privacy and payments survive termination."],
];

export default function Agreement() {
  return (
    <div className="container-x max-w-3xl pb-24 pt-32">
      <p className="mb-6 rounded-2xl bg-amber-100 p-4 text-sm font-semibold text-amber-900">Draft template for review. This summary is not legal advice — BluePalm must have a Florida attorney finalize the agreement before onboarding detailers.</p>
      <h1 className="h2">Independent Contractor Agreement</h1>
      <div className="mt-8 space-y-6">
        {SECTIONS.map(([t, d], i) => (<section key={t}><h2 className="font-display text-lg font-bold">{i + 1}. {t}</h2><p className="mt-2 leading-relaxed text-ink-muted">{d}</p></section>))}
      </div>
    </div>
  );
}
