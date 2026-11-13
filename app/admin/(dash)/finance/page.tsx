import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EXPENSE_CATEGORIES, financeData } from "@/lib/finance";
import { FinanceDashboard } from "@/components/admin/finance-charts";
import { StateForm, Submit } from "@/components/portal-forms";
import { addExpense } from "../../actions";

export const dynamic = "force-dynamic";

/** CFO view: KPIs, configurable charts, P&L, expenses and a per-job report. */
export default async function Finance() {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/admin?denied=1");
  const { rows, expenses, cancelled, detailersActive } = await financeData();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const expenseForm = (
    <StateForm action={addExpense} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">Month<input name="month" type="month" defaultValue={thisMonth} className="input mt-1 py-1.5" /></label>
      <label className="text-xs font-semibold">Category
        <select name="category" className="input mt-1 py-1.5">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="text-xs font-semibold">Amount ($)<input name="amount" type="number" min="0" step="0.01" required className="input mt-1 w-32 py-1.5" /></label>
      <label className="text-xs font-semibold">Note<input name="note" maxLength={120} placeholder="optional" className="input mt-1 w-56 py-1.5" /></label>
      <Submit className="btn-primary btn-sm">Add expense</Submit>
    </StateForm>
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Finance</h1>
        <p className="text-ink-muted">Revenue, margins and profit from completed jobs. Hover any chart for exact numbers; pick what each chart shows with its controls.</p>
      </div>
      {!rows.length && <p className="card p-8 text-center text-ink-muted">No completed jobs yet. Numbers appear here as jobs are completed.</p>}
      <FinanceDashboard rows={rows} expenses={expenses} cancelled={cancelled} detailersActive={detailersActive} expenseForm={expenseForm} />
      <p className="text-xs text-ink-muted">How it&apos;s calculated: Revenue = what customers paid after promotions and refunds. Net revenue = BluePalm&apos;s commission. Gross profit = net revenue − Stripe fees (estimated at 2.9% + 30¢ per charge; Stripe keeps fees on refunds). EBITDA = gross profit − operating expenses you enter above (BluePalm has no depreciation, interest or tax lines yet).</p>
    </div>
  );
}
