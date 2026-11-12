"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type PickedAddress = { line1: string; city: string; zip: string };
type Suggestion = { id: string; label: string; line1?: string; city?: string; zip?: string };

/**
 * Street-address input with type-ahead suggestions (accessible combobox).
 * Suggestions come from /api/address (Google Places when configured,
 * otherwise OpenStreetMap via Photon). Picking one fills the other fields.
 */
export function AddressAutocomplete({ value, onChange, onPick, invalid }: {
  value: string; onChange: (v: string) => void; onPick: (a: PickedAddress) => void; invalid?: boolean;
}) {
  const id = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [provider, setProvider] = useState<"google" | "census">("census");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const session = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36));
  const skipNext = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.trim();
    if (q.length < 3) { setItems([]); setOpen(false); setHint(""); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const timer = setTimeout(() => ctrl.abort(), 8000); // never spin forever
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(q)}&s=${session.current}`, { signal: ctrl.signal });
        const j = await r.json();
        const list: Suggestion[] = j.suggestions ?? [];
        setItems(list); setProvider(j.provider ?? "census");
        setOpen(list.length > 0); setActive(-1);
        setHint(j.needsNumber ? "Start with your house number, e.g. 123 Palm Ave"
          : !list.length && /^\s*\d/.test(q) && q.length > 8 ? "Not finding it? Newer streets can be missing. Just type your full address and fill in the ZIP code and city below." : "");
      } catch { /* aborted or offline: the customer can keep typing */ }
      clearTimeout(timer);
      setLoading(false);
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function pick(s: Suggestion) {
    setOpen(false); skipNext.current = true;
    if (s.line1 !== undefined) { onPick({ line1: s.line1, city: s.city ?? "", zip: s.zip ?? "" }); return; }
    onChange(s.label.split(",")[0]);
    try {
      const j = await (await fetch(`/api/address?id=${encodeURIComponent(s.id)}&s=${session.current}`)).json();
      if (j.address) { skipNext.current = true; onPick(j.address); }
    } catch {}
    session.current = Math.random().toString(36).slice(2) + Date.now().toString(36); // new Google billing session
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <input
        className={`input pr-10 ${invalid ? "border-red-400" : ""}`} value={value} placeholder="Start typing your address…"
        autoComplete="street-address" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onFocus={() => items.length && setOpen(true)}
      />
      {loading && <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-brand/30 border-t-brand" aria-hidden />}
      <AnimatePresence>
        {open && (
          <motion.ul id={`${id}-list`} role="listbox" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white py-1 shadow-lift ring-1 ring-navy/10">
            {items.map((s, i) => (
              <li key={s.id} id={`${id}-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-sky" : ""}`}>
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /></svg>
                <span><b className="font-semibold text-navy">{s.label.split(",")[0]}</b><span className="text-ink-muted">{s.label.slice(s.label.indexOf(",") > 0 ? s.label.indexOf(",") : s.label.length)}</span></span>
              </li>
            ))}
            <li className="px-4 pb-1.5 pt-1 text-right text-[10px] text-ink-muted" aria-hidden>
              {provider === "google" ? "powered by Google" : "Address data: U.S. Census Bureau"}
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
      {hint && !open && <span className="mt-1.5 block text-xs text-ink-muted" role="status">{hint}</span>}
    </div>
  );
}
