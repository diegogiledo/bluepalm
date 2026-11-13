import "server-only";
import { db } from "./db";
import { newId } from "./auth";
import { BRAND } from "./config";

/**
 * Email via Resend (REST API, no SDK).
 * Every message is recorded in the `outbox` table. Without API keys the
 * message is only logged (status "logged") — visible at /admin/outbox.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function emailHtml(title: string, lines: string[], cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#EAF3FF;font-family:Arial,sans-serif;color:#0B2342">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:20px;color:#1264D6;margin-bottom:16px">BluePalm Auto Care</div>
    <div style="background:#fff;border-radius:16px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      ${lines.map((l) => `<p style="line-height:1.55;margin:0 0 10px">${esc(l)}</p>`).join("")}
      ${cta ? `<p style="margin-top:20px"><a href="${esc(cta.url)}" style="background:#1264D6;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${esc(cta.label)}</a></p>` : ""}
    </div>
    <p style="font-size:12px;color:#5b6b80;margin-top:16px">${esc(BRAND.tagline)} · ${esc(BRAND.region)}</p>
  </div></body></html>`;
}

async function record(channel: "email", to: string, subject: string, body: string, status: "sent" | "logged" | "failed", error = "") {
  await db.insert("outbox", { id: newId(), channel, to, subject, body, status, error, created_at: new Date().toISOString() });
}

export async function sendEmail(to: string, title: string, lines: string[], cta?: { label: string; url: string }) {
  const text = [...lines, cta ? `${cta.label}: ${cta.url}` : ""].filter(Boolean).join("\n\n");
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email:logged] to=${to} subject="${title}"`);
    return record("email", to, title, text, "logged");
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "BluePalm Auto Care <bookings@bluepalm.shop>",
        to: [to], subject: title, html: emailHtml(title, lines, cta), text,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    await record("email", to, title, text, "sent");
  } catch (e) {
    await record("email", to, title, text, "failed", String(e));
  }
}

export const siteUrl = (p: string) => `${BRAND.siteUrl.replace(/\/$/, "")}${p}`;

// ---------- partner emails (local detailing businesses) ----------
/** Postal address required in every business-outreach email (CAN-SPAM). */
export const mailingAddress = () => (process.env.BUSINESS_MAILING_ADDRESS ?? "").trim();

export type PartnerEmail = { to: string; title: string; html: string; text: string; unsubscribeUrl: string };

/** Footer for every partner email: why they got it, unsubscribe, postal address (CAN-SPAM). */
export function partnerFooterHtml(unsub: string) {
  return `<p style="font-size:12px;line-height:1.5;color:#5b6b80;margin:16px 0 0">You got this because ${esc(BRAND.name)} found your business offering car detailing in the Tampa Bay–Sarasota area. ` +
    `Don't want job emails? <a href="${esc(unsub)}" style="color:#5b6b80">Unsubscribe</a> and we won't email you again.<br>${esc(BRAND.name)} · ${esc(mailingAddress() || "[your mailing address goes here]")}</p>`;
}
export const partnerFooterText = (unsub: string) => `Don't want job emails? Unsubscribe: ${unsub}\n${BRAND.name} · ${mailingAddress()}`;
export { esc as escapeHtml };

/**
 * Send job emails to local detailers, up to 100 per Resend call (stays under its
 * per-second limit). Each carries an unsubscribe link, a one-click
 * List-Unsubscribe header and the postal address. Returns how many were
 * accepted by Resend (or logged when no key is set).
 */
export async function sendPartnerEmails(items: PartnerEmail[]): Promise<number> {
  if (!items.length) return 0;
  const key = process.env.RESEND_API_KEY;
  const textOf = (m: PartnerEmail) => m.text;
  let ok = 0;
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    if (!key) {
      for (const m of chunk) { console.info(`[email:logged] to=${m.to} subject="${m.title}"`); await record("email", m.to, m.title, textOf(m), "logged"); }
      ok += chunk.length;
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((m) => ({
          from: process.env.EMAIL_FROM || "BluePalm Auto Care <bookings@bluepalm.shop>",
          to: [m.to], subject: m.title, text: textOf(m),
          html: m.html,
          headers: { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }))),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      for (const m of chunk) await record("email", m.to, m.title, textOf(m), "sent");
      ok += chunk.length;
    } catch (e) {
      for (const m of chunk) await record("email", m.to, m.title, textOf(m), "failed", String(e));
    }
  }
  return ok;
}

/** Record an email in the outbox without sending it (local test mode). */
export async function logEmail(to: string, title: string, text: string) {
  console.info(`[email:test-mode, not sent] to=${to} subject="${title}"`);
  await record("email", to, `[TEST, not sent] ${title}`, text, "logged");
}
