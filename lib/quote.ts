/**
 * Price quote for a booking (pure, usable in the browser and on the server):
 * service base price + vehicle-size fee + chosen add-ons.
 * Promotions (e.g. WELCOME10) are applied on top by lib/pricing.ts amountDue.
 */
export type Size = "small" | "medium" | "large";
export type Addon = { id: string; label: string; price: number; hint: string; active: boolean };
export type PricingRules = {
  sizeFees: Record<Size, number>;
  addons: Addon[];
  /** Raise the detailer payout when nobody accepts: commission drops by `step` points each time, up to `maxBoosts` times. */
  boost: { enabled: boolean; afterHours: number; step: number; maxBoosts: number; minCommission: number };
};

// Defaults set from 36 local detailers' published prices (Nov 2026): SUV ≈ +$25 and
// truck ≈ +$40 over a sedan; add-ons a little under the local median so BluePalm stays competitive.
export const DEFAULT_RULES: PricingRules = {
  sizeFees: { small: 0, medium: 25, large: 40 },
  addons: [
    { id: "pet_hair", label: "Pet hair removal", price: 45, hint: "Dog or cat hair embedded in seats and carpet", active: true },
    { id: "heavy_dirt", label: "Heavy dirt, sand or mud", price: 30, hint: "Beach sand, mud, very soiled interior", active: true },
    { id: "odor", label: "Odor treatment", price: 60, hint: "Smoke, pets or food smells (ozone / enzyme)", active: true },
    { id: "shampoo", label: "Seat & carpet shampoo", price: 70, hint: "Deep extraction for stains", active: true },
    { id: "clay_bar", label: "Clay bar & paint decontamination", price: 60, hint: "Smooth, glossy paint before wax", active: true },
    { id: "engine_bay", label: "Engine bay cleaning", price: 65, hint: "Degrease and dress the engine bay", active: true },
    { id: "headlights", label: "Headlight restoration", price: 75, hint: "Clear foggy, yellowed headlights", active: true },
    { id: "leather", label: "Leather conditioning", price: 30, hint: "Clean and condition leather seats", active: true },
  ],
  boost: { enabled: true, afterHours: 3, step: 5, maxBoosts: 2, minCommission: 10 },
};

export type Quote = { base: number; sizeFee: number; addons: { id: string; label: string; price: number }[]; total: number };

/** What a booking costs before promotions. Unknown or inactive add-ons are ignored. */
export function quote(rules: PricingRules, basePrice: number, size: string, addonIds: string[]): Quote {
  const sizeFee = rules.sizeFees[size as Size] ?? 0;
  const addons = [...new Set(addonIds)].map((id) => rules.addons.find((a) => a.id === id && a.active)).filter((a): a is Addon => Boolean(a))
    .map(({ id, label, price }) => ({ id, label, price }));
  return { base: basePrice, sizeFee, addons, total: basePrice + sizeFee + addons.reduce((s, a) => s + a.price, 0) };
}
