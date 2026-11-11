import "server-only";
import { db } from "./db";
import { newId } from "./auth";
import { BRAND } from "./config";

/**
 * Email via Resend and SMS via Twilio (REST APIs, no SDKs).
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

async function record(channel: "email" | "sms", to: string, subject: string, body: string, status: "sent" | "logged" | "failed", error = "") {
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
        from: process.env.EMAIL_FROM || "BluePalm Auto Care <bookings@bluepalmautocare.com>",
        to: [to], subject: title, html: emailHtml(title, lines, cta), text,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    await record("email", to, title, text, "sent");
  } catch (e) {
    await record("email", to, title, text, "failed", String(e));
  }
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!to) return;
  if (!sid || !token || !from) return record("sms", to, "", body, "logged");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: toE164(to), From: from, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    await record("sms", to, "", body, "sent");
  } catch (e) {
    await record("sms", to, "", body, "failed", String(e));
  }
}

export function toE164(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : `+${d}`;
}

export const siteUrl = (p: string) => `${BRAND.siteUrl.replace(/\/$/, "")}${p}`;
