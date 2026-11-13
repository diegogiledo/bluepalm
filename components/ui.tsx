import type { Message } from "@/lib/types";

const STATUS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800", confirmed: "bg-sky text-brand", assigned: "bg-indigo-100 text-indigo-700",
  completed: "bg-palm/15 text-palm-600", cancelled: "bg-navy/8 text-navy/60",
  pending: "bg-amber-100 text-amber-800", approved: "bg-palm/15 text-palm-600", rejected: "bg-red-100 text-red-700", suspended: "bg-navy/8 text-navy/60",
  active: "bg-palm/15 text-palm-600", paused: "bg-amber-100 text-amber-800",
  unpaid: "bg-navy/8 text-navy/70", card_on_file: "bg-sky text-brand", payment_failed: "bg-red-100 text-red-700", payment_link_sent: "bg-sky text-brand", paid: "bg-palm/15 text-palm-600", refunded: "bg-red-100 text-red-700", partially_refunded: "bg-red-100 text-red-700",
  new: "bg-navy/8 text-navy/70", invited: "bg-amber-100 text-amber-800", opted_in: "bg-palm/15 text-palm-600", unsubscribed: "bg-red-100 text-red-700",
  sent: "bg-palm/15 text-palm-600", logged: "bg-sky text-brand", failed: "bg-red-100 text-red-700",
};
const LABEL: Record<string, string> = { new: "Not invited", opted_in: "Getting jobs", requested: "Awaiting confirmation", payment_link_sent: "Payment link sent", partially_refunded: "Partly refunded", card_on_file: "Card on file", payment_failed: "Payment failed" };

export function Badge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS[status] ?? "bg-navy/8"}`}>{LABEL[status] ?? status.replace(/_/g, " ")}</span>;
}

export function Thread({ messages, viewer }: { messages: Message[]; viewer: "customer" | "detailer" | "admin" }) {
  if (!messages.length) return <p className="text-sm text-ink-muted">No messages yet.</p>;
  const who = { customer: "Customer", detailer: "Detailer", admin: "BluePalm" } as const;
  return (
    <ul className="space-y-2">
      {messages.sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => (
        <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.sender === viewer ? "ml-auto bg-brand text-white" : "bg-sky text-navy"}`}>
          <span className={`block text-[11px] font-bold ${m.sender === viewer ? "text-white/70" : "text-ink-muted"}`}>
            {m.sender === viewer ? "You" : who[m.sender]} · {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
          {m.body}
        </li>
      ))}
    </ul>
  );
}

export const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
