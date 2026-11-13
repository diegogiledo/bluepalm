import type { StyleSpecification } from "maplibre-gl";

/**
 * The soft, app-like map style used on the booking form and in admin:
 * pale land, light-blue water, gentle green parks, white roads, muted labels,
 * no boundary lines. Free OpenFreeMap vector tiles (OpenStreetMap data), no key.
 * A dark variant (same layers, night colours) is used by the admin dark theme.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const MAP_WORKER_URL = "/vendor/maplibre-gl-worker.mjs"; // copied to /public on install

const PALETTES = {
  light: { land: "#f4f2ed", residential: "#efece5", building: "#e7e3db", park: "#d9eed0", wood: "#dcefd4", water: "#c4e2f6", roadCasing: "#e4e0d8", road: "#ffffff", motorway: "#fdf6e3", label: "#7d8795", halo: "#ffffff" },
  dark: { land: "#151c28", residential: "#18202d", building: "#1e2735", park: "#17291f", wood: "#182a21", water: "#0f2a44", roadCasing: "#151c28", road: "#2a3546", motorway: "#3a3a2c", label: "#8d98a8", halo: "#151c28" },
};
export type MapTone = keyof typeof PALETTES;

let base: Promise<StyleSpecification> | null = null;
const cache: Partial<Record<MapTone, Promise<StyleSpecification>>> = {};

/** The base style recoloured to the soft palette (fetched once per page). */
export function softStyle(tone: MapTone = "light"): Promise<StyleSpecification> {
  base ??= fetch(STYLE_URL).then((r) => r.json());
  cache[tone] ??= base.then((orig) => {
    const s: StyleSpecification = structuredClone(orig);
    const C = PALETTES[tone];
    s.layers = s.layers.filter((l) => !("source-layer" in l && l["source-layer"] === "boundary")).map((l) => {
      const layer = l as typeof l & { paint?: Record<string, unknown> };
      const src = "source-layer" in l ? l["source-layer"] : "";
      const p = (layer.paint ??= {});
      if (l.type === "background") p["background-color"] = C.land;
      else if (src === "water" && l.type === "fill") { p["fill-color"] = C.water; p["fill-outline-color"] = C.water; }
      else if (src === "waterway" && l.type === "line") p["line-color"] = C.water;
      else if (src === "park") { p["fill-color"] = C.park; p["fill-opacity"] = 1; }
      else if (src === "landcover") p["fill-color"] = C.wood;
      else if (src === "landuse") p["fill-color"] = C.residential;
      else if (src === "building") { p["fill-color"] = C.building; p["fill-outline-color"] = C.building; }
      else if (src === "transportation" && l.type === "line") p["line-color"] = /casing/.test(l.id) ? C.roadCasing : /motorway|trunk/.test(l.id) ? C.motorway : C.road;
      else if (l.type === "symbol") { p["text-color"] = C.label; p["text-halo-color"] = C.halo; p["text-halo-width"] = 1.4; }
      return layer;
    });
    return s;
  });
  return cache[tone]!;
}

/** Shared map control styling (round zoom buttons, compact credits). */
export const SOFT_MAP_CSS = `
.bp-soft .maplibregl-ctrl-group{border-radius:999px;box-shadow:0 4px 14px rgba(11,35,66,.14);overflow:hidden;border:0}
.bp-soft .maplibregl-ctrl-group button{width:32px;height:32px}
.bp-soft .maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,.75);border-radius:999px 0 0 0}`;
