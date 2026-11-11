export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1264D6" />
      <path d="M32 50V28" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 28c-3-8-10-11-18-9 6 1 11 4 13 9M32 28c3-8 10-11 18-9-6 1-11 4-13 9M32 27c-1-7 2-12 8-15-3 4-4 8-5 13M32 27c1-7-2-12-8-15 3 4 4 8 5 13" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 52h28" stroke="#20A575" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-display text-lg font-extrabold leading-none ${light ? "text-white" : "text-navy"}`}>
        BluePalm<span className={`block text-[10px] font-bold uppercase tracking-[0.22em] ${light ? "text-white/70" : "text-brand"}`}>Auto Care</span>
      </span>
    </span>
  );
}
