"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useAdminTheme } from "./theme-toggle";

export type MapPartner = {
  id: string; name: string; city: string; lat: number; lon: number; radius_miles: number;
  logo_url: string | null; sent: number; won: number;
  owner: string | null; phone: string | null; email: string | null; website: string | null; counties: string[];
};

/**
 * Detailers coverage map.
 *  - Base: Esri World Light Gray Canvas (minimal, no API key), labels on top.
 *  - Coverage: a grid of ~3-mile hexagons, each shaded by how many detailers
 *    travel to its centre (distance from their base <= their stated radius).
 *  - Businesses: their logos; crowded areas collapse into numbered pins that
 *    spread out as you zoom in. Hover a logo for details and its travel ring.
 */
const BLUE = "#1264D6";
const MI_LAT = 69.0;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const LEGEND_DARK = "linear-gradient(90deg,rgba(59,130,246,.1),rgba(59,130,246,.35))";
const LEGEND = "linear-gradient(90deg,rgba(29,78,216,.08),rgba(29,78,216,.35))";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const initials = (n: string) => n.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "").join("").toUpperCase();
const covers = (p: MapPartner, lat: number, lon: number) => {
  const dy = (lat - p.lat) * MI_LAT, dx = (lon - p.lon) * MI_LAT * Math.cos((lat * Math.PI) / 180);
  return dx * dx + dy * dy <= p.radius_miles * p.radius_miles;
};

const CSS = `
.bp-pin span{display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:#fff;border:2px solid ${BLUE};box-shadow:0 2px 6px rgba(11,35,66,.25);overflow:hidden;font:800 11px/1 Arial,sans-serif;color:${BLUE};box-sizing:border-box;transition:transform .15s}
.bp-pin img{width:100%!important;height:100%!important;max-width:none!important;object-fit:contain;padding:3px;background:#fff;box-sizing:border-box}
.bp-pin:hover span{transform:scale(1.2);border-color:#0B2342}
.bp-cluster span{display:grid;place-items:center;width:40px;height:40px;border-radius:999px;font:800 14px/1 Arial,sans-serif;color:#fff;border:3px solid #fff;background:${BLUE};box-shadow:0 2px 8px rgba(11,35,66,.35);transition:transform .15s}
.bp-cluster:hover span{transform:scale(1.1)}
.leaflet-tooltip.bp-tip{padding:0;border:0;border-radius:14px;box-shadow:0 8px 24px rgba(11,35,66,.25)}
.leaflet-tooltip.bp-hex{padding:4px 8px;border:0;border-radius:8px;font:700 12px/1.3 Arial,sans-serif;color:#0B2342;box-shadow:0 4px 12px rgba(11,35,66,.2)}
.bp-card{padding:12px 14px;min-width:200px;max-width:260px;font:13px/1.45 Arial,sans-serif;color:#0B2342;white-space:normal}
.bp-card b{font-size:14px;display:block;margin-bottom:2px}
.bp-muted{color:#5b6b80}.bp-warn{color:#b45309;font-weight:700}
.bp-stats{margin-top:6px;padding-top:6px;border-top:1px solid #e5edf7;color:#5b6b80;font-weight:700}`;

