"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { TIME_WINDOWS } from "@/lib/config";

type State = { ok?: string; error?: string } | null;
type Action = (prev: State, form: FormData) => Promise<State>;

export function Submit({ children, className = "btn-primary", pending: pendingLabel = "Working…" }: { children: React.ReactNode; className?: string; pending?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? pendingLabel : children}</button>;
}

export function MagicLinkForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block"><span className="label">Email address</span>
        <input name="email" type="email" required autoComplete="email" className="input" /></label>
      <Submit className="btn-primary w-full" pending="Sending…">Email me a sign-in link</Submit>
      {state?.ok && <p className="rounded-2xl bg-palm/10 p-3 text-sm text-navy" role="status">{state.ok}</p>}
      {state?.error && <p className="field-error" role="alert">{state.error}</p>}
    </form>
  );
}

export function RebookForm({ action, bookingId, minDate }: { action: Action; bookingId: string; minDate: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  if (state?.ok) return <p className="text-sm font-semibold text-palm" role="status">{state.ok}</p>;
  if (!open) return <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>Rebook</button>;
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={bookingId} />
      <label className="text-xs font-semibold">Date<input type="date" name="date" min={minDate} required className="input mt-1 py-2" /></label>
      <label className="text-xs font-semibold">Time
        <select name="time_window" required className="input mt-1 py-2">{TIME_WINDOWS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </label>
      <Submit className="btn-primary btn-sm" pending="Sending…">Request</Submit>
      {state?.error && <p className="field-error w-full">{state.error}</p>}
    </form>
  );
}
