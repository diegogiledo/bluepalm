"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { BODY, WHEELS } from "./scrub-car";
import { WELCOME_PROMO } from "@/lib/config";

/**
 * The hero car "drives off" through the homepage.
 *
 * As the hero scrolls away, a fixed-position copy of the car takes over from
 * exactly where the hero car is (it gets a quick sparkle wash on the way),
 * shrinks and settles near the bottom of the screen. While you scroll it drives
 * across each section, turning around at every section boundary, with spinning
 * wheels and a few soap bubbles. When the final call-to-action card arrives,
 * it pulls into the parking spot inside it ([data-car-park]).
 *
 * Everything runs in one requestAnimationFrame loop that writes styles
 * directly (no React re-renders). Disabled for reduced-motion users.
 */
const VW = 612, VH = 300;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Rect = { x: number; y: number; w: number };
const mix = (a: Rect, b: Rect, t: number): Rect => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t) });

export function TravelCar() {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const flip = useRef<HTMLDivElement>(null);
  const wheels = useRef<(SVGGElement | null)[]>([]);
  const puffs = useRef<(HTMLSpanElement | null)[]>([]);
  const groundEl = useRef<HTMLSpanElement>(null);
  const offer = useRef<HTMLAnchorElement>(null);
  const [touchLabel, setTouchLabel] = useState("Click for 10% off your first cleaning");
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) setTouchLabel("Tap for 10% off your first clean");
  }, []);

  useEffect(() => {
    const el = root.current, fl = flip.current;
    const hero = document.querySelector<HTMLElement>("[data-hero-car]");
    if (reduce || !el || !fl || !hero) return;
    const park = document.querySelector<HTMLElement>("[data-car-park]");
    const getSections = () => [...document.querySelectorAll<HTMLElement>("#main > section")].filter((s) => s.offsetHeight > 0).slice(1);
    let sections = getSections();
    const ro = new ResizeObserver(() => { sections = getSections(); });
    ro.observe(document.body);

    const bubbles = puffs.current.map(() => ({ x: 0, y: 0, t: 1 }));
    let raf = 0, prev = performance.now(), curX = NaN, lastX = NaN, facing = 1, faceShown = 1, angle = 0, bi = 0, lastPuff = 0, wasDriving = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - prev); prev = now;
      const vw = window.innerWidth, vh = window.innerHeight, small = vw < 640;

      // where the car drives. Measured from real on-screen elements (not
      // innerHeight) so phone toolbars and the iPhone safe area can't push it
      // behind anything: on phones the wheels ride on the floating Book button.
      const w = small ? 104 : clamp(vw * 0.13, 130, 190);
      const h = (w * VH) / VW;
      const btn = small ? document.querySelector<HTMLElement>("[data-floating-book] a")?.getBoundingClientRect() : undefined;
      const ground = btn && btn.height > 0 && btn.top < vh ? btn.top + 4 : (groundEl.current?.getBoundingClientRect().top ?? vh - 26);
      const driveY = ground - h * 0.93;
      const minX = small ? 6 : 24, maxX = vw - w - minX, center = (vw - w) / 2;

      // 1) hero → driving: starts once the hero car begins to leave the top
      const hr = hero.getBoundingClientRect();
      const p = clamp((Math.max(72, vh * 0.1) - hr.top) / (vh * 0.5));

      // 2) drive across each section, alternating direction
      const line = driveY + h / 2;
      let targetX = center;
      for (let i = 0; i < sections.length; i++) {
        const r = sections[i].getBoundingClientRect();
        if (line >= r.top && line < r.bottom) {
          const t = clamp((line - r.top) / Math.max(1, r.height));
          const from = i === 0 ? center : i % 2 === 1 ? maxX : minX;
          const to = i % 2 === 0 ? maxX : minX;
          targetX = lerp(from, to, t);
          break;
        }
        if (i === sections.length - 1 && line >= r.bottom) targetX = center;
      }
      curX = Number.isNaN(curX) ? targetX : curX + (targetX - curX) * Math.min(1, dt / 110);
      let rect: Rect = { x: curX, y: driveY, w };

      // 3) docking into the final card
      let q = 0;
      if (park) {
        const pr = park.getBoundingClientRect();
        q = clamp((vh * 0.92 - pr.top) / (vh * 0.42));
        if (q > 0) rect = mix(rect, { x: pr.left, y: pr.top, w: pr.width }, ease(q));
      }
      if (p < 1) rect = mix({ x: hr.left, y: hr.top, w: hr.width }, rect, ease(p));

      const driving = p > 0;
      hero.style.opacity = driving ? "0" : "";
      el.style.opacity = driving ? "1" : "0";
      if (driving && !wasDriving) { el.classList.remove("tc-wash"); void el.offsetWidth; el.classList.add("tc-wash"); }
      wasDriving = driving;

      // facing + wheels
      const dx = Number.isNaN(lastX) ? 0 : rect.x - lastX; lastX = rect.x;
      if (p >= 1 && q < 0.5 && Math.abs(targetX - curX) > 2) facing = targetX > curX ? 1 : -1;
      if (p < 1 || q >= 0.5) facing = 1;
      if (faceShown !== facing) { faceShown = facing; fl.style.transform = `scaleX(${facing})`; }
      angle += ((dx * (VW / Math.max(1, rect.w))) / 42) * (180 / Math.PI);
      wheels.current.forEach((g, i) => g?.setAttribute("transform", `rotate(${angle.toFixed(1)} ${WHEELS[i % 2]} 222)`));

      const moving = Math.abs(dx) > 0.6 && p >= 1 && q < 1;
      const bob = moving ? Math.sin(now / 90) * 1.2 : 0;
      el.style.width = `${rect.w.toFixed(1)}px`;
      el.style.transform = `translate3d(${rect.x.toFixed(1)}px, ${(rect.y + bob).toFixed(1)}px, 0)`;

      // "10% off" bubble rides above the car while it's out driving
      const o = offer.current;
      if (o) {
        const show = p >= 0.98 && q < 0.35;
        const ow = o.offsetWidth, oh = o.offsetHeight;
        const ox = clamp(rect.x + rect.w / 2 - ow / 2, 8, vw - ow - 8);
        o.style.transform = `translate3d(${ox.toFixed(1)}px, ${(rect.y + rect.w * 0.12 - oh + bob).toFixed(1)}px, 0)`;
        o.style.opacity = show ? "1" : "0";
        o.style.pointerEvents = show ? "auto" : "none";
        o.tabIndex = show ? 0 : -1;
      }

      // soap bubbles from the rear while driving
      if (moving && now - lastPuff > 110 && bubbles.length) {
        lastPuff = now;
        const b = bubbles[bi++ % bubbles.length];
        b.x = facing === 1 ? rect.x + rect.w * 0.06 : rect.x + rect.w * 0.94;
        b.y = rect.y + rect.w * (VH / VW) * 0.62; b.t = 0;
      }
      bubbles.forEach((b, i) => {
        const s = puffs.current[i]; if (!s) return;
        if (b.t >= 1) { s.style.opacity = "0"; return; }
        b.t = Math.min(1, b.t + dt / 800);
        const size = 6 + b.t * 10;
        s.style.opacity = ((1 - b.t) * 0.8).toFixed(2);
        s.style.width = s.style.height = `${size}px`;
        s.style.transform = `translate3d(${(b.x - facing * b.t * 18 - size / 2).toFixed(1)}px, ${(b.y - b.t * 16 - size / 2).toFixed(1)}px, 0)`;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); hero.style.opacity = ""; };
  }, [reduce]);

  if (reduce) return null;
  return (
    <>
      <span ref={groundEl} aria-hidden="true" className="pointer-events-none fixed left-0 h-0 w-0" style={{ bottom: "calc(env(safe-area-inset-bottom) + 26px)" }} />
      <Link ref={offer} href={`/book?promo=${WELCOME_PROMO}`} tabIndex={-1}
        className="tc-offer fixed left-0 top-0 z-[42] flex items-center gap-1.5 whitespace-nowrap rounded-full bg-palm px-3 py-1.5 text-xs font-bold text-white shadow-lift ring-2 ring-white transition-opacity duration-300 hover:bg-palm-600 sm:px-4 sm:py-2 sm:text-sm"
        style={{ opacity: 0, pointerEvents: "none" }}>
        <span aria-hidden>🎁</span> {touchLabel}
      </Link>
    <div aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} ref={(n) => { puffs.current[i] = n; }} className="pointer-events-none fixed left-0 top-0 z-[41] rounded-full bg-white/90 ring-1 ring-[#9cc8f5]" style={{ opacity: 0 }} />
      ))}
      <div ref={root} className="tc-car pointer-events-none fixed left-0 top-0 z-[41] will-change-transform" style={{ opacity: 0, width: 0 }}>
        <div ref={flip} className="transition-transform duration-300 ease-out">
          <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full drop-shadow-[0_18px_18px_rgba(3,15,40,0.35)]">
            <defs>
              <linearGradient id="tc-paint" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#e9f1fb" /><stop offset="1" stopColor="#b7cbe4" />
              </linearGradient>
              <linearGradient id="tc-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0b2342" /><stop offset="0.6" stopColor="#1b4a8f" /><stop offset="1" stopColor="#3a74c4" />
              </linearGradient>
            </defs>
            <ellipse cx="306" cy="266" rx="285" ry="15" fill="#020c22" opacity="0.25" />
            <path d={BODY} fill="url(#tc-paint)" />
            <path d="M178 150 Q208 117 252 111 L300 111 L300 150 Z" fill="url(#tc-glass)" />
            <path d="M314 111 L376 111 Q412 114 440 150 L314 150 Z" fill="url(#tc-glass)" />
            <path d="M196 140 Q214 122 240 117" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M306 112 L306 220 M440 152 L446 218 M178 152 L170 218" stroke="#9fb4cf" strokeWidth="1.6" fill="none" />
            <path d="M58 184 L562 184" stroke="#1264D6" strokeWidth="5" strokeLinecap="round" />
            <rect x="272" y="162" width="22" height="5" rx="2.5" fill="#8aa3c2" />
            <rect x="402" y="162" width="22" height="5" rx="2.5" fill="#8aa3c2" />
            <path d="M440 150 q10 -10 20 -4 l-4 10 z" fill="#0b2342" />
            <rect x="530" y="168" width="32" height="11" rx="5.5" fill="#ffd36b" />
            <rect x="42" y="174" width="20" height="10" rx="4" fill="#ff6b6b" />
            {WHEELS.map((cx, i) => (
              <g key={cx}>
                <path d={`M${cx - 52} 222 A52 52 0 0 1 ${cx + 52} 222 Z`} fill="#c9d7ea" />
                <circle cx={cx} cy="222" r="42" fill="#0b2342" />
                <g ref={(n) => { wheels.current[i] = n; }}>
                  <circle cx={cx} cy="222" r="25" fill="#dde6f2" />
                  {[0, 72, 144, 216, 288].map((a) => <rect key={a} x={cx - 2.5} y="199" width="5" height="14" rx="2.5" fill="#8aa3c2" transform={`rotate(${a} ${cx} 222)`} />)}
                </g>
                <circle cx={cx} cy="222" r="9" fill="#0b2342" />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
    </>
  );
}
