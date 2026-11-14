import Link from "next/link";
import { Logo } from "@/components/logo";

/** Branded "page not found" screen with a way back home. */
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-sky to-white px-4 py-16">
      <div className="w-full max-w-md text-center">
        <Link href="/" aria-label="BluePalm Auto Care home" className="inline-block"><Logo /></Link>
        <h1 className="mt-10 font-display text-4xl font-extrabold">Page not found</h1>
        <p className="mt-3 text-ink-muted">This page doesn&apos;t exist or the link has expired.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">Go to the homepage</Link>
          <Link href="/book" className="btn-ghost">Book a detail</Link>
        </div>
      </div>
    </div>
  );
}
