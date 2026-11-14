import "server-only";
import { getSetting } from "./db";
import { DEFAULT_RULES, type PricingRules } from "./quote";

/** Current pricing rules (Admin → Pricing & commission), filled in with defaults. */
export async function pricingRules(): Promise<PricingRules> {
  const saved = await getSetting<Partial<PricingRules> | null>("pricing_rules", null);
  return {
    sizeFees: { ...DEFAULT_RULES.sizeFees, ...(saved?.sizeFees ?? {}) },
    addons: saved?.addons?.length ? saved.addons : DEFAULT_RULES.addons,
    boost: { ...DEFAULT_RULES.boost, ...(saved?.boost ?? {}) },
  };
}
