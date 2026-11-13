"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_LOC, LOC_KEY, THEME_KEY, resolveTheme, type ThemeMode } from "@/lib/admin-theme";

const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const readMode = (): ThemeMode => { try { const v = localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" ? v : "auto"; } catch { return "auto"; } };

/** The admin theme currently on screen; re-renders when it changes. */
export function useAdminTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => { const o = new MutationObserver(cb); o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-admin-theme"] }); return () => o.disconnect(); },
    () => (document.documentElement.dataset.adminTheme === "dark" ? "dark" : "light"),
    () => "light",
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Auto / Light / Dark switch for the admin sidebar. Auto follows sunset and sunrise. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [sun, setSun] = useState<{ sunrise: number; sunset: number } | null>(null);

  useEffect(() => {
    setMode(readMode());
    // If the browser already allows location, use it for an exact sunset (never prompts).
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => {
      if (p.state === "granted") navigator.geolocation.getCurrentPosition((pos) => {
        try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude })); } catch {}
      });
    }).catch(() => {});
    // leaving the admin portal: don't carry the admin theme onto the public site
    return () => { delete document.documentElement.dataset.adminTheme; };
  }, []);

  useEffect(() => {
    const apply = () => {
      const loc = read(LOC_KEY, DEFAULT_LOC);
      const r = resolveTheme(mode, loc.lat, loc.lon, Date.now());
      document.documentElement.dataset.adminTheme = r.theme;
      setSun({ sunrise: r.sunrise, sunset: r.sunset });
    };
    apply();
    const t = setInterval(apply, 60_000); // auto mode flips at sunset/sunrise without a reload
    return () => clearInterval(t);
  }, [mode]);

  const choose = (m: ThemeMode) => { setMode(m); try { localStorage.setItem(THEME_KEY, m); } catch {} };
  const OPTS: [ThemeMode, string, string][] = [["auto", "Auto", "◐"], ["light", "Light", "☀"], ["dark", "Dark", "☾"]];

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/80">Theme</p>
      <div role="radiogroup" aria-label="Admin theme" className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
        {OPTS.map(([m, label, icon]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => choose(m)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${mode === m ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
            <span aria-hidden className="mr-1">{icon}</span>{label}
          </button>
        ))}
      </div>
      {mode === "auto" && sun && <p className="mt-2 text-[11px] leading-snug text-white/55">Dark after sunset ({time(sun.sunset)}), light after sunrise ({time(sun.sunrise)}).</p>}
    </div>
  );
}
