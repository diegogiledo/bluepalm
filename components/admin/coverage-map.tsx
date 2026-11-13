"use client";
import { useEffect, useRef, useState } from "react";
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
.bp-logo-pin span{display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:#fff;border:2px solid ${BLUE};box-shadow:0 2px 6px rgba(11,35,66,.25);overflow:hidden;font:800 12px/1 Arial,sans-serif;color:${BLUE}}
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
 * Map tiles: Esri World Light Gray Canvas (minimal, no API key; attribution shown).
 */

/**
 * Coverage heat layer: a grid over the region where each cell is shaded by how
 * many detailers travel there (distance from their base <= their radius).
 * Drawn once to a small canvas and stretched over the map, which the browser
 * smooths into a soft gradient: one clean layer instead of 70+ overlapping circles.
 */
const MI_PER_DEG_LAT = 69.0;
function coverageImage(points: { lat: number; lon: number; radius_miles: number }[]) {
  const pad = 0.6;
  const south = Math.min(...points.map((p) => p.lat)) - pad, north = Math.max(...points.map((p) => p.lat)) + pad;
  const west = Math.min(...points.map((p) => p.lon)) - pad, east = Math.max(...points.map((p) => p.lon)) + pad;
  const step = 0.012; // ~1.3 km cells
  const w = Math.ceil((east - west) / step), h = Math.ceil((north - south) / step);
  const counts = new Uint16Array(w * h);
  let max = 1;
  for (let y = 0; y < h; y++) {
    const lat = north - (y + 0.5) * step;
    const miPerDegLon = MI_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    for (let x = 0; x < w; x++) {
      const lon = west + (x + 0.5) * step;
      let n = 0;
      for (const p of points) {
        const dy = (lat - p.lat) * MI_PER_DEG_LAT, dx = (lon - p.lon) * miPerDegLon;
        if (dx * dx + dy * dy <= p.radius_miles * p.radius_miles) n++;
      }
      counts[y * w + x] = n;
      if (n > max) max = n;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  // colour ramp: pale sky → brand blue → deep navy; empty cells stay transparent
  const ramp = [[147, 197, 253], [96, 165, 250], [37, 99, 235], [29, 78, 216]];
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i];
    if (!n) continue;
    const t = Math.sqrt(n / max) * (ramp.length - 1);
    const a = ramp[Math.floor(t)], b = ramp[Math.min(ramp.length - 1, Math.floor(t) + 1)], f = t - Math.floor(t);
    img.data.set([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 40 + 150 * (n / max)], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  // scale up with a blur so the edges are soft gradients, not pixel steps
  const S = 4, out = document.createElement("canvas");
  out.width = w * S; out.height = h * S;
  const o = out.getContext("2d")!;
  o.filter = "blur(10px)";
  o.imageSmoothingEnabled = true;
  o.drawImage(canvas, 0, 0, out.width, out.height);
  return { url: out.toDataURL(), bounds: [[south, west], [north, east]] as [[number, number], [number, number]], max };
}
export function CoverageMap({ partners }: { partners: MapPartner[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L; // the grouping plugin attaches itself to window.L
      await import("leaflet.markercluster");
      if (cancelled || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false }).setView([27.55, -82.5], 9);
      const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
      L.tileLayer(`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
      }).addTo(map);
      // city and road names drawn above the coverage shading so they stay readable
      map.createPane("labels");
      map.getPane("labels")!.style.zIndex = "450";
      map.getPane("labels")!.style.pointerEvents = "none";
      L.tileLayer(`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, pane: "labels" }).addTo(map);
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
      if (partners.length) {
        const heat = coverageImage(partners);
        L.imageOverlay(heat.url, heat.bounds, { opacity: 0.85, interactive: false, className: "bp-heat" }).addTo(map);
        setMax(heat.max);
      }
      // one detailer's travel area, drawn only while you hover their logo
      let ring: import("leaflet").Circle | null = null;
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
          <b>${esc(p.name)}</b>
          ${p.owner ? `<div>Owner: ${esc(p.owner)}</div>` : ""}
          <div>${esc(p.city || "City unknown")} · travels ${p.radius_miles} mi</div>
          <div class="bp-muted">${esc(p.counties.map((c) => c.replace(/ County$/, "")).join(", "))}</div>
          ${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
          ${p.email ? `<div>${esc(p.email)}</div>` : `<div class="bp-warn">No email: can't get jobs</div>`}
          ${p.website ? `<div class="bp-muted">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</div>` : ""}
          <div class="bp-stats">${p.sent} job emails · ${p.won} won</div>
        </div>`;
        const marker = L.marker([p.lat, p.lon], { icon, riseOnHover: true, title: p.name });
        // open the card above the logo, or below it when the logo is near the top of the map
        marker.on("mouseover", () => {
          ring?.remove();
          ring = L.circle([p.lat, p.lon], { radius: p.radius_miles * 1609.34, color: "#0B2342", weight: 2, dashArray: "6 6", fill: true, fillColor: "#0B2342", fillOpacity: 0.04, interactive: false }).addTo(map!);
          const below = map!.latLngToContainerPoint(marker.getLatLng()).y < map!.getSize().y / 2;
          marker.unbindTooltip().bindTooltip(card, { direction: below ? "bottom" : "top", offset: [0, below ? 20 : -20], opacity: 1, className: "bp-tip" }).openTooltip();
        });
        marker.on("mouseout", () => { marker.closeTooltip(); ring?.remove(); ring = null; });
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
      <div ref={box} className="relative z-0 h-[520px] w-full overflow-hidden rounded-2xl ring-1 ring-navy/10" aria-label="Map of detailer coverage areas" />
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
        <span className="flex items-center gap-2">
          <span>Detailers covering an area</span>
          <span className="h-2.5 w-32 rounded-full" style={{ background: "linear-gradient(90deg, rgba(147,197,253,.45), #60a5fa, #2563eb, #1d4ed8)" }} />
          <span>1</span><span>→</span><span>{max || "many"}</span>
        </span>
        <span className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">5</span> group of nearby businesses (zoom in to spread out)</span>
        <span className="flex items-center gap-2"><span className="inline-block size-4 rounded-full border-2 border-dashed border-navy" /> hover a logo to see how far it travels</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{partners.length} detailers on the map. Travel radius is what each business states, or 15 miles when it doesn&apos;t say.</p>
    </div>
  );
}
