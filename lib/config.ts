// Static brand + content configuration. Business-editable values (prices,
// ZIPs, commission) live in the database and are managed from /admin; the
// values here are only the initial seed and marketing copy.

export const BRAND = {
  name: "BluePalm Auto Care",
  short: "BluePalm",
  tagline: "A cleaner car. Right at your door.",
  region: "Tampa Bay & Sarasota, Florida",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@bluepalmautocare.com",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

export type PackageSeed = {
  id: string;
  name: string;
  tagline: string;
  base_price: number; // whole dollars, "starting at"
  features: string[];
  duration_hint: string;
  sort: number;
  active: boolean;
};

export const PACKAGE_SEED: PackageSeed[] = [
  {
    id: "express",
    name: "Express Refresh",
    tagline: "A quick, thorough exterior clean with a light interior touch.",
    base_price: 59,
    features: [
      "Exterior hand wash",
      "Wheel and tire cleaning",
      "Exterior windows",
      "Light interior wipe-down",
    ],
    duration_hint: "About 1 hour",
    sort: 1,
    active: true,
  },
  {
    id: "inside-out",
    name: "Inside & Out",
    tagline: "Our most popular full clean, inside and out.",
    base_price: 149,
    features: [
      "Everything in Express Refresh",
      "Interior vacuum",
      "Dashboard and console cleaning",
      "Interior windows",
      "Door jamb cleaning",
    ],
    duration_hint: "About 2–3 hours",
    sort: 2,
    active: true,
  },
  {
    id: "premium",
    name: "Premium Detail",
    tagline: "The deepest clean, with extra care on every surface.",
    base_price: 229,
    features: [
      "Everything in Inside & Out",
      "Detailed cracks and crevices",
      "Extra paint-safe cleaning",
      "Tire shine",
      "Additional finishing touches",
    ],
    duration_hint: "About 3–4 hours",
    sort: 3,
    active: true,
  },
];

export const VEHICLES = [
  { id: "sedan", label: "Sedan" },
  { id: "coupe", label: "Coupe" },
  { id: "small-suv", label: "Small SUV" },
  { id: "large-suv", label: "Large SUV" },
  { id: "pickup", label: "Pickup truck" },
  { id: "van", label: "Van" },
  { id: "other", label: "Other" },
] as const;

export const TIME_WINDOWS = [
  { id: "morning", label: "Morning", hint: "8am – 11am" },
  { id: "midday", label: "Midday", hint: "11am – 2pm" },
  { id: "afternoon", label: "Afternoon", hint: "2pm – 5pm" },
] as const;

export const FREQUENCIES = [
  { id: "none", label: "One-time", hint: "Just this visit" },
  { id: "biweekly", label: "Every two weeks", hint: "Keep it consistently clean" },
  { id: "monthly", label: "Monthly", hint: "Monthly maintenance wash" },
] as const;

export type County = {
  slug: string;
  name: string;
  cities: { name: string; lat: number; lon: number }[];
  nearby?: boolean;
};

export const COUNTIES: County[] = [
  {
    slug: "manatee-county",
    name: "Manatee County",
    cities: [
      { name: "Parrish", lat: 27.587, lon: -82.425 },
      { name: "Palmetto", lat: 27.521, lon: -82.572 },
      { name: "Ellenton", lat: 27.522, lon: -82.528 },
      { name: "Bradenton", lat: 27.47, lon: -82.575 },
      { name: "Lakewood Ranch", lat: 27.42, lon: -82.4 },
    ],
  },
  {
    slug: "sarasota-county",
    name: "Sarasota County",
    cities: [
      { name: "Sarasota", lat: 27.336, lon: -82.531 },
      { name: "Osprey", lat: 27.196, lon: -82.49 },
      { name: "Nokomis", lat: 27.119, lon: -82.444 },
      { name: "Venice", lat: 27.08, lon: -82.43 },
      { name: "North Port", lat: 27.044, lon: -82.236 },
    ],
  },
  {
    slug: "pinellas-county",
    name: "Pinellas County",
    nearby: true,
    cities: [
      { name: "St. Petersburg", lat: 27.773, lon: -82.64 },
      { name: "Gulfport", lat: 27.748, lon: -82.703 },
    ],
  },
  {
    slug: "hillsborough-county",
    name: "Hillsborough County",
    nearby: true,
    cities: [
      { name: "Tampa", lat: 27.95, lon: -82.457 },
      { name: "Brandon", lat: 27.938, lon: -82.286 },
      { name: "Riverview", lat: 27.866, lon: -82.326 },
    ],
  },
];

// Initial ZIP configuration seeded into the database for the launch regions.
// The administrator can enable/disable or add ZIPs at /admin/areas — the public
// ZIP checker only ever reads the database, never this list directly.
export const ZIP_SEED: { zip: string; city: string; county: string }[] = [
  ...[["34219", "Parrish"], ["34221", "Palmetto"], ["34222", "Ellenton"],
    ["34201", "Bradenton"], ["34203", "Bradenton"], ["34205", "Bradenton"], ["34207", "Bradenton"],
    ["34208", "Bradenton"], ["34209", "Bradenton"], ["34210", "Bradenton"],
    ["34202", "Lakewood Ranch"], ["34211", "Lakewood Ranch"], ["34212", "Lakewood Ranch"]]
    .map(([zip, city]) => ({ zip, city, county: "Manatee County" })),
  ...[["34231", "Sarasota"], ["34232", "Sarasota"], ["34233", "Sarasota"], ["34234", "Sarasota"],
    ["34235", "Sarasota"], ["34236", "Sarasota"], ["34237", "Sarasota"], ["34238", "Sarasota"],
    ["34239", "Sarasota"], ["34240", "Sarasota"], ["34241", "Sarasota"], ["34242", "Sarasota"],
    ["34243", "Sarasota"], ["34229", "Osprey"], ["34275", "Nokomis"], ["34285", "Venice"],
    ["34292", "Venice"], ["34293", "Venice"], ["34286", "North Port"], ["34287", "North Port"],
    ["34288", "North Port"], ["34289", "North Port"], ["34291", "North Port"]]
    .map(([zip, city]) => ({ zip, city, county: "Sarasota County" })),
  ...[["33701", "St. Petersburg"], ["33702", "St. Petersburg"], ["33703", "St. Petersburg"],
    ["33704", "St. Petersburg"], ["33705", "St. Petersburg"], ["33710", "St. Petersburg"],
    ["33712", "St. Petersburg"], ["33713", "St. Petersburg"], ["33714", "St. Petersburg"],
    ["33716", "St. Petersburg"], ["33707", "Gulfport"], ["33711", "Gulfport"]]
    .map(([zip, city]) => ({ zip, city, county: "Pinellas County" })),
  ...[["33602", "Tampa"], ["33603", "Tampa"], ["33604", "Tampa"], ["33605", "Tampa"], ["33606", "Tampa"],
    ["33607", "Tampa"], ["33609", "Tampa"], ["33610", "Tampa"], ["33611", "Tampa"], ["33612", "Tampa"],
    ["33613", "Tampa"], ["33614", "Tampa"], ["33615", "Tampa"], ["33616", "Tampa"], ["33617", "Tampa"],
    ["33618", "Tampa"], ["33619", "Tampa"], ["33624", "Tampa"], ["33625", "Tampa"], ["33626", "Tampa"],
    ["33629", "Tampa"], ["33634", "Tampa"], ["33635", "Tampa"], ["33637", "Tampa"], ["33647", "Tampa"],
    ["33510", "Brandon"], ["33511", "Brandon"], ["33569", "Riverview"], ["33578", "Riverview"],
    ["33579", "Riverview"]]
    .map(([zip, city]) => ({ zip, city, county: "Hillsborough County" })),
];

// Draft policies. Shown on the site and in confirmations from one place so
// the owner can finalise wording once. See README "Content to confirm".
export const POLICIES = {
  cancellation:
    "You can cancel or reschedule free of charge up to 24 hours before your appointment. Changes made inside 24 hours may be subject to a late-change fee, which we'll always tell you about before it applies.",
  guarantee:
    "If something isn't right, contact us within 24 hours of your service. We'll review it and work with you to make it right — including sending a detailer back to fix missed areas.",
};

export const LOYALTY = {
  pointsPerDollar: 1,
  rewardThreshold: 500,
  rewardValue: 25,
};

// Promotions. WELCOME10 is offered by the driving car on the homepage and
// only applies to a customer's first booking (checked on the server).
export const PROMOS: Record<string, { pct: number; label: string; firstBookingOnly: boolean }> = {
  WELCOME10: { pct: 10, label: "10% off your first cleaning", firstBookingOnly: true },
};
export const WELCOME_PROMO = "WELCOME10";
