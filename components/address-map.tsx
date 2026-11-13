"use client";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { MAP_WORKER_URL, SOFT_MAP_CSS, softStyle } from "@/lib/soft-map";

export type Pin = { lat: number; lon: number };

/**
 * Small map next to the address fields, in a soft, app-like style: pale land,
 * light-blue water, gentle green parks, white roads, few labels, and a round
 * BluePalm pin with a pulsing halo. Free vector tiles from OpenFreeMap
 * (OpenStreetMap data), no API key.
 */
const CSS = `
.bp-pin{position:relative;width:52px;height:64px;pointer-events:none}
.bp-pin-halo{position:absolute;left:50%;bottom:-11px;width:40px;height:16px;margin-left:-20px;border-radius:50%;background:rgba(18,100,214,.28);animation:bp-pulse 2.2s ease-out infinite}
.bp-pin-shadow{position:absolute;left:50%;bottom:-3px;width:16px;height:6px;margin-left:-8px;border-radius:50%;background:rgba(11,35,66,.25);filter:blur(1px)}
.bp-pin-head{position:absolute;left:50%;top:0;width:46px;height:46px;margin-left:-23px;border-radius:50%;background:linear-gradient(145deg,#2a86ff,#1264d6);border:3px solid #fff;box-shadow:0 8px 20px -4px rgba(18,100,214,.55),0 2px 6px rgba(11,35,66,.2);display:grid;place-items:center;box-sizing:border-box;animation:bp-drop .45s cubic-bezier(.22,1.4,.36,1)}
.bp-pin-tail{position:absolute;left:50%;top:41px;width:14px;height:14px;margin-left:-7px;background:#1264d6;border-right:3px solid #fff;border-bottom:3px solid #fff;transform:rotate(45deg);border-bottom-right-radius:4px;box-sizing:border-box;animation:bp-drop .45s cubic-bezier(.22,1.4,.36,1)}
@keyframes bp-pulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.9);opacity:0}}
@keyframes bp-drop{0%{transform:translateY(-18px) rotate(var(--r,0));opacity:0}100%{transform:translateY(0) rotate(var(--r,0));opacity:1}}
.bp-pin-tail{--r:45deg}
@media (prefers-reduced-motion: reduce){.bp-pin-halo,.bp-pin-head,.bp-pin-tail{animation:none}}`;

const PIN_HTML = `<span class="bp-pin-halo"></span><span class="bp-pin-shadow"></span><span class="bp-pin-tail"></span>
  <span class="bp-pin-head"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 16V12.5L6.8 8.2A2 2 0 0 1 8.6 7h6.8a2 2 0 0 1 1.8 1.2L19 12.5V16"/><path d="M4 16h16v2.2a.8.8 0 0 1-.8.8H17a.8.8 0 0 1-.8-.8V17H7.8v1.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8z"/>
  <path d="M7.5 13.5h1M15.5 13.5h1M6 12.5h12"/></svg></span>`;

export function AddressMap({ pin, label, notFound = false }: { pin: Pin | null; label: string; notFound?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef<{ map?: MLMap; marker?: Marker }>({});

  // create the map the first time there's a pin
  useEffect(() => {
    if (!pin || st.current.map || !box.current) return;
    let cancelled = false;
    (async () => {
      const [ml, style] = await Promise.all([import("maplibre-gl"), softStyle()]);
      if (cancelled || !box.current) return;
      ml.setWorkerUrl(MAP_WORKER_URL);
      const map = new ml.Map({
        container: box.current, style, center: [pin.lon, pin.lat], zoom: 16,
        attributionControl: { compact: true }, scrollZoom: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        cooperativeGestures: false,
      });
      map.touchZoomRotate.disableRotation();
      map.on("error", (e) => console.warn("address map:", e.error?.message ?? e));
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      // the library positions the outer element; our pin lives inside it
      const el = document.createElement("div");
      el.innerHTML = `<div class="bp-pin">${PIN_HTML}</div>`;
      st.current = { map, marker: new ml.Marker({ element: el, anchor: "bottom", offset: [0, 4] }).setLngLat([pin.lon, pin.lat]).addTo(map) };
      map.on("load", () => {
        // keep the map credits folded into the small "i" button
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        show(pin);
      });
    })();
    return () => { cancelled = true; };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  // move the pin when the address changes
  useEffect(() => { if (pin && st.current.map) show(pin); }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { st.current.map?.remove(); st.current = {}; }, []);

  function show(p: Pin) {
    const { map, marker } = st.current;
    if (!map || !marker) return;
    marker.setLngLat([p.lon, p.lat]);
    // replay the drop-in animation on the new spot
    const head = marker.getElement().querySelector<HTMLElement>(".bp-pin-head");
    if (head) { head.style.animation = "none"; void head.offsetWidth; head.style.animation = ""; }
    map.flyTo({ center: [p.lon, p.lat], zoom: 16, duration: 700, offset: [0, 18] });
    requestAnimationFrame(() => map.resize());
  }

  return (
    <div className="bp-addr-map bp-soft relative h-52 overflow-hidden rounded-[22px] bg-[#f4f2ed] shadow-[0_10px_30px_-14px_rgba(11,35,66,.35)] ring-1 ring-navy/10 md:h-full md:min-h-[206px]">
      <style>{SOFT_MAP_CSS + CSS}</style>
      <div className={`absolute inset-0 ${pin && !notFound ? "" : "invisible"}`} aria-label={pin ? `Map showing ${label}` : undefined} role={pin ? "img" : undefined}>
        <div ref={box} className="h-full w-full" />
      </div>
      {(!pin || notFound) && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sky to-white p-6 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-white shadow-card ring-1 ring-navy/5" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="#1264d6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
            </span>
            {notFound ? (<>
              <p className="mt-3 text-sm font-semibold text-navy/75">We couldn&apos;t find that address</p>
              <p className="text-xs text-ink-muted">Check the house number, street and ZIP code.</p>
            </>) : (<>
              <p className="mt-3 text-sm font-semibold text-navy/75">Your car&apos;s spot shows here</p>
              <p className="text-xs text-ink-muted">Enter your address to see it on the map.</p>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
