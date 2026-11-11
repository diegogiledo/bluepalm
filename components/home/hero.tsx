"use client";
import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ScrubCar } from "./scrub-car";

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const p: Record<string, React.ReactNode> = {
    shield: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zm-3.5 9l2.5 2.5 4.5-5" />,
    tag: <path d="M3 12V4h8l10 10-8 8L3 12zm5-4.5h.01" />,
    clock: <path d="M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    pin: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
    home: <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z" />,
    calendar: <path d="M4 6h16v14H4zM8 3v4m8-4v4M4 10h16" />,
    chat: <path d="M4 5h16v11H8l-4 4V5z" />,
    star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
    car: <path d="M5 16h14M3 16v-3l2-5h14l2 5v3M6.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm11 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
    user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />,
    repeat: <path d="M4 9a8 8 0 0114-3l2 2m0-5v5h-5M20 15a8 8 0 01-14 3l-2-2m0 5v-5h5" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {p[name]}
    </svg>
  );
}

function Palm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 320" className={className} aria-hidden="true" fill="currentColor">
      <path d="M100 320c4-60 6-120 2-190h6c6 70 4 130-2 190z" />
      <path d="M104 132c-20-30-60-40-100-30 34 2 62 14 82 36zM104 132c22-30 62-40 96-28-32 0-60 12-80 34zM104 130c-6-40 6-80 40-110-20 34-28 70-26 110zM104 130c4-40-12-78-46-104 22 30 32 66 32 106zM104 134c-30-6-62 8-84 36 26-18 54-26 82-22zM106 134c30-6 60 8 80 34-24-16-52-24-78-20z" />
    </svg>
  );
}

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero({ fromPrice }: { fromPrice: number | null }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBack = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const yText = useTransform(scrollYProgress, [0, 1], [0, 50]);

  return (
    <section ref={ref} className="bg-hero relative isolate overflow-clip pb-12 pt-28 text-white sm:pt-32">
      {/* parallax decoration */}
      <motion.div style={{ y: yBack }} className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -right-24 top-0 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(255,214,120,0.4),rgba(255,214,120,0)_65%)]" />
        <div className="absolute -left-40 bottom-0 h-[380px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(32,165,117,0.32),rgba(32,165,117,0)_70%)]" />
        <Palm className="absolute -left-6 bottom-0 h-[360px] text-white/[0.06] sm:h-[480px]" />
        <Palm className="absolute bottom-0 right-[3%] h-[300px] -scale-x-100 text-white/[0.06] sm:h-[420px]" />
      </motion.div>

      <motion.div style={{ y: yText }} className="container-x text-center">
        <h1 className="font-display text-[2.5rem] font-extrabold leading-[1.04] sm:text-6xl lg:text-7xl">
          {["A cleaner car.", "Right at your door."].map((line, i) => (
            <motion.span key={line} className="block" initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.15, ease }}>
              {i === 1 ? <span className="bg-gradient-to-r from-white via-sky-200 to-[#8ff0c8] bg-clip-text text-transparent">{line}</span> : line}
            </motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.4 }}
          className="mx-auto mt-5 max-w-md text-lg text-white/80">
          Mobile car detailing at your home or office{fromPrice != null ? `, from $${fromPrice}` : ""}.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/book" className="btn bg-white px-8 py-4 text-brand shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:bg-sky">BOOK YOUR DETAIL</Link>
          <Link href="#services" className="btn px-8 py-4 text-white ring-1 ring-white/35 hover:-translate-y-0.5 hover:bg-white/10">EXPLORE SERVICES</Link>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 50, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, delay: 0.35, ease }} className="container-x mt-4">
        <ScrubCar />
      </motion.div>
    </section>
  );
}
