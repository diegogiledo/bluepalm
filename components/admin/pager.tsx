import Link from "next/link";

/** Page numbers for long admin lists; keeps the current filters/search in the links. */
export function Pager({ page, pages, total, per, base, params }: { page: number; pages: number; total: number; per: number; base: string; params: Record<string, string> }) {
  if (pages <= 1) return <p className="text-xs text-ink-muted">{total} total</p>;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...params, ...(p > 1 ? { page: String(p) } : {}) })}`;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const btn = "rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-navy/10";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pages">
      <p className="text-xs text-ink-muted">Showing {(page - 1) * per + 1}–{Math.min(page * per, total)} of {total}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 ? <Link href={href(page - 1)} className={`${btn} bg-white`}>← Prev</Link> : <span className={`${btn} opacity-40`}>← Prev</span>}
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1.5">
            {i > 0 && n - nums[i - 1] > 1 && <span className="text-ink-muted">…</span>}
            <Link href={href(n)} aria-current={n === page ? "page" : undefined} className={`${btn} ${n === page ? "bg-brand text-white ring-brand" : "bg-white"}`}>{n}</Link>
          </span>
        ))}
        {page < pages ? <Link href={href(page + 1)} className={`${btn} bg-white`}>Next →</Link> : <span className={`${btn} opacity-40`}>Next →</span>}
      </div>
    </nav>
  );
}

/** Which page we're on, clamped to the list size. */
export function pageOf(raw: unknown, total: number, per: number) {
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pages, Math.max(1, Number(typeof raw === "string" ? raw : 1) || 1));
  return { page, pages, start: (page - 1) * per };
}
