// In-memory fixed-window limiter. Fine for a single instance; use a shared
// store (e.g. Upstash/Redis) when running multiple server instances.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
  h.n += 1;
  return h.n <= max;
}
