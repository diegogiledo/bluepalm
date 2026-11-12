"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * Interactive hero: the car starts dirty; moving the mouse (or dragging a
 * finger) over it turns the cursor into a sponge that scrubs the grime off.
 * Grime lives on a <canvas> erased with destination-out; the clean car is SVG.
 */
const VW = 612, VH = 300;
export const BODY = "M40 205 Q38 172 72 166 L150 154 Q192 108 252 100 L380 98 Q432 100 472 148 L540 160 Q572 166 572 196 L572 212 Q572 222 560 222 L52 222 Q40 222 40 212 Z";
export const WHEELS = [150, 462];
const SPARKLES = [[110, 165], [250, 118], [400, 122], [525, 172], [330, 190], [190, 196]];
const DONE_AT = 0.86;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function Car({ clean }: { clean: boolean }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="sc-paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#e9f1fb" /><stop offset="1" stopColor="#b7cbe4" />
        </linearGradient>
        <linearGradient id="sc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b2342" /><stop offset="0.6" stopColor="#1b4a8f" /><stop offset="1" stopColor="#3a74c4" />
        </linearGradient>
        <linearGradient id="sc-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="sc-body"><path d={BODY} /></clipPath>
      </defs>
      <ellipse cx="306" cy="266" rx="285" ry="15" fill="#020c22" opacity="0.4" />
      <path d={BODY} fill="url(#sc-paint)" />
      {/* windows + pillar */}
      <path d="M178 150 Q208 117 252 111 L300 111 L300 150 Z" fill="url(#sc-glass)" />
      <path d="M314 111 L376 111 Q412 114 440 150 L314 150 Z" fill="url(#sc-glass)" />
      <path d="M196 140 Q214 122 240 117" stroke="#fff" strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* door seams, handles, stripe */}
      <path d="M306 112 L306 220 M440 152 L446 218 M178 152 L170 218" stroke="#9fb4cf" strokeWidth="1.6" fill="none" />
      <path d="M58 184 L562 184" stroke="#1264D6" strokeWidth="5" strokeLinecap="round" />
      <rect x="272" y="162" width="22" height="5" rx="2.5" fill="#8aa3c2" />
      <rect x="402" y="162" width="22" height="5" rx="2.5" fill="#8aa3c2" />
      {/* mirror, lights */}
      <path d="M440 150 q10 -10 20 -4 l-4 10 z" fill="#0b2342" />
      <rect x="530" y="168" width="32" height="11" rx="5.5" fill="#ffd36b" />
      <rect x="42" y="174" width="20" height="10" rx="4" fill="#ff6b6b" />
      {/* wheel arches + wheels */}
      {WHEELS.map((cx) => (
        <g key={cx}>
          <path d={`M${cx - 52} 222 A52 52 0 0 1 ${cx + 52} 222 Z`} fill="#c9d7ea" />
          <circle cx={cx} cy="222" r="42" fill="#0b2342" />
          <circle cx={cx} cy="222" r="25" fill="#dde6f2" />
          <circle cx={cx} cy="222" r="9" fill="#0b2342" />
          {[0, 72, 144, 216, 288].map((a) => <rect key={a} x={cx - 2.5} y="199" width="5" height="14" rx="2.5" fill="#8aa3c2" transform={`rotate(${a} ${cx} 222)`} />)}
        </g>
      ))}
      {/* shine + sparkles when clean */}
      {clean && !reduce && (
        <g clipPath="url(#sc-body)">
          <motion.rect y="90" width="110" height="140" fill="url(#sc-shine)" initial={{ x: -140 }} animate={{ x: 640 }} transition={{ duration: 1.1, ease: "easeInOut", delay: 0.2 }} />
        </g>
      )}
      {clean && SPARKLES.map(([x, y], i) => (
        <motion.path key={i} d={`M${x} ${y - 13} L${x + 3.5} ${y - 3.5} L${x + 13} ${y} L${x + 3.5} ${y + 3.5} L${x} ${y + 13} L${x - 3.5} ${y + 3.5} L${x - 13} ${y} L${x - 3.5} ${y - 3.5} Z`}
          fill="#fff" style={{ transformOrigin: `${x}px ${y}px` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={reduce ? { scale: 1, opacity: 1 } : { scale: [0, 1.3, 1, 1.15, 1], opacity: 1, rotate: [0, 45, 90] }}
          transition={{ duration: 1.4, delay: 0.3 + i * 0.12 }} />
      ))}
    </svg>
  );
}

