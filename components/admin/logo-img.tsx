"use client";
import { useState } from "react";

/** Detailer logo from their own website; hidden if it fails to load so the initials show. */
export function LogoImg({ src }: { src: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setOk(false)} className="absolute inset-0 size-full bg-white object-contain p-1" />;
}
