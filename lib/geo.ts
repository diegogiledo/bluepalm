import "server-only";

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
export type Suggestion = { id: string; label: string; line1?: string; city?: string; zip?: string; state?: string };
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
  const matches = (await census(query)).filter((m) => m.addressComponents.state === "FL");
  // closest to Tampa Bay & Sarasota first
  matches.sort((a, b) => Math.hypot(a.coordinates.y - BIAS.lat, a.coordinates.x - BIAS.lon) - Math.hypot(b.coordinates.y - BIAS.lat, b.coordinates.x - BIAS.lon));
  const seen = new Set<string>();
  return matches.flatMap((m) => {
    const a = fromCensus(m);
    const label = `${a.line1}, ${a.city}, FL ${a.zip}`;
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ id: label, label, ...a }];
  }).slice(0, 6);
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
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=18`, {
    signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const a = ((await res.json()) as { address?: Record<string, string> }).address;
  if (!a || (a.state && a.state !== "Florida")) return null;
  const line1 = [a.house_number, a.road].filter(Boolean).join(" ");
  const out: Address = { line1, city: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? "", zip: (a.postcode ?? "").slice(0, 5), state: "FL" };
  // confirm with the Census data, which has the official ZIP
  if (a.house_number && a.road) {
    try {
      const m = await census(`${line1}, ${out.city || ""}, FL`);
      if (m[0]) return fromCensus(m[0]);
    } catch {}
  }
  return line1 ? out : null;
}
