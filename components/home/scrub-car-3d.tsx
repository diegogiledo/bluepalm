"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ScrubCar, Sponge } from "./scrub-car";

/**
 * 3D hero car built from code (no model file): hover with the mouse to scrub
 * the grime off, click-and-drag to spin it. On touch screens a toggle picks
 * between scrubbing and spinning.
 *
 * The body and cabin are extruded from a 2D side profile. A custom UV layout
 * maps everything onto one texture atlas:
 *   top-left  = near side (+z) · top-right = far side (−z)
 *   bottom    = surfaces around the profile (hood, roof, glass, bumpers), by x and z
 * Paint and dirt each use their own canvas with that layout; scrubbing erases
 * the dirt canvas at the raycast UV.
 */
const TW = 1024, TH = 512;
const X0 = 28, XW = 556, Y0 = 86, YH = 156;      // profile bounds incl. bevel (svg units, y down)
const BODY_D = 200, CABIN_D = 166, BEVEL = 8;
const DONE_AT = 0.82;
type Cmd = [string, ...number[]];
const BODY: Cmd[] = [["M", 40, 212], ["L", 40, 192], ["Q", 42, 170, 72, 166], ["L", 165, 156], ["L", 460, 156], ["L", 540, 162], ["Q", 572, 168, 572, 196], ["L", 572, 212], ["Q", 572, 224, 560, 224], ["L", 52, 224], ["Q", 40, 224, 40, 212]];
const CABIN: Cmd[] = [["M", 165, 160], ["Q", 200, 110, 252, 102], ["L", 380, 100], ["Q", 428, 104, 462, 160], ["Z"]];
const WHEELS = [150, 462];

const capPx = (x: number, y: number, far: boolean) => [((x - X0) / XW) * (TW / 2) + (far ? TW / 2 : 0), ((y - Y0) / YH) * (TH / 2)];
const wallPx = (x: number, t: number) => [((x - X0) / XW) * TW, TH / 2 + t * (TH / 2)];

function traceShape(cmds: Cmd[]) {
  const s = new THREE.Shape();
  for (const [c, ...p] of cmds) {
    if (c === "M") s.moveTo(p[0], -p[1]);
    else if (c === "L") s.lineTo(p[0], -p[1]);
    else if (c === "Q") s.quadraticCurveTo(p[0], -p[1], p[2], -p[3]);
    else s.closePath();
  }
  return s;
}
function traceCap(ctx: CanvasRenderingContext2D, cmds: Cmd[], far: boolean) {
  for (const [c, ...p] of cmds) {
    if (c === "M") ctx.moveTo(...(capPx(p[0], p[1], far) as [number, number]));
    else if (c === "L") ctx.lineTo(...(capPx(p[0], p[1], far) as [number, number]));
    else if (c === "Q") { const [a, b] = capPx(p[0], p[1], far), [d, e] = capPx(p[2], p[3], far); ctx.quadraticCurveTo(a, b, d, e); }
    else ctx.closePath();
  }
}

