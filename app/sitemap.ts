import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/config";
import { LOCATIONS } from "@/lib/locations";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = BRAND.siteUrl.replace(/\/$/, "");
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/book`, changeFrequency: "monthly", priority: 0.9 },
    ...LOCATIONS.map((l) => ({ url: `${base}/locations/${l.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
