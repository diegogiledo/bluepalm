import type { Booking } from "./types";

type Priced = Pick<Booking, "final_price" | "price_estimate"> & { discount_pct?: number | null };

/** Price before any promotion: the final price once staff set it, else the starting price. */
export const listPrice = (b: Priced) => b.final_price ?? b.price_estimate;

/** What the customer actually pays (after a promotion such as WELCOME10). */
export function amountDue(b: Priced): number | null {
  const p = listPrice(b);
  if (p == null) return null;
  return Math.round(p * (1 - (b.discount_pct ?? 0) / 100) * 100) / 100;
}
