import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";

export default async function Outbox() {
  await requireStaff(["admin"]);
  const rows = (await db.select("outbox")).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-extrabold">Notifications</h1>
        <p className="text-ink-muted">Every email and SMS the platform sends. &ldquo;Logged&rdquo; means the provider isn&apos;t configured yet, so the message was recorded but not delivered.</p></div>
      <ul className="space-y-3">
        {rows.map((m) => (
          <li key={m.id} className="card p-5 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge status={m.status} /><b className="uppercase">{m.channel}</b><span>to {m.to}</span><span className="ml-auto text-xs text-ink-muted">{new Date(m.created_at).toLocaleString()}</span></div>
            {m.subject && <p className="mt-2 font-semibold">{m.subject}</p>}
            <pre className="mt-2 whitespace-pre-wrap font-sans text-ink-muted">{m.body}</pre>
            {m.error && <p className="mt-2 text-xs text-red-600">{m.error}</p>}
          </li>
        ))}
        {!rows.length && <li className="card p-8 text-center text-ink-muted">No notifications yet.</li>}
      </ul>
    </div>
  );
}
