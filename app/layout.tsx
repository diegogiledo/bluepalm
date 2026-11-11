import type { Metadata, Viewport } from "next";
import { Manrope, DM_Sans } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import { BRAND, COUNTIES } from "@/lib/config";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["600", "700", "800"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: {
    default: "BluePalm Auto Care | Mobile Car Detailing in Tampa Bay & Sarasota",
    template: "%s | BluePalm Auto Care",
  },
  description:
    "Professional mobile car detailing at your home or office across Tampa, St. Petersburg, Bradenton, Parrish, Lakewood Ranch, Sarasota and Venice. Book online in minutes.",
  keywords: [
    "mobile car detailing Tampa FL", "mobile car wash Bradenton FL", "mobile detailing Sarasota FL",
    "car detailing St. Petersburg FL", "mobile car detailing Parrish FL", "car detailing near me",
  ],
  openGraph: { type: "website", siteName: BRAND.name, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#1264D6", width: "device-width", initialScale: 1 };

// Structured data: a service-area business (no street address or ratings are
// claimed — add aggregateRating only once genuine reviews exist).
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoWash",
  name: BRAND.name,
  slogan: BRAND.tagline,
  url: BRAND.siteUrl,
  email: BRAND.supportEmail,
  priceRange: "$$",
  areaServed: COUNTIES.flatMap((c) => [
    { "@type": "AdministrativeArea", name: `${c.name}, FL` },
    ...c.cities.map((city) => ({ "@type": "City", name: `${city.name}, FL` })),
  ]),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSans.variable} antialiased`}>
      <body className="min-h-screen">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
