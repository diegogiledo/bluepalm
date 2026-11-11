export type LocationPage = {
  slug: string; name: string; county: string; title: string; description: string; h1: string;
  intro: string; communities: string[]; highlights: string[];
};

export const LOCATIONS: LocationPage[] = [
  {
    slug: "manatee-county", name: "Manatee County", county: "Manatee County",
    title: "Mobile Car Detailing in Manatee County — Parrish, Bradenton & Lakewood Ranch",
    description: "Mobile car wash and detailing at your home or office in Parrish, Bradenton, Palmetto, Ellenton and Lakewood Ranch, FL. Book online with BluePalm.",
    h1: "Mobile car detailing in Manatee County",
    intro: "From new-build neighborhoods in Parrish and Lakewood Ranch to driveways across Bradenton, Palmetto and Ellenton, BluePalm brings a vetted mobile detailer to you. Skip the car wash line — book online and we'll come to your home or office.",
    communities: ["Parrish", "Palmetto", "Bradenton", "Ellenton", "Lakewood Ranch"],
    highlights: ["Mobile car detailing Parrish FL", "Mobile car wash Bradenton FL", "Car detailing Lakewood Ranch FL"],
  },
  {
    slug: "sarasota-county", name: "Sarasota County", county: "Sarasota County",
    title: "Mobile Detailing in Sarasota County — Sarasota, Venice & North Port",
    description: "Professional mobile car detailing in Sarasota, Venice, North Port, Nokomis and Osprey, FL. Transparent starting prices. Book online in minutes.",
    h1: "Mobile detailing in Sarasota County",
    intro: "Salt air, sand and summer storms are tough on any vehicle. BluePalm connects Sarasota, Venice, North Port, Nokomis and Osprey drivers with vetted mobile detailers who come to your driveway, condo lot or workplace.",
    communities: ["Sarasota", "Venice", "North Port", "Nokomis", "Osprey"],
    highlights: ["Mobile detailing Sarasota FL", "Mobile car wash Venice FL", "Car detailing North Port FL"],
  },
  {
    slug: "st-petersburg", name: "St. Petersburg", county: "Pinellas County",
    title: "Car Detailing in St. Petersburg, FL — Mobile Service at Your Door",
    description: "Mobile car detailing in St. Petersburg, Gulfport and nearby Pinellas communities. Exterior washes to full interior details, booked online with BluePalm.",
    h1: "Mobile car detailing in St. Petersburg",
    intro: "Whether you're downtown, in the Old Northeast or out toward Gulfport, BluePalm sends a vetted detailer to wherever your car is parked. Book a quick exterior refresh or a full interior detail in a few taps.",
    communities: ["St. Petersburg", "Gulfport", "Nearby Pinellas communities"],
    highlights: ["Car detailing St. Petersburg FL", "Mobile car wash Gulfport FL", "Car detailing near me"],
  },
  {
    slug: "tampa", name: "Tampa", county: "Hillsborough County",
    title: "Mobile Car Detailing in Tampa, FL — Brandon & Riverview Too",
    description: "Mobile car detailing in Tampa, Brandon and Riverview, FL. Vetted independent detailers come to your home or office. Book online with BluePalm.",
    h1: "Mobile car detailing in Tampa",
    intro: "Tampa traffic is enough of a hassle. Let BluePalm bring the detail to you — at home in South Tampa, at the office in Westshore, or in Brandon and Riverview. Pick a package, choose a time window and we'll handle the rest.",
    communities: ["Tampa", "Brandon", "Riverview", "Nearby Hillsborough communities"],
    highlights: ["Mobile car detailing Tampa FL", "Mobile car wash Brandon FL", "Car detailing Riverview FL"],
  },
];
