"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

export type MapPartner = {
  id: string; name: string; city: string; lat: number; lon: number; radius_miles: number;
  logo_url: string | null; sent: number; won: number;
  owner: string | null; phone: string | null; email: string | null; website: string | null; counties: string[];
};

const BLUE = "#1264D6";
const initials = (n: string) => n.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "").join("").toUpperCase();
const CSS = `
.bp-logo-pin span{display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:#fff;border:2px solid ${BLUE};box-shadow:0 2px 6px rgba(11,35,66,.3);overflow:hidden;font:800 12px/1 Arial,sans-serif;color:${BLUE}}
.bp-logo-pin img{width:34px!important;height:34px!important;max-width:34px!important;object-fit:contain;padding:3px;background:#fff;box-sizing:border-box}
.bp-cluster span{display:grid;place-items:center;width:42px;height:42px;border-radius:999px;background:${BLUE};color:#fff;font:800 15px/1 Arial,sans-serif;border:3px solid #fff;box-shadow:0 0 0 4px rgba(18,100,214,.25),0 2px 8px rgba(11,35,66,.35)}
.bp-cluster:hover span{transform:scale(1.1)}
.bp-logo-pin:hover span{border-color:#0B2342;transform:scale(1.15)}
.leaflet-tooltip.bp-tip{padding:0;border:0;border-radius:14px;box-shadow:0 8px 24px rgba(11,35,66,.25)}
.bp-card{padding:12px 14px;min-width:200px;max-width:260px;font:13px/1.45 Arial,sans-serif;color:#0B2342;white-space:normal}
.bp-card img{max-height:40px;max-width:140px;display:block;margin-bottom:6px}
.bp-card b{font-size:14px;display:block;margin-bottom:2px}
.bp-muted{color:#5b6b80}.bp-warn{color:#b45309;font-weight:700}
.bp-stats{margin-top:6px;padding-top:6px;border-top:1px solid #e5edf7;color:#5b6b80;font-weight:700}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Coverage map: each detailer is a translucent circle the size of the area
 * they travel to, so places many detailers cover show up darker (a heat map).
 * Map tiles: OpenStreetMap (free, attribution shown).
 */
export function CoverageMap({ partners }: { partners: MapPartner[] }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L; // the grouping plugin attaches itself to window.L
      await import("leaflet.markercluster");
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false }).setView([27.55, -82.5], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      // Detailers placed at the same city centre are fanned out slightly so they separate when zoomed in.
      const seen = new Map<string, number>();
      const shown = partners.map((p) => {
        const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        if (!n) return p;
        const a = n * 2.4, r = 0.006 * Math.sqrt(n);
        return { ...p, lat: p.lat + r * Math.sin(a), lon: p.lon + r * Math.cos(a) };
      });
      for (const p of shown) {
        L.circle([p.lat, p.lon], { radius: p.radius_miles * 1609.34, color: BLUE, weight: 1, opacity: 0.45, fillColor: BLUE, fillOpacity: 0.08 }).addTo(map);
      }
      // Crowded areas become one pin with a count; zoom in (or click it) and the logos spread out.
      const group = L.markerClusterGroup({
        maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 13,
        iconCreateFunction: (c) => L.divIcon({ className: "bp-cluster", html: `<span>${c.getChildCount()}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] }),
      });
      for (const p of shown) {
        const ini = esc(initials(p.name));
        const logo = p.logo_url
          ? `<img src="${esc(p.logo_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${ini}'">`
          : ini;
        const icon = L.divIcon({ className: "bp-logo-pin", html: `<span>${logo}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] });
        const card = `<div class="bp-card">
          ${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
          <b>${esc(p.name)}</b>
          ${p.owner ? `<div>Owner: ${esc(p.owner)}</div>` : ""}
          <div>${esc(p.city || "City unknown")} · travels ${p.radius_miles} mi</div>
          <div>${esc(p.counties.join(", "))}</div>
          ${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
          ${p.email ? `<div>${esc(p.email)}</div>` : `<div class="bp-warn">No email: can't get jobs</div>`}
          ${p.website ? `<div class="bp-muted">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</div>` : ""}
          <div class="bp-stats">${p.sent} job emails · ${p.won} won</div>
        </div>`;
        const marker = L.marker([p.lat, p.lon], { icon, riseOnHover: true, title: p.name });
        // open the card above the logo, or below it when the logo is near the top of the map
        marker.on("mouseover", () => {
          const below = map!.latLngToContainerPoint(marker.getLatLng()).y < 250;
          marker.unbindTooltip().bindTooltip(card, { direction: below ? "bottom" : "top", offset: [0, below ? 20 : -20], opacity: 1, className: "bp-tip" }).openTooltip();
        });
        marker.on("mouseout", () => marker.closeTooltip());
        group.addLayer(marker);
      }
      map.addLayer(group);
      if (shown.length) map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lon] as [number, number])).pad(0.25));
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [partners]);

  return (
    <div>
      <style>{CSS}</style>
      <div ref={box} className="relative z-0 h-[460px] w-full overflow-hidden rounded-2xl ring-1 ring-navy/10" aria-label="Map of detailer coverage areas" />
      <p className="mt-2 text-xs text-ink-muted">{partners.length} detailers. Each circle is the area a detailer travels to (their stated radius, or 15 miles when they don&apos;t say). Darker areas are covered by more detailers. Numbered pins group nearby businesses: zoom in or click one to spread them out, then hover a logo for details.</p>
    </div>
  );
}
