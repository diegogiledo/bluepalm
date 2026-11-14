import { StateForm, Submit } from "@/components/portal-forms";
import type { PricingRules } from "@/lib/quote";
import { runBoostNow, savePricingRules } from "../../actions";

/** Admin editor for vehicle-size fees, add-ons and the payout boost. */
export function PricingRulesForm({ rules, commission }: { rules: PricingRules; commission: number }) {
  const n = "input mt-1 w-24 py-2";
  return (
    <StateForm action={savePricingRules} className="card space-y-8 p-6">
      <section>
        <h2 className="font-display text-lg font-bold">Vehicle size</h2>
        <p className="text-xs text-ink-muted">Added to every service. Customers see these on the size cards and in the service prices.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {(["small", "medium", "large"] as const).map((k) => (
            <label key={k} className="text-sm font-semibold capitalize">{k} (+$)<input name={`size_${k}`} type="number" min="0" max="1000" defaultValue={rules.sizeFees[k]} className={n} /></label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Add-ons</h2>
        <p className="text-xs text-ink-muted">Optional extras customers can pick at booking. Their price goes to the detailer the same way as the service (less your commission).</p>
        <div className="mt-3 space-y-2">
          {rules.addons.map((a) => (
            <div key={a.id} className="grid items-end gap-2 rounded-2xl p-3 ring-1 ring-navy/10 sm:grid-cols-[1.2fr_90px_2fr_auto_auto]">
              <label className="text-xs font-semibold">Name<input name={`addon_${a.id}_label`} defaultValue={a.label} className="input mt-1 py-2" /></label>
              <label className="text-xs font-semibold">Price ($)<input name={`addon_${a.id}_price`} type="number" min="0" max="1000" defaultValue={a.price} className="input mt-1 py-2" /></label>
              <label className="text-xs font-semibold">Short description<input name={`addon_${a.id}_hint`} defaultValue={a.hint} className="input mt-1 py-2" /></label>
              <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold"><input type="checkbox" name={`addon_${a.id}_active`} defaultChecked={a.active} className="accent-brand" /> Offered</label>
              <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-red-600"><input type="checkbox" name={`addon_${a.id}_remove`} className="accent-red-600" /> Remove</label>
            </div>
          ))}
          <div className="grid items-end gap-2 rounded-2xl border border-dashed border-navy/20 p-3 sm:grid-cols-[1.2fr_90px_2fr]">
            <label className="text-xs font-semibold">New add-on<input name="addon_new_label" placeholder="e.g. Ceramic spray sealant" className="input mt-1 py-2" /></label>
            <label className="text-xs font-semibold">Price ($)<input name="addon_new_price" type="number" min="0" max="1000" className="input mt-1 py-2" /></label>
            <label className="text-xs font-semibold">Short description<input name="addon_new_hint" className="input mt-1 py-2" /></label>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Payout boost</h2>
        <p className="text-xs text-ink-muted">If no detailer accepts a job in time, BluePalm takes a smaller cut so the detailer earns more, and the job is emailed again. Your default commission is {(commission * 100).toFixed(0)}%.</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="boost_enabled" defaultChecked={rules.boost.enabled} className="accent-brand" /> On</label>
          <label className="text-sm font-semibold">After (hours)<input name="boost_after" type="number" min="1" max="48" defaultValue={rules.boost.afterHours} className={n} /></label>
          <label className="text-sm font-semibold">Lower commission by (points)<input name="boost_step" type="number" min="1" max="20" defaultValue={rules.boost.step} className={n} /></label>
          <label className="text-sm font-semibold">Up to (times)<input name="boost_max" type="number" min="1" max="5" defaultValue={rules.boost.maxBoosts} className={n} /></label>
          <label className="text-sm font-semibold">Never below (%)<input name="boost_min" type="number" min="0" max="50" defaultValue={rules.boost.minCommission} className={n} /></label>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Example with these settings: a $149 job pays the detailer ${(149 * (1 - commission)).toFixed(2)}; after {rules.boost.afterHours} h with no taker it pays ${(149 * (1 - Math.max(commission - rules.boost.step / 100, rules.boost.minCommission / 100))).toFixed(2)}.</p>
      </section>
      <Submit className="btn-primary btn-sm">Save pricing</Submit>
    </StateForm>
  );
}

/** Admin: run the hourly boost check right away. */
export function RunBoostNow() {
  return (
    <StateForm action={runBoostNow} className="flex flex-wrap items-center gap-3">
      <Submit className="btn-ghost btn-sm" pending="Checking…">Run payout boost check now</Submit>
      <span className="text-xs text-ink-muted">Runs automatically every hour on the live site.</span>
    </StateForm>
  );
}