function Sponge() {
  return (
    <svg viewBox="0 0 100 80" className="h-full w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.35)]" aria-hidden="true">
      <rect x="6" y="22" width="88" height="52" rx="14" fill="#ffd04d" />
      <rect x="6" y="22" width="88" height="52" rx="14" fill="url(#sp-shade)" />
      <rect x="6" y="8" width="88" height="20" rx="9" fill="#20A575" />
      <defs><linearGradient id="sp-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.25" /><stop offset="1" stopColor="#c98a00" stopOpacity="0.35" /></linearGradient></defs>
      {[[22, 40, 4], [40, 52, 3], [60, 38, 3.5], [76, 56, 4], [30, 62, 2.5], [52, 64, 3], [70, 44, 2], [84, 36, 2.5], [16, 54, 2]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#d99a10" opacity="0.7" />)}
    </svg>
  );
}

type Bubble = { id: number; x: number; y: number; r: number; dx: number };

export function ScrubCar() {
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = useRef(1);
  const baseline = useRef(1);
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastMeasure = useRef(0);
  const lastBubble = useRef(0);
  const bubbleId = useRef(0);
  const auto = useRef(false);

  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [hover, setHover] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  const sx = useMotionValue(0), sy = useMotionValue(0);
  const tilt = useSpring(0, { stiffness: 300, damping: 18 });

  useEffect(() => { setCoarse(window.matchMedia("(pointer: coarse)").matches); }, []);

  const countDirt = useCallback(() => {
    const c = canvas.current; const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !ctx || !c.width) return 0;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const stride = 6; let n = 0;
    for (let y = 0; y < c.height; y += stride) for (let x = 0; x < c.width; x += stride) if (data[(y * c.width + x) * 4 + 3] > 40) n++;
    return n;
  }, []);

  const drawDirt = useCallback(() => {
    const c = canvas.current, w = wrap.current;
    const ctx = c?.getContext("2d", { willReadFrequently: true });
    if (!c || !w || !ctx) return;
    const r = w.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    scale.current = c.width / VW;
    ctx.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, VW, VH);
    const shape = new Path2D(BODY);
    for (const cx of WHEELS) { shape.moveTo(cx + 42, 222); shape.arc(cx, 222, 42, 0, Math.PI * 2); }
    const rand = rng(7);
    ctx.save();
    ctx.clip(shape);
    // dusty film, heavier toward the bottom like road grime
    const film = ctx.createLinearGradient(0, 95, 0, 270);
    film.addColorStop(0, "rgba(150,124,90,0.55)"); film.addColorStop(0.55, "rgba(128,100,66,0.68)"); film.addColorStop(1, "rgba(96,72,44,0.85)");
    ctx.fillStyle = film; ctx.fillRect(0, 80, VW, 200);
    // splashes kicked up behind the wheels
    for (const cx of WHEELS) for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(84,62,38,${0.25 + rand() * 0.35})`;
      ctx.beginPath(); ctx.arc(cx - 70 + rand() * 60, 175 + rand() * 50, 2 + rand() * 7, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${80 + rand() * 30},${60 + rand() * 25},${38 + rand() * 20},${0.2 + rand() * 0.35})`;
      ctx.beginPath(); ctx.ellipse(40 + rand() * 532, 95 + rand() * 170, 1.5 + rand() * 6, 1 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 34; i++) {
      const x = 60 + rand() * 500, y = 110 + rand() * 50;
      ctx.strokeStyle = `rgba(150,118,80,${0.3 + rand() * 0.3})`; ctx.lineWidth = 2 + rand() * 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 6, y + 25 + rand() * 60); ctx.stroke();
    }
    for (let i = 0; i < 500; i++) { ctx.fillStyle = "rgba(60,45,28,0.5)"; ctx.fillRect(40 + rand() * 532, 95 + rand() * 175, 1.2, 1.2); }
    ctx.restore();
    baseline.current = Math.max(1, countDirt());
  }, [countDirt]);

  const doneRef = useRef(false);
  useEffect(() => { doneRef.current = done; }, [done]);
  useEffect(() => {
    let w = 0;
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width);
      if (nw === w) return; // ignore height-only / no-op changes
      w = nw;
      if (!doneRef.current) { drawDirt(); setProgress(0); }
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [drawDirt]);

  const measure = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - lastMeasure.current < 220) return;
    lastMeasure.current = now;
    const p = Math.min(1, Math.max(0, 1 - countDirt() / baseline.current));
    setProgress(p);
    if (p >= DONE_AT) setDone(true);
  }, [countDirt]);

  const erase = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvas.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(scale.current, 0, 0, scale.current, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 48;
    ctx.shadowBlur = 14 * scale.current; ctx.shadowColor = "#000";
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x + 0.01, to.y); ctx.stroke();
    ctx.restore();
  }, []);

  const foam = useCallback((px: number, py: number) => {
    if (reduce) return;
    const now = performance.now();
    if (now - lastBubble.current < 45) return;
    lastBubble.current = now;
    const b = { id: bubbleId.current++, x: px + (Math.random() - 0.5) * 50, y: py + (Math.random() - 0.3) * 30, r: 6 + Math.random() * 12, dx: (Math.random() - 0.5) * 30 };
    setBubbles((bs) => [...bs.slice(-22), b]);
  }, [reduce]);

  const scrubAt = useCallback((clientX: number, clientY: number) => {
    const w = wrap.current; if (!w) return;
    const r = w.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const prevX = sx.get();
    sx.set(px); sy.set(py);
    tilt.set(Math.max(-25, Math.min(25, (px - prevX) * 1.2)));
    if (done) return;
    const p = { x: (px / r.width) * VW, y: (py / r.height) * VH };
    erase(last.current ?? p, p);
    last.current = p;
    foam(px, py);
    measure();
  }, [done, erase, foam, measure, sx, sy, tilt]);

  function onMove(e: React.PointerEvent) {
    if (auto.current) return;
    if (e.pointerType !== "mouse" && e.buttons === 0) return;
    setHover(true);
    scrubAt(e.clientX, e.clientY);
  }
  function onLeave() { setHover(false); last.current = null; tilt.set(0); measure(true); }

  // Keyboard / one-tap alternative: the sponge wipes the car in a zig-zag.
  function cleanForMe() {
    const w = wrap.current; if (!w || auto.current) return;
    auto.current = true; setHover(true); last.current = null;
    const r = w.getBoundingClientRect();
    const pts: { x: number; y: number }[] = [];
    for (let row = 0, y = 108; y <= 262; y += 24, row++) { pts.push({ x: row % 2 ? 572 : 38, y }); pts.push({ x: row % 2 ? 38 : 572, y }); }
    const total = reduce ? 1 : 1900, start = performance.now();
    const seg = pts.length - 1;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / total);
      const f = k * seg, i = Math.min(seg - 1, Math.floor(f)), u = f - i;
      const p = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u };
      scrubAt(r.left + (p.x / VW) * r.width, r.top + (p.y / VH) * r.height);
      if (k < 1) requestAnimationFrame(step);
      else { auto.current = false; setHover(false); last.current = null; measure(true); setDone(true); }
    };
    if (reduce) { pts.slice(1).forEach((p, i) => erase(pts[i], p)); auto.current = false; setHover(false); measure(true); setDone(true); }
    else requestAnimationFrame(step);
  }

  function reset() { setDone(false); setProgress(0); last.current = null; requestAnimationFrame(() => drawDirt()); }

  const pct = Math.round(Math.min(progress / DONE_AT, 1) * 100);
  const showIdle = !hover && !done && progress < 0.03;

  return (
    <div className="relative mx-auto w-full max-w-5xl select-none">
      <div
        ref={wrap} data-hero-car
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerUp={() => { last.current = null; }}
        className={`relative aspect-[612/300] w-full ${done ? "" : "cursor-none touch-none"}`}
        role="img" aria-label={done ? "A spotless, freshly washed car" : "A dirty car. Move your mouse or drag across it to scrub it clean."}
      >
        <Car clean={done} />
        <canvas ref={canvas} className="absolute inset-0 h-full w-full transition-opacity duration-700" style={{ opacity: done ? 0 : 1 }} />

        {/* foam bubbles */}
        <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
          <AnimatePresence>
            {bubbles.map((b) => (
              <motion.span key={b.id} className="absolute rounded-full bg-white/80 ring-1 ring-white"
                style={{ left: b.x, top: b.y, width: b.r * 2, height: b.r * 2, marginLeft: -b.r, marginTop: -b.r }}
                initial={{ scale: 0, opacity: 0.95 }} animate={{ scale: 1, opacity: 0, y: -26, x: b.dx }} transition={{ duration: 1.1, ease: "easeOut" }}
                onAnimationComplete={() => setBubbles((bs) => bs.filter((x) => x.id !== b.id))} />
            ))}
          </AnimatePresence>
        </div>

        {/* sponge following the pointer */}
        {hover && !done && (
          <motion.div className="pointer-events-none absolute left-0 top-0" style={{ x: sx, y: sy }} aria-hidden="true">
            <motion.div className="-ml-10 -mt-8 h-16 w-20 sm:-ml-12 sm:-mt-10 sm:h-20 sm:w-24" style={{ rotate: tilt }}><Sponge /></motion.div>
          </motion.div>
        )}

        {/* idle hint */}
        <AnimatePresence>
          {showIdle && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
              <motion.div className="h-16 w-20 sm:h-20 sm:w-24" animate={reduce ? {} : { x: [-40, 40, -40], y: [0, -10, 0], rotate: [-10, 10, -10] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
                <Sponge />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* status bar */}
      <div className="mx-auto mt-6 flex min-h-14 max-w-md items-center justify-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key="scrub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex w-full items-center gap-4 rounded-full bg-white/10 py-2 pl-5 pr-2 ring-1 ring-white/20 backdrop-blur">
              <span className="shrink-0 text-sm font-semibold text-white/90">{progress < 0.03 ? (coarse ? "Drag to scrub" : "Scrub the car") : `${pct}% clean`}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><motion.span className="block h-full rounded-full bg-gradient-to-r from-[#8ff0c8] to-palm" animate={{ width: `${pct}%` }} /></span>
              <button type="button" onClick={cleanForMe} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25">Clean it for me</button>
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-wrap items-center justify-center gap-3 text-white">
              <span className="font-display text-lg font-extrabold">Spotless. ✨</span>
              <Link href="/book" className="btn-sm btn bg-white text-brand hover:bg-sky">Book the real thing</Link>
              <button type="button" onClick={reset} className="text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">Make it dirty again</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
