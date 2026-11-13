"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, Marker, Popup } from "maplibre-gl";
import { MAP_WORKER_URL, SOFT_MAP_CSS, softStyle } from "@/lib/soft-map";
import { useAdminTheme } from "./theme-toggle";

export type MapPartner = {
  id: string; name: string; city: string; lat: number; lon: number; radius_miles: number;
  logo_url: string | null; sent: number; won: number;
  owner: string | null; phone: string | null; email: string | null; website: string | null; counties: string[];
};

/**
 * Detailers map on the same soft style as the booking form.
 *  - every business is a round logo pin; crowded areas become count bubbles
 *    that split apart as you zoom in (click one to zoom)
 *  - hover a logo: details card + a soft ring showing how far it travels
 *  - "Show coverage": an optional soft glow where more detailers reach
 */
const MI_LAT = 69.0;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const initials = (n: string) => n.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "").join("").toUpperCase();
const covers = (p: MapPartner, lat: number, lon: number) => {
  const dy = (lat - p.lat) * MI_LAT, dx = (lon - p.lon) * MI_LAT * Math.cos((lat * Math.PI) / 180);
  return dx * dx + dy * dy <= p.radius_miles * p.radius_miles;
};
function ring(lon: number, lat: number, miles: number) {
  const m = miles * 1609.34, pts: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    pts.push([lon + (m / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (m / 110540) * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}
const EMPTY = { type: "FeatureCollection" as const, features: [] };

const CSS = `
.bp-dpin{width:40px;height:40px;border-radius:50%;background:#fff;border:3px solid #fff;box-shadow:0 6px 16px -4px rgba(11,35,66,.45),0 0 0 1.5px rgba(18,100,214,.55);overflow:hidden;display:grid;place-items:center;font:800 12px/1 Arial,sans-serif;color:#1264d6;cursor:pointer;transition:transform .15s,box-shadow .15s;box-sizing:border-box}
.bp-dpin img{width:100%;height:100%;object-fit:contain;padding:2px;background:#fff;box-sizing:border-box}
.bp-dpin:hover{transform:scale(1.18);box-shadow:0 10px 22px -6px rgba(11,35,66,.55),0 0 0 2px #1264d6}
.bp-dcl{width:44px;height:44px;border-radius:50%;background:linear-gradient(145deg,#2a86ff,#1264d6);border:3px solid #fff;color:#fff;font:800 14px/1 Arial,sans-serif;display:grid;place-items:center;box-shadow:0 8px 20px -6px rgba(18,100,214,.7),0 0 0 9px rgba(18,100,214,.14);cursor:pointer;box-sizing:border-box;transition:transform .15s}
.bp-dcl:hover{transform:scale(1.08)}
.bp-pop .maplibregl-popup-content{padding:0;border-radius:16px;box-shadow:0 12px 30px -8px rgba(11,35,66,.35)}
.bp-pop .maplibregl-popup-tip{display:none}
.bp-card{padding:12px 14px;min-width:200px;max-width:260px;font:13px/1.45 Arial,sans-serif;color:#0B2342}
.bp-card b{font-size:14px;display:block;margin-bottom:2px}
.bp-muted{color:#5b6b80}.bp-warn{color:#b45309;font-weight:700}
.bp-stats{margin-top:6px;padding-top:6px;border-top:1px solid #e5edf7;color:#5b6b80;font-weight:700}
html[data-admin-theme="dark"] .bp-pop .maplibregl-popup-content{background:#141d2c}
html[data-admin-theme="dark"] .bp-card{color:#e3e9f3}
html[data-admin-theme="dark"] .bp-stats{border-top-color:#2a3850;color:#9aa8bc}
html[data-admin-theme="dark"] .bp-dcl{border-color:#141d2c}
html[data-admin-theme="dark"] .bp-soft .maplibregl-ctrl-attrib{background:rgba(20,29,44,.8);color:#9aa8bc}
html[data-admin-theme="dark"] .bp-soft .maplibregl-ctrl-attrib a{color:#c7d2e3}
html[data-admin-theme="dark"] .bp-soft .maplibregl-ctrl-group{background:#1b2638}
html[data-admin-theme="dark"] .bp-soft .maplibregl-ctrl-icon{filter:invert(1)}`;

function card(p: MapPartner) {
  return `<div class="bp-card"><b>${esc(p.name)}</b>
    ${p.owner ? `<div>Owner: ${esc(p.owner)}</div>` : ""}
    <div>${esc(p.city || "City unknown")} · travels ${p.radius_miles} mi</div>
    <div class="bp-muted">${esc(p.counties.map((c) => c.replace(/ County$/, "")).join(", "))}</div>
    ${p.phone ? `<div>${esc(p.phone)}</div>` : ""}
    ${p.email ? `<div>${esc(p.email)}</div>` : `<div class="bp-warn">No email: can't get jobs</div>`}
    ${p.website ? `<div class="bp-muted">${esc(p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</div>` : ""}
    <div class="bp-stats">${p.sent} job emails · ${p.won} won</div></div>`;
}

export function CoverageMap({ partners }: { partners: MapPartner[] }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [coverage, setCoverage] = useState(false);
  const coverageRef = useRef(coverage);
  coverageRef.current = coverage;
  const dark = useAdminTheme() === "dark";

  useEffect(() => {
    if (!box.current || !partners.length) return;
    let cancelled = false;
    const markers = new Map<string, Marker>();
    (async () => {
      const [ml, style] = await Promise.all([import("maplibre-gl"), softStyle(dark ? "dark" : "light")]);
      if (cancelled || !box.current) return;
      ml.setWorkerUrl(MAP_WORKER_URL);
      const byId = new Map(partners.map((p) => [p.id, p]));
      const bounds = new ml.LngLatBounds();
      partners.forEach((p) => bounds.extend([p.lon, p.lat]));
      const map = new ml.Map({
        container: box.current, style, bounds, fitBoundsOptions: { padding: { top: 50, bottom: 70, left: 50, right: 60 } },
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, scrollZoom: false,
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      const popup: Popup = new ml.Popup({ closeButton: false, closeOnClick: false, className: "bp-pop", offset: 26, maxWidth: "280px" });
      map.on("error", (e) => console.warn("detailers map:", e.error?.message ?? e));

      map.on("load", () => {
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        // optional coverage glow: a grid of points weighted by how many detailers reach each one
        const lats = partners.map((p) => p.lat), lons = partners.map((p) => p.lon);
        const reach = Math.max(...partners.map((p) => p.radius_miles)) / 55 + 0.1, step = 0.03;
        const pts: { type: "Feature"; properties: { w: number }; geometry: { type: "Point"; coordinates: [number, number] } }[] = [];
        let top = 1;
        const raw: [number, number, number][] = [];
        for (let lat = Math.min(...lats) - reach; lat < Math.max(...lats) + reach; lat += step) {
          for (let lon = Math.min(...lons) - reach; lon < Math.max(...lons) + reach; lon += step) {
            const n = partners.reduce((s, p) => s + (covers(p, lat, lon) ? 1 : 0), 0);
            if (n) { top = Math.max(top, n); raw.push([lon, lat, n]); }
          }
        }
        for (const [lon, lat, n] of raw) pts.push({ type: "Feature", properties: { w: n / top }, geometry: { type: "Point", coordinates: [lon, lat] } });
        map.addSource("coverage", { type: "geojson", data: { type: "FeatureCollection", features: pts } });
        map.addLayer({
          id: "coverage", type: "heatmap", source: "coverage", layout: { visibility: coverageRef.current ? "visible" : "none" },
          paint: {
            "heatmap-weight": ["get", "w"], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 1.2],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 7, 18, 10, 40, 13, 90], "heatmap-opacity": 0.55,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(18,100,214,0)", 0.3, "rgba(42,134,255,0.35)", 0.7, "rgba(18,100,214,0.55)", 1, "rgba(11,60,160,0.7)"],
          },
        });
        // travel ring for the hovered business
        map.addSource("ring", { type: "geojson", data: EMPTY });
        map.addLayer({ id: "ring-fill", type: "fill", source: "ring", paint: { "fill-color": "#1264d6", "fill-opacity": 0.07 } });
        map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": dark ? "#7fb0ff" : "#1264d6", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
        // businesses, grouped when crowded (the pins themselves are HTML markers below)
        map.addSource("partners", {
          type: "geojson", cluster: true, clusterRadius: 46, clusterMaxZoom: 13,
          data: { type: "FeatureCollection", features: partners.map((p) => ({ type: "Feature" as const, properties: { pid: p.id }, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })) },
        });
        map.addLayer({ id: "partners-src", type: "circle", source: "partners", paint: { "circle-radius": 0, "circle-opacity": 0 } });

        // show a pin or a count bubble for whatever is on screen
        const sync = () => {
          const seen = new Set<string>();
          for (const f of map.querySourceFeatures("partners")) {
            const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; pid?: string };
            const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
            const key = props.cluster ? `c${props.cluster_id}` : `p${props.pid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (markers.has(key)) continue;
            const el = document.createElement("div");
            if (props.cluster) {
              el.className = "bp-dcl";
              el.textContent = String(props.point_count);
              el.title = `${props.point_count} businesses: click to zoom in`;
              el.addEventListener("click", async () => {
                const z = await (map.getSource("partners") as GeoJSONSource).getClusterExpansionZoom(props.cluster_id!);
                map.easeTo({ center: [lon, lat], zoom: z + 0.3, duration: 500 });
              });
            } else {
              const p = byId.get(props.pid!);
              if (!p) continue;
              el.className = "bp-dpin";
              el.textContent = initials(p.name);
              if (p.logo_url) {
                const img = document.createElement("img");
                img.alt = ""; img.referrerPolicy = "no-referrer"; img.src = p.logo_url;
                img.onerror = () => { el.textContent = initials(p.name); };
                el.replaceChildren(img);
              }
              el.addEventListener("mouseenter", () => {
                (map.getSource("ring") as GeoJSONSource).setData(ring(p.lon, p.lat, p.radius_miles));
                popup.setLngLat([p.lon, p.lat]).setHTML(card(p)).addTo(map);
              });
              el.addEventListener("mouseleave", () => { popup.remove(); (map.getSource("ring") as GeoJSONSource).setData(EMPTY); });
            }
            markers.set(key, new ml.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
          }
          for (const [k, m] of markers) if (!seen.has(k)) { m.remove(); markers.delete(k); }
        };
        // refresh once the map has settled (mid-zoom, tiles from the old zoom can report old groupings)
        map.on("idle", sync);
        map.on("zoomstart", () => { popup.remove(); });
      });
    })();
    return () => { cancelled = true; markers.forEach((m) => m.remove()); mapRef.current?.remove(); mapRef.current = null; };
  }, [partners, dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("coverage")) map.setLayoutProperty("coverage", "visibility", coverage ? "visible" : "none");
  }, [coverage]);

  return (
    <div>
      <style>{SOFT_MAP_CSS + CSS}</style>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">{partners.length} detailers. Click a numbered bubble to zoom in; hover a logo for details and how far it travels.</p>
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span id="cov-label">Show coverage</span>
          <button type="button" role="switch" aria-checked={coverage} aria-labelledby="cov-label" onClick={() => setCoverage(!coverage)}
            className={`relative h-5 w-9 rounded-full transition ${coverage ? "bg-brand" : "bg-navy/20"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${coverage ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </span>
      </div>
      <div className={`bp-soft relative h-[520px] w-full overflow-hidden rounded-[22px] shadow-[0_10px_30px_-14px_rgba(11,35,66,.35)] ring-1 ring-navy/10 ${dark ? "bg-[#151c28]" : "bg-[#f4f2ed]"}`}>
        <div className="absolute inset-0" aria-label="Map of local detailers"><div ref={box} className="h-full w-full" /></div>
      </div>
      {coverage && <p className="mt-2 text-xs text-ink-muted">Shaded areas are where detailers travel (their stated radius, or 15 miles when they don&apos;t say). Darker blue = more detailers reach it.</p>}
    </div>
  );
}
