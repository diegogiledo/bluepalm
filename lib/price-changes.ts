import "server-only";
import { db, one } from "./db";
import { newId } from "./auth";
import { saveDocument } from "./files";
import { sendEmail, siteUrl } from "./notify";
import { addMessage, money, now } from "./services";
import { amountDue, listPrice } from "./pricing";
import type { Booking, Customer, Detailer, PriceChange } from "./types";

/**
 * A detailer can ask to change a job's price (car dirtier or bigger than
 * described). The customer approves or declines in their account; nothing
 * changes until they approve. Only one open request per booking, only
 * before the job is paid, and at most double the current price.
 */
export class PriceChangeError extends Error {}

export async function requestPriceChange(d: Detailer, bookingId: string, newPrice: number, reason: string, photo: File | null): Promise<PriceChange> {
  const b = await one("bookings", { id: bookingId });
  if (!b || b.detailer_id !== d.id || b.status !== "assigned") throw new PriceChangeError("You can only change the price of your own upcoming job.");
  if (["paid", "refunded", "partially_refunded"].includes(b.payment_status)) throw new PriceChangeError("This job is already paid.");
  const current = listPrice(b) ?? 0;
  if (!(newPrice > 0) || newPrice > Math.max(current * 2, current + 150)) throw new PriceChangeError(`Enter a price up to ${money(Math.max(current * 2, current + 150))}.`);
  if (Math.round(newPrice) === Math.round(current)) throw new PriceChangeError("That's the current price.");
  if (reason.trim().length < 10) throw new PriceChangeError("Tell the customer why (at least a short sentence).");
  if ((await db.select("price_changes", { booking_id: b.id })).some((p) => p.status === "pending")) throw new PriceChangeError("There's already a request waiting for the customer.");
  let photo_file: string | null = null;
  if (photo && photo.size > 0) {
    try { photo_file = await saveDocument(photo); } catch (e) { throw new PriceChangeError(String((e as Error).message)); }
  }
  const pc: PriceChange = {
    id: newId(), booking_id: b.id, detailer_id: d.id, old_price: current, new_price: Math.round(newPrice * 100) / 100,
    reason: reason.trim().slice(0, 500), photo_file, status: "pending", created_at: now(), decided_at: null,
  };
  await db.insert("price_changes", pc);
  await addMessage(b.id, "detailer", `Price change requested: ${money(current)} → ${money(pc.new_price)}. Reason: ${pc.reason}`);
  const c = await one("customers", { id: b.customer_id });
  if (c) {
    const due = amountDue({ ...b, final_price: pc.new_price });
    await sendEmail(c.email, `Please approve a price change for ${b.ref}`, [
      `Hi ${c.name.split(" ")[0]}, your detailer asked to change the price of your ${b.package_name} on ${b.date}.`,
      `New price: ${money(pc.new_price)} (was ${money(current)})${due != null && due !== pc.new_price ? `, ${money(due)} after your promotion` : ""}.`,
      `Reason: ${pc.reason}`,
      "Nothing changes unless you approve. If you decline, the job stays at the original price.",
    ], { label: "Review the request", url: siteUrl(`/account/enter?token=${c.access_token}`) });
  }
  if (process.env.ADMIN_NOTIFY_EMAIL) {
    await sendEmail(process.env.ADMIN_NOTIFY_EMAIL, `Price change requested on ${b.ref}`, [`${money(current)} → ${money(pc.new_price)}: ${pc.reason}`], { label: "Open booking", url: siteUrl(`/admin/bookings/${b.id}`) });
  }
  return pc;
}

/** The customer's answer. Approving sets the job's price; declining keeps it. */
export async function decidePriceChange(c: Customer, changeId: string, approve: boolean) {
  const pc = await one("price_changes", { id: changeId });
  if (!pc || pc.status !== "pending") return null;
  const b = await one("bookings", { id: pc.booking_id });
  if (!b || b.customer_id !== c.id) return null;
  // conditional update: a double-click can't approve twice
  const done = await db.update("price_changes", { id: pc.id, status: "pending" }, { status: approve ? "approved" : "declined", decided_at: now() });
  if (!done.length) return null;
  if (approve) await db.update("bookings", { id: b.id }, { final_price: pc.new_price });
  await addMessage(b.id, "customer", approve ? `Price change approved: ${money(pc.new_price)}.` : `Price change declined; the job stays at ${money(pc.old_price)}.`);
  const d = await one("detailers", { id: pc.detailer_id });
  if (d) {
    await sendEmail(d.email, approve ? `Approved: ${b.ref} is now ${money(pc.new_price)}` : `Declined: ${b.ref} stays at ${money(pc.old_price)}`, [
      approve ? "The customer approved your new price. It will be charged when you mark the job complete."
        : "The customer declined the new price. Do the job at the original price, or message BluePalm from your portal if you can't.",
    ], { label: "Open my portal", url: siteUrl(`/detailer/enter?token=${d.access_token}`) });
  }
  return approve ? "approved" : "declined";
}

export const pendingChangeFor = async (b: Pick<Booking, "id">) => (await db.select("price_changes", { booking_id: b.id })).find((p) => p.status === "pending") ?? null;
