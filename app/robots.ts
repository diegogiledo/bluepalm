import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/detailer", "/api"] },
    sitemap: `${BRAND.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
