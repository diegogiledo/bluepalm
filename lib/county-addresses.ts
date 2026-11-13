import "server-only";

/**
 * Official county address data for BluePalm's four service counties.
 *
 * Florida counties assign addresses to new homes when they're permitted and
 * publish them (for 911 dispatch and property records) as public ArcGIS map
 * services — free, no key. New subdivisions show up here long before the
 * Census or OpenStreetMap catch up.
 *
 *  - Hillsborough, Pinellas, Sarasota: individual address points.
 *  - Manatee: 911 street centerlines with house-number ranges, ZIP and city
 *    (the county doesn't publish full address points publicly).
 */
export type CountyAddress = { line1: string; city: string; zip: string; county: string; lat?: number; lon?: number };

type PointSource = { county: string; url: string; addr: string; zip: string; city: string };
const POINTS: PointSource[] = [
  { county: "Hillsborough", url: "https://maps.hillsboroughcounty.org/arcgis/rest/services/DSD_Viewer_Services/DSD_Viewer_Address_Points_Numbers_Only/FeatureServer/0", addr: "FULLADDR", zip: "ZIP", city: "POSTALCOMM" },
  { county: "Pinellas", url: "https://egis.pinellas.gov/gis/rest/services/AGO/Parcels/MapServer/2", addr: "FULLADDR", zip: "POSTCODE", city: "MAILINGCITY" },
  { county: "Sarasota", url: "https://ags3.scgov.net/agsfed/rest/services/ScpaServices/SCPAService/MapServer/0", addr: "Address", zip: "ZIP", city: "PostalComm" },
];
const MANATEE_STREETS = "https://www.mymanatee.org/gisbads/rest/services/streetnames/FeatureServer/0";
const TIMEOUT = 4500;

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);
const SUFFIX: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", DRIVE: "DR", ROAD: "RD", BOULEVARD: "BLVD", LANE: "LN", COURT: "CT", CIRCLE: "CIR", PLACE: "PL",
  TERRACE: "TER", TRAIL: "TRL", PARKWAY: "PKWY", HIGHWAY: "HWY", LOOP: "LOOP", WAY: "WAY", COVE: "CV", POINT: "PT", RUN: "RUN",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};