function uvGenerator(depth: number) {
  const zMin = -BEVEL, zMax = depth + BEVEL;
  return {
    generateTopUV(_g: unknown, v: number[], a: number, b: number, c: number) {
      return [a, b, c].map((i) => {
        const [px, py] = capPx(v[i * 3], -v[i * 3 + 1], v[i * 3 + 2] < depth / 2);
        return new THREE.Vector2(px / TW, 1 - py / TH);
      });
    },
    generateSideWallUV(_g: unknown, v: number[], a: number, b: number, c: number, d: number) {
      return [a, b, c, d].map((i) => {
        const [px, py] = wallPx(v[i * 3], (v[i * 3 + 2] - zMin) / (zMax - zMin));
        return new THREE.Vector2(px / TW, 1 - py / TH);
      });
    },
  };
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function paintCanvas() {
  const c = document.createElement("canvas"); c.width = TW; c.height = TH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9f1fb"; ctx.fillRect(0, 0, TW, TH);
  for (const far of [false, true]) {
    // body side
    ctx.save(); ctx.beginPath(); traceCap(ctx, BODY, far); ctx.clip();
    const g = ctx.createLinearGradient(0, capPx(0, 156, far)[1], 0, capPx(0, 226, far)[1]);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#e6eef9"); g.addColorStop(1, "#aec4e0");
    ctx.fillStyle = g; ctx.fillRect(far ? TW / 2 : 0, 0, TW / 2, TH / 2);
    ctx.strokeStyle = "#1264D6"; ctx.lineWidth = 5; ctx.beginPath();
    ctx.moveTo(...(capPx(46, 184, far) as [number, number])); ctx.lineTo(...(capPx(566, 184, far) as [number, number])); ctx.stroke();
    ctx.strokeStyle = "#9fb4cf"; ctx.lineWidth = 1.5;
    for (const x of [172, 306, 446]) { ctx.beginPath(); ctx.moveTo(...(capPx(x, 158, far) as [number, number])); ctx.lineTo(...(capPx(x - 4, 220, far) as [number, number])); ctx.stroke(); }
    ctx.fillStyle = "#8aa3c2";
    for (const x of [274, 404]) { const [hx, hy] = capPx(x, 164, far); ctx.fillRect(hx, hy, 20, 4); }
    ctx.restore();
    // cabin side: glass framed by paint, with a B-pillar
    ctx.save(); ctx.beginPath(); traceCap(ctx, CABIN, far); ctx.clip();
    const gl = ctx.createLinearGradient(0, capPx(0, 100, far)[1], 0, capPx(0, 160, far)[1]);
    gl.addColorStop(0, "#0b2342"); gl.addColorStop(1, "#2d63ad");
    ctx.fillStyle = gl; ctx.fillRect(far ? TW / 2 : 0, 0, TW / 2, TH / 2);
    ctx.strokeStyle = "#f4f8fd"; ctx.lineWidth = 14; ctx.beginPath(); traceCap(ctx, CABIN, far); ctx.stroke();
    ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(...(capPx(310, 100, far) as [number, number])); ctx.lineTo(...(capPx(306, 160, far) as [number, number])); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(...(capPx(205, 140, far) as [number, number])); ctx.lineTo(...(capPx(245, 115, far) as [number, number])); ctx.stroke();
    ctx.restore();
  }
  // surfaces around the profile: windshield + rear glass, the rest paint
  const glass = (x1: number, x2: number) => {
    const [a, top] = wallPx(x1, 0.1), [b, bottom] = wallPx(x2, 0.9);
    const g = ctx.createLinearGradient(a, 0, b, 0); g.addColorStop(0, "#14386b"); g.addColorStop(1, "#0b2342");
    ctx.fillStyle = g; ctx.fillRect(a, top, b - a, bottom - top);
  };
  glass(176, 248); glass(386, 452);
  const [hx] = wallPx(520, 0);
  ctx.fillStyle = "#1264D6"; ctx.fillRect(hx, wallPx(0, 0.47)[1], 40, wallPx(0, 0.53)[1] - wallPx(0, 0.47)[1]); // hood stripe
  return c;
}

function drawDirt(ctx: CanvasRenderingContext2D) {
  const rand = rng(11);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, TW, TH);
  const film = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(150,124,90,0.62)"); g.addColorStop(0.6, "rgba(126,98,64,0.74)"); g.addColorStop(1, "rgba(94,70,42,0.88)");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  const specks = (x: number, y: number, w: number, h: number, n: number) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(${78 + rand() * 30},${58 + rand() * 24},${36 + rand() * 18},${0.22 + rand() * 0.38})`;
      ctx.beginPath(); ctx.ellipse(x + rand() * w, y + rand() * h, 1.5 + rand() * 6, 1 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  };
  for (const far of [false, true]) {
    ctx.save(); ctx.beginPath(); traceCap(ctx, BODY, far); traceCap(ctx, CABIN, far); ctx.clip("nonzero");
    const x = far ? TW / 2 : 0;
    film(x, 0, TW / 2, TH / 2); specks(x, 0, TW / 2, TH / 2, 260);
    for (const wx of WHEELS) for (let i = 0; i < 24; i++) {
      const [cx, cy] = capPx(wx - 72 + rand() * 64, 180 + rand() * 44, far);
      ctx.fillStyle = `rgba(84,62,38,${0.25 + rand() * 0.35})`; ctx.beginPath(); ctx.arc(cx, cy, 2 + rand() * 6, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 26; i++) { // drips
      const [dx, dy] = capPx(60 + rand() * 490, 112 + rand() * 46, far);
      ctx.strokeStyle = `rgba(150,118,80,${0.3 + rand() * 0.3})`; ctx.lineWidth = 2 + rand() * 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + (rand() - 0.5) * 5, dy + 18 + rand() * 40); ctx.stroke();
    }
    ctx.restore();
  }
  film(0, TH / 2, TW, TH / 2); specks(0, TH / 2, TW, TH / 2, 420);
}

