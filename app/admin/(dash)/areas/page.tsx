import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Submit } from "@/components/portal-forms";
import { saveZip } from "../../actions";
import { COUNTY_NAMES } from "@/lib/validation";

export default async function Areas() {
  await requireStaff(["admin"]);
  const zips = (await db.select("service_zips")).sort((a, b) => a.county.localeCompare(b.county) || a.city.localeCompare(b.city) || a.zip.localeCompare(b.zip));
  const counties = [...new Set(zips.map((z) => z.county))];
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-extrabold">Service areas</h1>
        <p className="text-ink-muted">The public ZIP checker and booking form only accept ZIP codes enabled here. {zips.filter((z) => z.enabled).length} of {zips.length} enabled.</p></div>
      <form action={saveZip} className="card flex flex-wrap items-end gap-3 p-5">
        <input type="hidden" name="action" value="add" />
        <label className="text-sm font-semibold">ZIP<input name="zip" required pattern="\d{5}" maxLength={5} className="input mt-1 w-28 py-2" /></label>
        <label className="text-sm font-semibold">City / community<input name="city" required className="input mt-1 py-2" /></label>
        <label className="text-sm font-semibold">County<select name="county" className="input mt-1 py-2">{COUNTY_NAMES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="enabled" defaultChecked className="accent-brand" /> Enabled</label>
        <Submit className="btn-primary btn-sm">Add ZIP</Submit>
      </form>
      {counties.map((county) => (
        <section key={county} className="card p-5">
          <h2 className="font-display text-lg font-bold">{county}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {zips.filter((z) => z.county === county).map((z) => (
              <li key={z.zip} className={`flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm ring-1 ${z.enabled ? "bg-palm/10 ring-palm/30" : "bg-navy/5 text-navy/50 ring-navy/10"}`}>
                <span><b>{z.zip}</b> {z.city}</span>
                <form action={saveZip}><input type="hidden" name="zip" value={z.zip} /><input type="hidden" name="action" value="toggle" />
                  <button className="rounded-full px-2 py-0.5 text-xs font-semibold hover:bg-white" title={z.enabled ? "Disable" : "Enable"}>{z.enabled ? "On" : "Off"}</button></form>
                <form action={saveZip}><input type="hidden" name="zip" value={z.zip} /><input type="hidden" name="action" value="delete" />
                  <button className="rounded-full px-2 py-0.5 text-xs text-red-600 hover:bg-white" aria-label={`Remove ${z.zip}`}>×</button></form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
