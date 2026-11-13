import "server-only";
import { nearestCountyAddress, nearestManateeStreet, normAddr, searchCounties } from "./county-addresses";

/**
 * Address search and reverse geocoding for the booking form.
 *
 * Providers:
 *  - Google Places (New) + Geocoding when GOOGLE_MAPS_API_KEY is set
 *    (enable "Places API (New)" and "Geocoding API" for the key). Best
 *    type-ahead: suggests from the first few letters.
 *  - Otherwise, free and keyless:
 *      · search:  U.S. Census Bureau geocoder (exact US street addresses and
 *        ZIPs, fast). Needs a house number + street, e.g. "4202 E Fowler".
 *      · "use my location": OpenStreetMap Nominatim reverse lookup (one call
 *        per click, within its usage policy), then confirmed with the Census
 *        geocoder for the official ZIP code.
 *
 * Every outside call has a short time limit so the form never hangs.
 */
export type Suggestion = { id: string; label: string; line1?: string; city?: string; zip?: string; state?: string; lat?: number; lon?: number };
export type Address = { line1: string; city: string; zip: string; state: string };

const GOOGLE = process.env.GOOGLE_MAPS_API_KEY;
export const geoProvider: "google" | "census" = GOOGLE ? "google" : "census";
const BIAS = { lat: 27.5, lon: -82.5 }; // Tampa Bay & Sarasota
const UA = "BluePalmAutoCare/1.0 (https://bluepalm.shop; address lookup)";
const TIMEOUT = 5000;

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase());

// ---------- Census ----------
type CensusMatch = { matchedAddress: string; coordinates: { x: number; y: number }; addressComponents: { city: string; state: string; zip: string } };

async function census(oneLine: string): Promise<CensusMatch[]> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(oneLine)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  const j = (await res.json()) as { result?: { addressMatches?: CensusMatch[] } };
  return j.result?.addressMatches ?? [];
}
function fromCensus(m: CensusMatch): Address {
  return { line1: title(m.matchedAddress.split(",")[0]), city: title(m.addressComponents.city), zip: m.addressComponents.zip, state: m.addressComponents.state };
}

// ---------- Google ----------
type GComp = { longText?: string; shortText?: string; long_name?: string; short_name?: string; types: string[] };
function fromGoogle(components: GComp[]): Address {
  const get = (t: string, short = false) => {
    const c = components.find((x) => x.types.includes(t));
    return (short ? c?.shortText ?? c?.short_name : c?.longText ?? c?.long_name) ?? "";
  };
  const city = get("locality") || get("sublocality") || get("neighborhood") || get("administrative_area_level_3");
  return { line1: [get("street_number"), get("route")].filter(Boolean).join(" "), city, zip: get("postal_code"), state: get("administrative_area_level_1", true) };
}

// ---------- public API ----------
/** True when the free search can work with what's typed (house number + street). */
export const searchable = (q: string) => GOOGLE ? q.trim().length >= 3 : /^\s*\d+[A-Za-z]?\s+(.*\s)?[A-Za-z0-9]{3,}/.test(q);

export async function suggest(q: string, session: string): Promise<Suggestion[]> {
  if (GOOGLE) {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST", signal: AbortSignal.timeout(TIMEOUT),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE },
      body: JSON.stringify({
        input: q, sessionToken: session, includedRegionCodes: ["us"],
        locationBias: { circle: { center: { latitude: BIAS.lat, longitude: BIAS.lon }, radius: 50000 } },
      }),
    });
    if (!res.ok) throw new Error(`Address search failed (${res.status})`);
    const j = (await res.json()) as { suggestions?: { placePrediction?: { placeId: string; text: { text: string } } }[] };
    return (j.suggestions ?? []).flatMap((s) => (s.placePrediction ? [{ id: s.placePrediction.placeId, label: s.placePrediction.text.text }] : [])).slice(0, 6);
  }
  if (!searchable(q)) return [];
  const query = /\b(fl|florida)\b/i.test(q) ? q : `${q}, FL`;
  // official county records first (they include brand-new streets), Census as backup
  const [county, censusMatches] = await Promise.all([
    searchCounties(q).catch(() => []),
    census(query).catch(() => [] as CensusMatch[]),
  ]);
  // only the Tampa Bay–Sarasota region (Pasco/Hillsborough down to Charlotte)
  const matches = censusMatches.filter((m) => m.addressComponents.state === "FL"
    && m.coordinates.y > 26.7 && m.coordinates.y < 28.45 && m.coordinates.x > -83.1 && m.coordinates.x < -81.75);
  matches.sort((a, b) => Math.hypot(a.coordinates.y - BIAS.lat, a.coordinates.x - BIAS.lon) - Math.hypot(b.coordinates.y - BIAS.lat, b.coordinates.x - BIAS.lon));
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const a of [...county.map((c) => ({ ...c, state: "FL" })), ...matches.map((m) => ({ ...fromCensus(m), lat: m.coordinates.y, lon: m.coordinates.x }))] as (Address & { lat?: number; lon?: number })[]) {
    const key = normAddr(a.line1);
    if (seen.has(key)) continue;
    seen.add(key);
    const label = `${a.line1}, ${a.city}, FL ${a.zip}`;
    out.push({ id: label, label, line1: a.line1, city: a.city, zip: a.zip, state: "FL", lat: a.lat, lon: a.lon });
  }
  return out.slice(0, 6);
}

