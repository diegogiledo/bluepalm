"use client";
import { startTransition, useActionState, useState } from "react";
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

/** Permanent delete with a confirm box; shows the server's reason if it refuses. */
export function DeleteBookingForm({ action, id, blocked }: { action: Action; id: string; blocked?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-red-300 bg-red-50/50 p-4">
      <input type="hidden" name="id" value={id} />
      <b className="text-sm text-red-700">Delete booking</b>
      <p className="text-xs text-ink-muted">Removes the booking and its messages for good. This can&apos;t be undone.</p>
      {blocked ? <p className="text-xs font-semibold text-red-700">{blocked}</p> : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="1" required className="accent-red-600" /> Yes, permanently delete it</label>
          <Submit className="btn btn-sm bg-red-600 text-white hover:bg-red-700" pending="Deleting…">Delete</Submit>
        </div>
      )}
      {state?.error && <p className="text-xs font-semibold text-red-700" role="alert">{state.error}</p>}
    </form>
  );
}

/** Small form bound to a server action that returns { ok } / { error }. */
export function StateForm({ action, children, className }: { action: Action; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.ok && <p className="mt-2 w-full text-sm font-semibold text-palm-600" role="status">{state.ok}</p>}
      {state?.error && <p className="mt-2 w-full text-sm font-semibold text-red-700" role="alert">{state.error}</p>}
    </form>
  );
}

/** Shrink a phone photo to ~1600px JPEG before upload (keeps requests small on mobile data). */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 600_000) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

/** Detailer: ask the customer to approve a different price, with an optional photo. */
export function PriceChangeForm({ action, bookingId, current }: { action: Action; bookingId: string; current: number }) {
  const [state, formAction] = useActionState(action, null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-3 space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const fd = new FormData(e.currentTarget);
      const photo = fd.get("photo");
      if (photo instanceof File && photo.size) fd.set("photo", await shrinkImage(photo));
      startTransition(() => formAction(fd)); // actions dispatched by hand must run in a transition
      setBusy(false);
    }}>
      <input type="hidden" name="id" value={bookingId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">New price ($)<input name="new_price" type="number" min="1" step="1" required placeholder={String(current)} className="input mt-1 w-32 py-2" /></label>
        <label className="text-sm font-semibold">Photo (optional)<input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" className="mt-1 block text-sm" /></label>
      </div>
      <label className="block text-sm font-semibold">Why? (the customer sees this)
        <textarea name="reason" required minLength={10} maxLength={500} placeholder="e.g. Heavy dog hair on all seats and sand in the carpets" className="input mt-1 min-h-20 py-2" /></label>
      <button className="btn-primary btn-sm" disabled={busy}>{busy ? "Sending…" : "Ask the customer to approve"}</button>
      {state?.ok && <p className="text-sm font-semibold text-palm-600" role="status">{state.ok}</p>}
      {state?.error && <p className="text-sm font-semibold text-red-700" role="alert">{state.error}</p>}
    </form>
  );
}