/** Uppercased, standard abbreviations — used to compare addresses from different sources. */
export const normAddr = (s: string) => s.toUpperCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] ?? w).join(" ");
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Ne|Nw|Se|Sw|Usf|Us)\b/g, (m) => m.toUpperCase());
const stripUnit = (s: string) => s.replace(/,?\s+(UNIT|APT|SUITE|STE|BLDG|#)\s*\S+.*$/i, "").trim();

async function arcgis(url: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ f: "json", ...params });
  const res = await fetch(`${url}/query?${qs}`, { signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const j = (await res.json()) as { features?: { attributes: Record<string, string | null>; geometry?: { x?: number; y?: number; paths?: number[][][] } }[]; error?: unknown };
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.features ?? [];
}
const settled = async <T>(ps: Promise<T[]>[]) => (await Promise.allSettled(ps)).flatMap((r) => (r.status === "fulfilled" ? r.value : []));

/** Parse "4202 e fowler ave tampa" → number + the main street word to search on. */
function parse(q: string) {
  const clean = q.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const m = clean.match(/^(\d{1,6})\s+(.+)$/);
  if (!m) return null;
  const words = m[2].split(" ");
  const main = words.find((w) => w.length >= 3 && !DIRS.has(w) && !SUFFIX[w]) ?? words.find((w) => w.length >= 2);
  return main ? { num: m[1], main, words } : null;
}
/** How many of the typed words appear in a result (street words, city…). */
const score = (words: string[], text: string) => { const t = ` ${normAddr(text)} `; return words.filter((w) => t.includes(` ${SUFFIX[w] ?? w} `) || t.includes(` ${SUFFIX[w] ?? w}`)).length; };

/** The point a fraction `t` (0–1) of the way along a polyline of [lon, lat] points. */
function alongPath(path: number[][] | undefined, t: number): [number, number] | null {
  if (!path?.length) return null;
  if (path.length === 1) return [path[0][0], path[0][1]];
  const seg = path.slice(1).map((pt, i) => Math.hypot(pt[0] - path[i][0], pt[1] - path[i][1]));
  let left = Math.max(0, Math.min(1, t)) * seg.reduce((s, x) => s + x, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, left / seg[i]) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    left -= seg[i];
  }
  return null;
}

export async function searchCounties(q: string): Promise<CountyAddress[]> {
  const p = parse(q);
  if (!p) return [];
  const points = POINTS.map(async (s) => {
    const rows = await arcgis(s.url, { where: `UPPER(${s.addr}) LIKE '${p.num} %${p.main}%'`, outFields: `${s.addr},${s.zip},${s.city}`, returnGeometry: "true", outSR: "4326", resultRecordCount: "40" });
    return rows.map((r) => ({ line1: title(stripUnit(r.attributes[s.addr] ?? "")), city: title(r.attributes[s.city] ?? ""), zip: (r.attributes[s.zip] ?? "").slice(0, 5), county: s.county, lat: r.geometry?.y, lon: r.geometry?.x }));
  });
  const manatee = (async () => {
    const n = Number(p.num);
    const rows = await arcgis(MANATEE_STREETS, {
      where: `UPPER(STREET_NAME) LIKE '%${p.main}%'`, returnGeometry: "true", outSR: "4326", resultRecordCount: "400",
      outFields: "STREET_NAME,FRADDL,TOADDL,FRADDR,TOADDR,ZIPL,ZIPR,POSTAL_COMM_L,POSTAL_COMM_R",
    });
    const out: CountyAddress[] = [];
    for (const { attributes: a, geometry: g } of rows) {
      for (const side of ["L", "R"] as const) {
        const from = Number(a[`FRADD${side}`]), to = Number(a[`TOADD${side}`]);
        if (!from || !to || n < Math.min(from, to) || n > Math.max(from, to) || (from % 2) !== (n % 2)) continue;
        // place the house along the street segment in proportion to its number
        const at = alongPath(g?.paths?.[0], from === to ? 0.5 : (n - from) / (to - from));
        out.push({ line1: `${p.num} ${title(a.STREET_NAME ?? "")}`, city: title(a[`POSTAL_COMM_${side}`] ?? ""), zip: (a[`ZIP${side}`] ?? "").slice(0, 5), county: "Manatee", lat: at?.[1], lon: at?.[0] });
      }
    }
    return out;
  })();
  const all = (await settled([...points, manatee])).filter((a) => a.line1 && a.zip);
  const seen = new Set<string>();
  return all
    .filter((a) => { const k = `${normAddr(a.line1)}|${a.zip}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((a) => ({ a, s: score(p.words, `${a.line1} ${a.city}`) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a)
    .slice(0, 8);
}

/** Nearest official address point to a GPS position (Hillsborough, Pinellas, Sarasota). */
export async function nearestCountyAddress(lat: number, lon: number): Promise<CountyAddress | null> {
  const geo = { geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", distance: "60", units: "esriSRUnit_Meter", outSR: "4326", returnGeometry: "true", resultRecordCount: "25" };
  const found = await settled(POINTS.map(async (s) => (await arcgis(s.url, { where: "1=1", outFields: `${s.addr},${s.zip},${s.city}`, ...geo }))
    .map((r) => ({ line1: title(stripUnit(r.attributes[s.addr] ?? "")), city: title(r.attributes[s.city] ?? ""), zip: (r.attributes[s.zip] ?? "").slice(0, 5), county: s.county, lat: r.geometry?.y, lon: r.geometry?.x }))));
  const dist = (a: CountyAddress) => (a.lat == null || a.lon == null ? Infinity : Math.hypot(a.lat - lat, (a.lon - lon) * Math.cos((lat * Math.PI) / 180)));
  return found.filter((a) => a.line1 && a.zip).sort((a, b) => dist(a) - dist(b))[0] ?? null;
}

/** Nearest Manatee street (no house number) — for new streets missing elsewhere. */
export async function nearestManateeStreet(lat: number, lon: number): Promise<CountyAddress | null> {
  try {
    const rows = await arcgis(MANATEE_STREETS, {
      where: "1=1", geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      distance: "80", units: "esriSRUnit_Meter", returnGeometry: "false", outFields: "STREET_NAME,ZIPL,POSTAL_COMM_L", resultRecordCount: "1",
    });
    const a = rows[0]?.attributes;
    return a?.STREET_NAME ? { line1: title(a.STREET_NAME), city: title(a.POSTAL_COMM_L ?? ""), zip: (a.ZIPL ?? "").slice(0, 5), county: "Manatee" } : null;
  } catch { return null; }
}
