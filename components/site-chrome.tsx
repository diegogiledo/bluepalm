"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Logo } from "./logo";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#services", label: "Services" },
  { href: "/#service-area", label: "Service area" },
  { href: "/#faq", label: "FAQ" },
  { href: "/become-a-detailer", label: "Become a detailer" },
];

export function Nav() {
  const path = usePathname();
  const overHero = path === "/";
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    setHidden(y > 480 && y > prev && !open);
  });
  useEffect(() => setOpen(false), [path]);
  const solid = scrolled || !overHero || open;

  return (
    <motion.header
      animate={{ y: hidden ? -96 : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className={`transition-all duration-300 ${solid ? "bg-white/85 shadow-[0_8px_30px_-12px_rgb(11_35_66/0.18)] backdrop-blur-xl" : "bg-transparent"}`}>
        <nav className={`container-x flex items-center justify-between transition-all duration-300 ${solid ? "h-16" : "h-20"}`} aria-label="Main">
          <Link href="/" aria-label="BluePalm Auto Care home"><Logo light={!solid} /></Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${solid ? "text-navy/80 hover:bg-sky hover:text-brand" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/account/login" className={`hidden rounded-full px-3.5 py-2 text-sm font-semibold sm:block ${solid ? "text-navy/80 hover:text-brand" : "text-white/85 hover:text-white"}`}>My bookings</Link>
            <Link href="/book" className="btn-primary btn-sm hidden sm:inline-flex">BOOK YOUR DETAIL</Link>
            <button
              className={`grid h-11 w-11 place-items-center rounded-full lg:hidden ${solid ? "text-navy hover:bg-sky" : "text-white hover:bg-white/10"}`}
              onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu" aria-label="Menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </nav>
        <AnimatePresence>
          {open && (
            <motion.div id="mobile-menu" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
              <ul className="container-x space-y-1 pb-5">
                {[...LINKS, { href: "/account/login", label: "My bookings" }].map((l, i) => (
                  <motion.li key={l.href} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.04 * i }}>
                    <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 font-semibold text-navy hover:bg-sky">{l.label}</Link>
                  </motion.li>
                ))}
                <li className="pt-2"><Link href="/book" className="btn-primary w-full">BOOK YOUR DETAIL</Link></li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}

/** Floating booking button on small screens, shown after the hero. */
export function FloatingBook() {
  const path = usePathname();
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setShow(y > 520));
  if (path.startsWith("/book") || path.startsWith("/detailer") || path.startsWith("/become")) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed inset-x-4 bottom-4 z-40 sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <Link href="/book" className="btn-primary w-full py-4 text-base shadow-lift">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            BOOK YOUR DETAIL
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
