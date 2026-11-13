"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type MapPartner = {
  id: string; name: string; city: string; lat: number; lon: number; radius_miles: number;
  status: "new" | "invited" | "opted_in" | "unsubscribed"; logo_url: string | null; sent: number; won: number;
};

const COLOR = { opted_in: "#16a34a", invited: "#f59e0b", new: "#1264D6", unsubscribed: "#94a3b8" } as const;
const LABEL = { opted_in: "Getting jobs", invited: "Invited", new: "Not invited", unsubscribed: "Unsubscribed" } as const;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Coverage map: each detailer is a translucent circle the size of the area
 * they travel to, so places many detailers cover show up darker (a heat map).
 * Map tiles: OpenStreetMap (free, attribution shown).
 */
export function CoverageMap({ partners }: { partners: MapPartner[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState<Record<MapPartner["status"], boolean>>({ opted_in: true, invited: true, new: true, unsubscribed: false });

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false }).setView([27.55, -82.5], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      // Detailers placed at the same city centre are fanned out ~1 km so each dot is clickable.
      const seen = new Map<string, number>();
      const shown = partners.filter((p) => show[p.status]).map((p) => {
        const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        if (!n) return p;
        const a = n * 2.4, r = 0.009 * Math.sqrt(n);
        return { ...p, lat: p.lat + r * Math.sin(a), lon: p.lon + r * Math.cos(a) };
      });
      for (const p of shown) {
        L.circle([p.lat, p.lon], { radius: p.radius_miles * 1609.34, color: COLOR[p.status], weight: 1, opacity: 0.5, fillColor: COLOR[p.status], fillOpacity: 0.09 }).addTo(map);
      }
      for (const p of shown) {
        const logo = p.logo_url ? `<img src="${esc(p.logo_url)}" referrerpolicy="no-referrer" style="max-height:36px;max-width:120px;display:block;margin-bottom:6px" onerror="this.remove()">` : "";
        L.circleMarker([p.lat, p.lon], { radius: 6, color: "#fff", weight: 2, fillColor: COLOR[p.status], fillOpacity: 1 })
          .bindPopup(`${logo}<b>${esc(p.name)}</b><br>${esc(p.city)} · ${p.radius_miles} mi radius<br>${LABEL[p.status]} · ${p.sent} job emails · ${p.won} won`)
          .addTo(map);
      }
      if (shown.length) map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lon] as [number, number])).pad(0.25));
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [partners, show]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        {(Object.keys(COLOR) as MapPartner["status"][]).map((s) => (
          <label key={s} className="flex items-center gap-2">
            <input type="checkbox" checked={show[s]} onChange={(e) => setShow({ ...show, [s]: e.target.checked })} />
            <span className="inline-block size-3 rounded-full" style={{ background: COLOR[s] }} />
            {LABEL[s]} ({partners.filter((p) => p.status === s).length})
          </label>
        ))}
      </div>
      <div ref={box} className="relative z-0 h-[460px] w-full overflow-hidden rounded-2xl ring-1 ring-navy/10" aria-label="Map of detailer coverage areas" />
      <p className="mt-2 text-xs text-ink-muted">Each circle is the area a detailer travels to (their stated radius, or 15 miles when they don&apos;t say). Darker areas are covered by more detailers. Click a dot for details.</p>
    </div>
  );
}
