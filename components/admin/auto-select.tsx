"use client";

/** A <select> that submits its form as soon as the choice changes. */
export function AutoSelect({ name, value, options }: { name: string; value: string; options: Record<string, string> }) {
  return (
    <select name={name} defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input w-auto py-1.5">
      {Object.entries(options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