function card(p: MapPartner) {
  return `<div class="bp-card">
    <b>${esc(p.name)}</b>
    ${p.owner ? `<div>Owner: ${esc(p.owner)}</div>` : ""}
    <div>${esc(p.city || "City unknown")} · travels ${p.radius_miles} mi</div>
    <div class="bp-muted">${esc(p.counties.map((c) => c.replace(/ County$/, "")).join(", "))}</div>
    ${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
    ${p.email ? `<div>${esc(p.email)}</div>` : `<div class="bp-warn">No email: can't get jobs</div>`}
    ${p.website ? `<div class="bp-muted">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</div>` : ""}
    <div class="bp-stats">${p.sent} job emails · ${p.won} won</div>
  </div>`;
}

export function CoverageMap({ partners }: { partners: MapPartner[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0);
  const dark = useAdminTheme() === "dark";

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L; // the grouping plugin attaches itself to window.L
      await import("leaflet.markercluster");
      if (cancelled || !box.current || !partners.length) return;
      map = L.map(box.current, { scrollWheelZoom: false, zoomSnap: 0.25 }).setView([27.55, -82.5], 9);
      const base = dark ? "World_Dark_Gray" : "World_Light_Gray";
      L.tileLayer(`${ESRI}/${base}_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
      }).addTo(map);
      // city and road names above the hexagons so they stay readable
      map.createPane("labels");
      map.getPane("labels")!.style.zIndex = "450";
      map.getPane("labels")!.style.pointerEvents = "none";
      L.tileLayer(`${ESRI}/${base}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: "labels" }).addTo(map);

      // ---- hexagon coverage grid ----
      const lats = partners.map((p) => p.lat), lons = partners.map((p) => p.lon);
      const reach = Math.max(...partners.map((p) => p.radius_miles)) / 55 + 0.1; // far enough for the widest radius
      const S = Math.min(...lats) - reach, N = Math.max(...lats) + reach, W = Math.min(...lons) - reach, E = Math.max(...lons) + reach;
      const r = 0.028, kx = 1 / Math.cos((((S + N) / 2) * Math.PI) / 180); // hex "radius" in degrees, ~3 miles across
      const cells: { lat: number; lon: number; n: number }[] = [];
      let top = 1;
      for (let row = 0, lat = S; lat < N; row++, lat += r * 1.5) {
        for (let lon = W + (row % 2 ? (r * Math.sqrt(3) * kx) / 2 : 0); lon < E; lon += r * Math.sqrt(3) * kx) {
          const n = partners.reduce((s, p) => s + (covers(p, lat, lon) ? 1 : 0), 0);
          if (n) { cells.push({ lat, lon, n }); top = Math.max(top, n); }
        }
      }
      // hexagons get their own pane, blended into the map (multiply on light, screen on dark)
      // so water, roads and towns underneath stay readable
      map.createPane("coverage");
      const cov = map.getPane("coverage")!;
      cov.style.zIndex = "410";
      cov.style.mixBlendMode = dark ? "screen" : "multiply";
      const hexes = L.layerGroup();
      for (const c of cells) {
        const pts: [number, number][] = [];
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; pts.push([c.lat + r * Math.sin(a), c.lon + r * kx * Math.cos(a)]); }
        // see-through: one hue, more detailers = more opaque, so roads, water and towns stay visible
        const t = Math.sqrt(c.n / top);
        L.polygon(pts, { pane: "coverage", stroke: true, color: dark ? "#60a5fa" : "#1d4ed8", weight: 0.6, opacity: 0.06 + 0.2 * t,
          fillColor: dark ? "#3b82f6" : "#1d4ed8", fillOpacity: 0.05 + 0.3 * t })
          .bindTooltip(`${c.n} detailer${c.n > 1 ? "s" : ""} travel here`, { sticky: true, direction: "top", className: "bp-hex" })
          .addTo(hexes);
      }
      hexes.addTo(map);
      setMax(top);

      // ---- business logos, grouped when crowded ----
      // businesses placed at the same city centre are fanned out slightly so they separate when zoomed in
      const seen = new Map<string, number>();
      const shown = partners.map((p) => {
        const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`, n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        if (!n) return p;
        const a = n * 2.4, d = 0.006 * Math.sqrt(n);
        return { ...p, lat: p.lat + d * Math.sin(a), lon: p.lon + d * Math.cos(a) };
      });
      let ring: import("leaflet").Circle | null = null;
      const group = L.markerClusterGroup({
        maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 13,
        iconCreateFunction: (c) => L.divIcon({ className: "bp-cluster", html: `<span>${c.getChildCount()}</span>`, iconSize: [40, 40], iconAnchor: [20, 20] }),
      });
      for (const p of shown) {
        const ini = esc(initials(p.name));
        const logo = p.logo_url ? `<img src="${esc(p.logo_url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${ini}'">` : ini;
        const marker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "bp-pin", html: `<span>${logo}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }), riseOnHover: true, title: p.name });
        marker.on("mouseover", () => {
          ring?.remove();
          ring = L.circle([p.lat, p.lon], { radius: p.radius_miles * 1609.34, color: dark ? "#e3e9f3" : "#0B2342", weight: 2, dashArray: "6 6", fillColor: dark ? "#e3e9f3" : "#0B2342", fillOpacity: 0.05, interactive: false }).addTo(map!);
          // open the card toward the side of the map with more room
          const below = map!.latLngToContainerPoint(marker.getLatLng()).y < map!.getSize().y / 2;
          marker.unbindTooltip().bindTooltip(card(p), { direction: below ? "bottom" : "top", offset: [0, below ? 18 : -18], opacity: 1, className: "bp-tip" }).openTooltip();
        });
        marker.on("mouseout", () => { marker.closeTooltip(); ring?.remove(); ring = null; });
        group.addLayer(marker);
      }
      map.addLayer(group);
      map.fitBounds(L.latLngBounds(partners.map((p) => [p.lat, p.lon] as [number, number])).pad(0.04));
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [partners, dark]);

  return (
    <div>
      <style>{CSS}</style>
      <div ref={box} className="relative z-0 h-[520px] w-full overflow-hidden rounded-2xl ring-1 ring-navy/10" aria-label="Map of detailer coverage areas" />
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
        <span className="flex items-center gap-2">Detailers reaching an area
          <span className="h-2.5 w-32 rounded-full" style={{ background: dark ? LEGEND_DARK : LEGEND }} /> 1 → {max || "many"}</span>
        <span className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">5</span> group of nearby businesses (zoom in to spread out)</span>
        <span className="flex items-center gap-2"><span className="inline-block size-4 rounded-full border-2 border-dashed border-navy" /> hover a logo to see how far it travels</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{partners.length} detailers on the map. Each hexagon is about 3 miles across; hover one to see how many detailers reach it. Travel radius is what each business states, or 15 miles when it doesn&apos;t say.</p>
    </div>
  );
}
