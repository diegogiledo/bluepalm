/**
 * Admin light/dark theme.
 *
 * Modes: "auto" (dark from sunset to sunrise where you are), "light", "dark".
 * The choice is remembered in this browser (localStorage). Location for
 * sunset: the coordinates saved when the browser has already granted
 * location access, otherwise Tampa Bay.
 *
 * `resolveTheme` is fully self-contained (no imports, no outside variables)
 * because its source is also inlined as a tiny script that runs before the
 * page paints, so there's never a white flash in the dark.
 */
export type ThemeMode = "auto" | "light" | "dark";
export const THEME_KEY = "bp-admin-theme";
export const LOC_KEY = "bp-admin-loc";
export const DEFAULT_LOC = { lat: 27.95, lon: -82.46 }; // Tampa Bay

export function resolveTheme(mode: string, lat: number, lon: number, nowMs: number): { theme: "light" | "dark"; sunrise: number; sunset: number } {
  // Sunrise/sunset from the standard solar position formulas (accurate to about a minute).
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397, J0 = 0.0009;
  const d = nowMs / dayMs - 0.5 + J1970 - J2000;
  const lw = rad * -lon, phi = rad * lat;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const set = J2000 + (J0 + (w + lw) / (2 * Math.PI) + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const rise = noon - (set - noon);
  const toMs = (j: number) => (j + 0.5 - J1970) * dayMs;
  const sunrise = toMs(rise), sunset = toMs(set);
  const dark = mode === "dark" || (mode !== "light" && (nowMs < sunrise || nowMs > sunset));
  return { theme: dark ? "dark" : "light", sunrise, sunset };
}

/** Inline, pre-paint script: sets <html data-admin-theme> from the saved mode and the time of day. */
export const themeBootScript = `(function(){try{var r=${resolveTheme.toString()};var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"auto";var l=JSON.parse(localStorage.getItem(${JSON.stringify(LOC_KEY)})||"null")||${JSON.stringify(DEFAULT_LOC)};document.documentElement.dataset.adminTheme=r(m,l.lat,l.lon,Date.now()).theme;}catch(e){}})();`;