/** Full address for a Google place id (free suggestions already carry the fields). */
export async function details(placeId: string, session: string): Promise<Address | null> {
  if (!GOOGLE) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(session)}`, {
    signal: AbortSignal.timeout(TIMEOUT), headers: { "X-Goog-Api-Key": GOOGLE, "X-Goog-FieldMask": "addressComponents" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { addressComponents?: GComp[] };
  return j.addressComponents ? fromGoogle(j.addressComponents) : null;
}

export async function reverse(lat: number, lon: number): Promise<Address | null> {
  if (GOOGLE) {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&result_type=street_address|premise&key=${GOOGLE}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { address_components: GComp[] }[] };
    return j.results?.[0] ? fromGoogle(j.results[0].address_components) : null;
  }
  // Ask the counties and OpenStreetMap at the same time, then prefer:
  // county address point → OpenStreetMap house (ZIP confirmed by Census) →
  // Manatee street (new streets) → OpenStreetMap street.
  const osm = (async (): Promise<Address | null> => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=18`, {
      signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": UA, "Accept-Language": "en" },
    });
    if (!res.ok) return null;
    const a = ((await res.json()) as { address?: Record<string, string> }).address;
    if (!a || (a.state && a.state !== "Florida")) return null;
    const line1 = [a.house_number, a.road].filter(Boolean).join(" ");
    const out: Address = { line1, city: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? "", zip: (a.postcode ?? "").slice(0, 5), state: "FL" };
    if (a.house_number && a.road) {
      try { const m = await census(`${line1}, ${out.city || ""}, FL`); if (m[0]) return fromCensus(m[0]); } catch {}
    }
    return line1 ? out : null;
  })().catch(() => null);
  const [point, street, fromOsm] = await Promise.all([
    nearestCountyAddress(lat, lon).catch(() => null), nearestManateeStreet(lat, lon), osm,
  ]);
  if (point) return { line1: point.line1, city: point.city, zip: point.zip, state: "FL" };
  if (fromOsm && /^\d/.test(fromOsm.line1)) return fromOsm;
  if (street) return { line1: street.line1, city: street.city, zip: street.zip, state: "FL" };
  return fromOsm;
}

// ---------- base location of a detailing business (coverage map) ----------
const cityCache = new Map<string, { lat: number; lon: number } | null>();
let lastNominatim = 0;
/**
 * Coordinates for a business: its street address via the Census geocoder,
 * otherwise the centre of its city via OpenStreetMap (spaced ≥1 s apart and
 * cached per city, within Nominatim's usage policy).
 */
export async function locate(address: string | null, city: string): Promise<{ lat: number; lon: number } | null> {
  if (address && /^\s*\d/.test(address)) {
    try {
      const m = await census(/\b(fl|florida)\b/i.test(address) ? address : `${address}, ${city}, FL`);
      if (m[0]) return { lat: m[0].coordinates.y, lon: m[0].coordinates.x };
    } catch {}
  }
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (cityCache.has(key)) return cityCache.get(key)!;
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=Florida&country=us&format=jsonv2&limit=1`, {
      signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": UA, "Accept-Language": "en" },
    });
    const j = res.ok ? ((await res.json()) as { lat: string; lon: string }[]) : [];
    const out = j[0] ? { lat: Number(j[0].lat), lon: Number(j[0].lon) } : null;
    cityCache.set(key, out);
    return out;
  } catch { return null; }
}

/**
 * Map position for an address the customer has entered (picked or typed):
 * Census first, then county records (new streets), then the town centre.
 * `exact` is false when only the town could be found.
 */
export async function geocode(line1: string, city: string, zip: string): Promise<{ lat: number; lon: number; exact: boolean } | null> {
  if (/^\s*\d/.test(line1)) {
    try {
      const m = await census(`${line1}, ${city}, FL ${zip}`);
      if (m[0]) return { lat: m[0].coordinates.y, lon: m[0].coordinates.x, exact: true };
    } catch {}
    try {
      const hits = await searchCounties(line1);
      const best = hits.find((h) => h.zip === zip && h.lat != null && normAddr(h.line1) === normAddr(line1)) ?? hits.find((h) => h.zip === zip && h.lat != null);
      if (best?.lat != null && best.lon != null) return { lat: best.lat, lon: best.lon, exact: true };
    } catch {}
  }
  const town = await locate(null, city || zip);
  return town ? { ...town, exact: false } : null;
}
