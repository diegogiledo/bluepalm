import { requireStaff } from "@/lib/auth";
import { db, getSetting } from "@/lib/db";
import { Submit } from "@/components/portal-forms";
import { saveCommission, savePackage } from "../../actions";
import { pricingRules } from "@/lib/pricing-rules";
import { PricingRulesForm, RunBoostNow } from "./pricing-rules-form";

export default async function Settings() {
  await requireStaff(["admin"]);
  const packages = (await db.select("packages")).sort((a, b) => a.sort - b.sort);
  const rate = await getSetting("commission_rate", 0.2);
  const pts = await getSetting("loyalty_points_per_dollar", 1);
  const rules = await pricingRules();
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-extrabold">Pricing & commission</h1>
      <form action={saveCommission} className="card flex flex-wrap items-end gap-4 p-6">
        <label className="text-sm font-semibold">Default platform commission (%)<input name="commission_rate" type="number" min="0" max="60" step="0.5" defaultValue={(rate * 100).toString()} className="input mt-1 w-32 py-2" /></label>
        <label className="text-sm font-semibold">Loyalty points per $1<input name="loyalty_points_per_dollar" type="number" min="0" max="10" step="0.5" defaultValue={pts} className="input mt-1 w-32 py-2" /></label>
        <Submit className="btn-primary btn-sm">Save</Submit>
        <p className="w-full text-xs text-ink-muted">Commission is locked onto each booking when a detailer is assigned. Per-detailer overrides are set on the Detailers page.</p>
      </form>
      <PricingRulesForm rules={rules} commission={rate} />
      <RunBoostNow />
      <h2 className="font-display text-xl font-extrabold">Services</h2>
      <div className="grid gap-6 xl:grid-cols-3">
        {packages.map((p) => (
          <form key={p.id} action={savePackage} className="card space-y-3 p-6">
            <input type="hidden" name="id" value={p.id} />
            <label className="block text-sm font-semibold">Name<input name="name" defaultValue={p.name} className="input mt-1 py-2" /></label>
            <label className="block text-sm font-semibold">Base price, small vehicle ($)<input name="base_price" type="number" min="1" defaultValue={p.base_price} className="input mt-1 py-2" /></label>
            <label className="block text-sm font-semibold">Tagline<input name="tagline" defaultValue={p.tagline} className="input mt-1 py-2" /></label>
            <label className="block text-sm font-semibold">Duration hint<input name="duration_hint" defaultValue={p.duration_hint} className="input mt-1 py-2" /></label>
            <label className="block text-sm font-semibold">Features (one per line)<textarea name="features" defaultValue={p.features.join("\n")} className="input mt-1 min-h-32 py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-brand" /> Offered on the website</label>
            <Submit className="btn-primary btn-sm">Save {p.name}</Submit>
          </form>
        ))}
      </div>
    </div>
  );
}
