"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type Pin = { lat: number; lon: number; exact: boolean };

// BluePalm map pin (anchored at its tip)
const PIN_SVG = `<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true">
  <path d="M20 51C20 51 37 32.5 37 19A17 17 0 0 0 3 19C3 32.5 20 51 20 51Z" fill="#1264D6" stroke="#fff" stroke-width="3"/>
  <circle cx="20" cy="19" r="6.5" fill="#fff"/></svg>`;

/**
 * Small map next to the address fields: shows a pin where the car is, so the
 * customer can check it's the right place. Before an address is entered it
 * shows a friendly placeholder.
 */
export function AddressMap({ pin, label }: { pin: Pin | null; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const state = useRef<{ map?: import("leaflet").Map; marker?: import("leaflet").Marker; area?: import("leaflet").Circle; L?: typeof import("leaflet") }>({});

  // create the map once, the first time there's a pin
  useEffect(() => {
    if (!pin || state.current.map || !box.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      const map = L.map(box.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([pin.lat, pin.lon], pin.exact ? 16 : 13);
      // detailed street map so customers can recognise their own street (free, no key)
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri, HERE, Garmin, OpenStreetMap" }).addTo(map);
      state.current = { map, L };
      place(pin);
    })();
    return () => { cancelled = true; };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  // move the pin when the address changes
  useEffect(() => { if (pin && state.current.map) place(pin); }, [pin?.lat, pin?.lon, pin?.exact]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { state.current.map?.remove(); state.current = {}; }, []);

  function place(p: Pin) {
    const { map, L } = state.current;
    if (!map || !L) return;
    state.current.marker?.remove();
    state.current.area?.remove();
    const icon = L.divIcon({ className: "", html: PIN_SVG, iconSize: [40, 52], iconAnchor: [20, 51] });
    state.current.marker = L.marker([p.lat, p.lon], { icon, keyboard: false, title: label }).addTo(map);
    // only the town is known: show a soft circle instead of claiming an exact spot
    if (!p.exact) state.current.area = L.circle([p.lat, p.lon], { radius: 1200, color: "#1264D6", weight: 1, fillOpacity: 0.08 }).addTo(map);
    map.flyTo([p.lat, p.lon], p.exact ? 16 : 13, { duration: 0.6 });
    setTimeout(() => map.invalidateSize(), 50);
  }

  return (
    <div className="relative h-48 overflow-hidden rounded-2xl ring-1 ring-navy/10 md:h-full md:min-h-[196px]">
      <div ref={box} className={`absolute inset-0 z-0 ${pin ? "" : "invisible"}`} aria-label={pin ? `Map showing ${label}` : undefined} role={pin ? "img" : undefined} />
      {!pin && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky to-white p-6 text-center">
          <div>
            <svg viewBox="0 0 40 52" className="mx-auto h-10 w-8 opacity-40" aria-hidden="true"><path d="M20 51C20 51 37 32.5 37 19A17 17 0 0 0 3 19C3 32.5 20 51 20 51Z" fill="#1264D6" /><circle cx="20" cy="19" r="6.5" fill="#fff" /></svg>
            <p className="mt-2 text-sm font-semibold text-navy/70">Your car&apos;s spot shows here</p>
            <p className="text-xs text-ink-muted">Enter your address to see it on the map.</p>
          </div>
        </div>
      )}
      {pin && !pin.exact && (
        <p className="absolute inset-x-2 bottom-2 z-[500] rounded-xl bg-white/90 px-3 py-1.5 text-center text-xs font-semibold text-navy shadow">Approximate area. Your detailer gets the exact address.</p>
      )}
    </div>
  );
}