function countDirt(ctx: CanvasRenderingContext2D) {
  const d = ctx.getImageData(0, 0, TW, TH).data; let n = 0;
  for (let y = 0; y < TH; y += 4) for (let x = 0; x < TW; x += 4) if (d[(y * TW + x) * 4 + 3] > 40) n++;
  return n;
}

function webglAvailable() {
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

type Bubble = { id: number; x: number; y: number; r: number; dx: number };
type Api = { reset: () => void; autoClean: () => void };

export function ScrubCar3D() {
  const reduce = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [overCar, setOverCar] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [touch, setTouch] = useState(false);
  const [mode, setMode] = useState<"scrub" | "spin">("scrub");
  const [interacted, setInteracted] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const modeRef = useRef(mode); modeRef.current = mode;
  const doneRef = useRef(done); doneRef.current = done;

  const sx = useMotionValue(0), sy = useMotionValue(0);
  const tilt = useSpring(0, { stiffness: 300, damping: 18 });
  const bubbleClock = useRef(0), bubbleId = useRef(0);

  const foam = useCallback((x: number, y: number) => {
    if (reduce) return;
    const now = performance.now();
    if (now - bubbleClock.current < 45) return;
    bubbleClock.current = now;
    const b = { id: bubbleId.current++, x: x + (Math.random() - 0.5) * 46, y: y + (Math.random() - 0.3) * 28, r: 5 + Math.random() * 11, dx: (Math.random() - 0.5) * 28 };
    setBubbles((bs) => [...bs.slice(-22), b]);
  }, [reduce]);
  const foamRef = useRef(foam); foamRef.current = foam;

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    setSupported(webglAvailable());
  }, []);

  useEffect(() => {
    if (!supported || !host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { setSupported(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x0b2342, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 8, 5); scene.add(sun);

    // textures
    const paintTex = new THREE.CanvasTexture(paintCanvas()); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 4;
    const dirtCanvas = document.createElement("canvas"); dirtCanvas.width = TW; dirtCanvas.height = TH;
    const dctx = dirtCanvas.getContext("2d", { willReadFrequently: true })!;
    drawDirt(dctx);
    let baseline = Math.max(1, countDirt(dctx));
    const dirtTex = new THREE.CanvasTexture(dirtCanvas); dirtTex.colorSpace = THREE.SRGBColorSpace;

    const paintMat = new THREE.MeshPhysicalMaterial({ map: paintTex, metalness: 0.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1 });
    const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, transparent: true, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    // geometry (svg units; group scaled to world units)
    const car = new THREE.Group();
    const extrude = (cmds: Cmd[], depth: number) => {
      const g = new THREE.ExtrudeGeometry(traceShape(cmds), {
        depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL * 0.8, bevelSegments: 4, curveSegments: 28,
        UVGenerator: uvGenerator(depth) as unknown as THREE.UVGenerator,
      });
      g.translate(-306, 264, -depth / 2);
      return g;
    };
    const bodyGeo = extrude(BODY, BODY_D), cabinGeo = extrude(CABIN, CABIN_D);
    const paintMeshes = [new THREE.Mesh(bodyGeo, paintMat), new THREE.Mesh(cabinGeo, paintMat)];
    paintMeshes.forEach((m) => car.add(m, new THREE.Mesh(m.geometry, dirtMat)));

    const tireGeo = new THREE.CylinderGeometry(42, 42, 30, 40); tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(25, 25, 31, 32); rimGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(9, 9, 32, 16); hubGeo.rotateX(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b1626, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7e1ee, metalness: 0.9, roughness: 0.25 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x0b2342, metalness: 0.6, roughness: 0.4 });
    const wheels: THREE.Group[] = [];
    for (const wx of WHEELS) for (const side of [1, -1]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(hubGeo, hubMat));
      w.position.set(wx - 306, 42, side * (BODY_D / 2 - 6)); car.add(w); wheels.push(w);
    }
    const lightGeo = new THREE.BoxGeometry(8, 12, 46);
    const head = new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: 0xffd36b, emissiveIntensity: 1.6 });
    const tail = new THREE.MeshStandardMaterial({ color: 0xff8a8a, emissive: 0xff3b3b, emissiveIntensity: 1.2 });
    for (const side of [1, -1]) {
      const h = new THREE.Mesh(lightGeo, head); h.position.set(572 - 306 + 4, 264 - 178, side * 62); car.add(h);
      const t = new THREE.Mesh(lightGeo, tail); t.position.set(40 - 306 - 4, 264 - 182, side * 62); car.add(t);
    }
    car.scale.setScalar(0.01);
    const pivot = new THREE.Group(); pivot.add(car); scene.add(pivot);

    // soft ground shadow
    const sc = document.createElement("canvas"); sc.width = sc.height = 128;
    const sctx = sc.getContext("2d")!; const rg = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, "rgba(2,12,34,0.55)"); rg.addColorStop(1, "rgba(2,12,34,0)"); sctx.fillStyle = rg; sctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(sc);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; pivot.add(shadow);

    // camera fit
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const dist = camera.aspect < 1.1 ? 10.5 : camera.aspect < 1.6 ? 8.6 : 7.2;
      camera.position.set(0, dist * 0.22, dist); camera.lookAt(0, 0.7, 0);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // state
    let rotY = -0.55, rotX = 0.08, velY = 0, dragging = false, lastX = 0, lastY = 0, idleT = 0;
    let lastHit: { x: number; y: number } | null = null, lastMeasure = 0, autoUntil = 0, fade = 1;
    let userTouched = false, visible = true, raf = 0, prev = performance.now();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

    const measure = (force = false) => {
      const t = performance.now(); if (!force && t - lastMeasure < 220) return;
      lastMeasure = t;
      const p = Math.min(1, Math.max(0, 1 - countDirt(dctx) / baseline));
      setProgress(p); if (p >= DONE_AT) setDone(true);
    };
    const erase = (x: number, y: number) => {
      dctx.save(); dctx.globalCompositeOperation = "destination-out";
      dctx.lineCap = "round"; dctx.lineWidth = 50; dctx.shadowBlur = 12; dctx.shadowColor = "#000"; dctx.strokeStyle = "rgba(0,0,0,0.85)";
      dctx.beginPath();
      const from = lastHit && Math.hypot(lastHit.x - x, lastHit.y - y) < 90 ? lastHit : { x, y };
      dctx.moveTo(from.x, from.y); dctx.lineTo(x + 0.01, y); dctx.stroke(); dctx.restore();
      lastHit = { x, y }; dirtTex.needsUpdate = true;
    };
    const hitTest = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(paintMeshes, false)[0] ?? null;
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        rotY += dx * 0.01; velY = dx * 0.01; rotX = Math.max(-0.12, Math.min(0.4, rotX + dy * 0.004));
        lastX = e.clientX; lastY = e.clientY; return;
      }
      if (autoUntil > performance.now()) return;
      const scrubbing = e.pointerType === "mouse" || (modeRef.current === "scrub" && e.buttons > 0);
      const hit = hitTest(e);
      setOverCar(Boolean(hit) && !doneRef.current && (e.pointerType === "mouse" || modeRef.current === "scrub"));
      if (!scrubbing || !hit?.uv || doneRef.current) { lastHit = null; return; }
      const prevX = sx.get(); sx.set(px); sy.set(py); tilt.set(Math.max(-25, Math.min(25, (px - prevX) * 1.2)));
      erase(hit.uv.x * TW, (1 - hit.uv.y) * TH);
      foamRef.current(px, py);
      userTouched = true; setInteracted(true);
      measure();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || modeRef.current === "spin") {
        dragging = true; lastX = e.clientX; lastY = e.clientY; velY = 0; userTouched = true;
        setGrabbing(true); setOverCar(false); setInteracted(true);
        renderer.domElement.setPointerCapture(e.pointerId);
      } else onMove(e);
    };
    const onUp = (e: PointerEvent) => {
      if (dragging) { dragging = false; setGrabbing(false); try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {} }
      lastHit = null; measure(true);
    };
    const onLeave = () => { if (!dragging) { setOverCar(false); lastHit = null; tilt.set(0); } };
    const cv = renderer.domElement;
    cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp); cv.addEventListener("pointerleave", onLeave);

    api.current = {
      reset() {
        drawDirt(dctx); baseline = Math.max(1, countDirt(dctx)); dirtTex.needsUpdate = true; fade = 1; dirtMat.opacity = 1;
        setProgress(0); setDone(false);
      },
      autoClean() {
        const dur = reduce ? 1 : 2400, start = performance.now(); autoUntil = start + dur; userTouched = true; setInteracted(true);
        const startRot = rotY;
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / dur);
          dctx.save(); dctx.globalCompositeOperation = "destination-out"; dctx.fillStyle = "rgba(0,0,0,0.35)";
          dctx.fillRect(0, 0, TW * k, TH); dctx.restore(); dirtTex.needsUpdate = true;
          if (!reduce) rotY = startRot + k * Math.PI * 2;
          if (k < 1) requestAnimationFrame(step);
          else { dctx.clearRect(0, 0, TW, TH); dirtTex.needsUpdate = true; measure(true); setDone(true); }
        };
        step();
      },
    };

    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
    io.observe(el);

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - prev) / 1000); prev = t;
      if (!visible) return;
      if (!dragging) {
        rotY += velY; velY *= 0.92;
        if (!userTouched && !reduce) { idleT += dt; rotY = -0.55 + Math.sin(idleT * 0.6) * 0.45; }
      }
      pivot.rotation.y = rotY; pivot.rotation.x = rotX;
      const target = doneRef.current ? 0 : 1;
      if (fade !== target) { fade += (target - fade) * Math.min(1, dt * 4); if (Math.abs(fade - target) < 0.01) fade = target; dirtMat.opacity = fade; }
      paintMat.envMapIntensity = doneRef.current ? 1.35 : 0.9;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp); cv.removeEventListener("pointercancel", onUp); cv.removeEventListener("pointerleave", onLeave);
      [bodyGeo, cabinGeo, tireGeo, rimGeo, hubGeo, lightGeo, shadow.geometry].forEach((g) => g.dispose());
      [paintMat, dirtMat, tireMat, rimMat, hubMat, head, tail, shadow.material as THREE.Material].forEach((m) => m.dispose());
      [paintTex, dirtTex, shadowTex, envTex].forEach((tx) => tx.dispose());
      pmrem.dispose(); renderer.dispose(); cv.remove(); api.current = null;
    };
  }, [supported, reduce, sx, sy, tilt]);

  if (supported === false) return <ScrubCar />;

  const pct = Math.round(Math.min(progress / DONE_AT, 1) * 100);
  const cursor = grabbing ? "cursor-grabbing" : overCar ? "cursor-none" : "cursor-grab";

  return (
    <div className="relative mx-auto w-full max-w-5xl select-none">
      <div ref={host} className={`relative aspect-[4/3] w-full sm:aspect-[16/8] ${cursor}`}
        role="img" aria-label={done ? "A spotless 3D car" : "A dirty 3D car. Move the mouse over it to scrub, or drag to spin it."}>
        {/* foam */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <AnimatePresence>
            {bubbles.map((b) => (
              <motion.span key={b.id} className="absolute rounded-full bg-white/80 ring-1 ring-white"
                style={{ left: b.x, top: b.y, width: b.r * 2, height: b.r * 2, marginLeft: -b.r, marginTop: -b.r }}
                initial={{ scale: 0, opacity: 0.95 }} animate={{ scale: 1, opacity: 0, y: -24, x: b.dx }} transition={{ duration: 1.1, ease: "easeOut" }}
                onAnimationComplete={() => setBubbles((bs) => bs.filter((x) => x.id !== b.id))} />
            ))}
          </AnimatePresence>
        </div>
        {overCar && !grabbing && (
          <motion.div className="pointer-events-none absolute left-0 top-0" style={{ x: sx, y: sy }} aria-hidden="true">
            <motion.div className="-ml-10 -mt-8 h-16 w-20 sm:-ml-12 sm:-mt-10 sm:h-20 sm:w-24" style={{ rotate: tilt }}><Sponge /></motion.div>
          </motion.div>
        )}
        {done && !reduce && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {[[22, 38], [38, 26], [52, 44], [64, 30], [76, 46], [46, 58], [30, 52], [70, 58]].map(([l, t], i) => (
              <motion.span key={i} className="absolute text-2xl text-white drop-shadow sm:text-3xl" style={{ left: `${l}%`, top: `${t}%` }}
                initial={{ scale: 0, opacity: 0, rotate: 0 }} animate={{ scale: [0, 1.3, 0.9, 1.1, 0], opacity: [0, 1, 1, 1, 0], rotate: 90 }}
                transition={{ duration: 1.8, delay: 0.2 + i * 0.1 }}>✦</motion.span>
            ))}
          </div>
        )}
        {supported === null && <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-white/5" />}
        <AnimatePresence>
          {!interacted && supported && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 1.2 }}
              className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm font-semibold text-white/80">
              {touch ? "Drag to scrub · switch to Spin to turn it" : "Move your mouse over the car to scrub · drag to spin"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto mt-4 flex min-h-14 max-w-lg flex-col items-center justify-center gap-3" aria-live="polite">
        {touch && !done && (
          <div className="inline-flex rounded-full bg-white/10 p-1 ring-1 ring-white/20" role="group" aria-label="Touch mode">
            {(["scrub", "spin"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`rounded-full px-4 py-1.5 text-xs font-bold ${mode === m ? "bg-white text-brand" : "text-white/80"}`}>
                {m === "scrub" ? "🧽 Scrub" : "↻ Spin"}
              </button>
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key="scrub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="flex w-full items-center gap-4 rounded-full bg-white/10 py-2 pl-5 pr-2 ring-1 ring-white/20 backdrop-blur">
              <span className="shrink-0 text-sm font-semibold text-white/90">{progress < 0.03 ? "Scrub the car" : `${pct}% clean`}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><motion.span className="block h-full rounded-full bg-gradient-to-r from-[#8ff0c8] to-palm" animate={{ width: `${pct}%` }} /></span>
              <button type="button" onClick={() => api.current?.autoClean()} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25">Clean it for me</button>
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-wrap items-center justify-center gap-3 text-white">
              <span className="font-display text-lg font-extrabold">Spotless. ✨</span>
              <Link href="/book" className="btn btn-sm bg-white text-brand hover:bg-sky">Book the real thing</Link>
              <button type="button" onClick={() => api.current?.reset()} className="text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">Make it dirty again</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
