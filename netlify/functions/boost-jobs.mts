// Netlify scheduled function: once an hour, raise the payout on paid jobs no detailer has accepted yet.
// Needs CRON_SECRET set in Netlify (any long random string); the site checks it.
export default async () => {
  const base = process.env.URL; // the site's main address, set by Netlify
  if (!base || !process.env.CRON_SECRET) return new Response("not configured", { status: 200 });
  const res = await fetch(`${base}/api/cron/boost`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  return new Response(await res.text(), { status: res.status });
};

export const config = { schedule: "@hourly" };
