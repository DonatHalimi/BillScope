import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, Plus, ReceiptText } from 'lucide-react';
import { api } from '../api/client.js';
import { CurrencySelect } from '../components/CurrencySelect.jsx';
import { useBills, useCreateBill, queryKeys } from '../hooks/useFinanceQueries.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatCurrency, formatDate, titleCase } from '../lib/format.js';

function isoStart(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString(); }
function isoEnd(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString(); }

export function CalendarPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', currency: user?.preferredCurrency || 'EUR', category: 'Bills', dueDate: new Date().toISOString().slice(0, 10), recurringPeriod: '', autoPay: false });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const billsQuery = useBills(isoStart(month), isoEnd(monthEnd));
  const createBill = useCreateBill();
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/bills/${id}/status`, { status }),
    onSuccess: async () => {
      setNotice('Bill status updated.'); setError('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.bills }), queryClient.invalidateQueries({ queryKey: queryKeys.overview }), queryClient.invalidateQueries({ queryKey: queryKeys.forecast })]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });
  const calendarDays = useMemo(() => {
    const gridStart = new Date(month.getFullYear(), month.getMonth(), 1);
    gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [month]);

  if (billsQuery.isLoading) return <LoadingPanel />;
  if (billsQuery.isError) return <ErrorPanel message="Bills could not be loaded for this month." onRetry={() => billsQuery.refetch()} />;
  const bills = billsQuery.data?.bills || [];
  const byDate = bills.reduce((result, bill) => {
    const date = new Date(bill.dueDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    result[key] ||= [];
    result[key].push(bill);
    return result;
  }, {});
  const monthTotal = bills.filter((bill) => bill.status !== 'PAID').reduce((sum, bill) => sum + Number(bill.amount), 0);

  function update(event) {
    const { name, value, checked, type } = event.target;
    setForm((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  }
  function submit(event) {
    event.preventDefault(); setNotice(''); setError('');
    createBill.mutate({ ...form, amount: Number(form.amount), dueDate: new Date(`${form.dueDate}T12:00:00`).toISOString(), recurringPeriod: form.recurringPeriod || undefined, autoPay: form.autoPay }, {
      onSuccess: async () => {
        setNotice('Bill added to your calendar.'); setShowForm(false); setForm((previous) => ({ ...previous, title: '', amount: '' }));
        await queryClient.invalidateQueries({ queryKey: queryKeys.overview });
        await queryClient.invalidateQueries({ queryKey: queryKeys.forecast });
      },
      onError: (mutationError) => setError(mutationError.message)
    });
  }
  function shiftMonth(offset) { setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + offset, 1)); }

  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Plan ahead</p><h1 className="page-title mt-2">Bill calendar</h1><p className="page-subtitle">A live view of due dates, recurring bills, and payment status.</p></div><Button onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? 'Close form' : 'Add bill'}</Button></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    {showForm && <Card><CardHeader><CardTitle>Add a bill</CardTitle><CardDescription>Recurring bills are scheduled as separately trackable occurrences for the next year.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div><label className="field-label" htmlFor="title">Bill name</label><Input id="title" name="title" value={form.title} onChange={update} required maxLength={100} placeholder="Internet, rent, utilities…" /></div>
      <div><label className="field-label" htmlFor="amount">Amount</label><Input id="amount" name="amount" type="number" min="0.01" max="100000000" step="0.01" value={form.amount} onChange={update} required placeholder="45.00" /></div>
      <div><label className="field-label" htmlFor="dueDate">Due date</label><Input id="dueDate" name="dueDate" type="date" min={new Date().toISOString().slice(0, 10)} value={form.dueDate} onChange={update} required /></div>
      <div><label className="field-label" htmlFor="category">Category</label><Input id="category" name="category" value={form.category} onChange={update} maxLength={60} /></div>
      <div><label className="field-label" htmlFor="currency">Currency</label><CurrencySelect id="currency" value={form.currency} onChange={update} /></div>
      <div><label className="field-label" htmlFor="recurringPeriod">Repeat</label><Select id="recurringPeriod" name="recurringPeriod" value={form.recurringPeriod} onChange={update}><option value="">Does not repeat</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option></Select></div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" name="autoPay" checked={form.autoPay} onChange={update} className="size-4 rounded accent-primary" />Autopay planned</label>
      <div className="sm:col-span-2 xl:col-span-3"><Button type="submit" disabled={createBill.isPending}>{createBill.isPending ? 'Adding bill…' : 'Add to calendar'}</Button></div>
    </form></CardContent></Card>}

    <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_.8fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Monthly view</CardTitle><CardDescription className="mt-1">Select a month to see all recorded due dates.</CardDescription></div><div className="flex items-center gap-1"><Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></Button><Button variant="outline" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={17} /></Button></div></CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold text-secondary-foreground">{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month)}</h3><Badge variant="outline">{bills.length} due date{bills.length === 1 ? '' : 's'}</Badge></div>
          <div className="grid grid-cols-7 gap-1.5">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{day}</div>)}
            {calendarDays.map((date) => {
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              const items = byDate[key] || [];
              const inMonth = date.getMonth() === month.getMonth();
              const today = date.toDateString() === new Date().toDateString();
              return <div key={key} className={`min-h-[70px] rounded-xl border p-1.5 sm:min-h-[88px] sm:p-2 ${inMonth ? 'border-border bg-surface' : 'border-transparent bg-canvas/50'} ${today ? 'ring-1 ring-primary/40' : ''}`}>
                <div className={`text-right text-xs ${inMonth ? 'font-medium text-secondary-foreground' : 'text-muted-foreground/45'}`}>{date.getDate()}</div>
                <div className="mt-1.5 space-y-1">{items.slice(0, 2).map((bill) => <button key={bill.id} type="button" title={`${bill.title}: ${formatCurrency(bill.amount, bill.currency)}`} onClick={() => statusMutation.mutate({ id: bill.id, status: bill.status === 'PAID' ? 'UPCOMING' : 'PAID' })} className={`block w-full truncate rounded-md px-1 py-1 text-left text-[9px] font-semibold sm:text-[10px] ${bill.status === 'PAID' ? 'bg-income/10 text-income line-through' : 'bg-primary-subtle text-primary hover:bg-primary/15'}`}>{bill.title}</button>)}{items.length > 2 && <p className="pl-1 text-[9px] text-muted-foreground">+{items.length - 2} more</p>}</div>
              </div>;
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Upcoming</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-income" />Paid (click to toggle status)</span></div>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Upcoming in this month</CardTitle><CardDescription className="mt-1">Unpaid scheduled bills in the selected month.</CardDescription></CardHeader><CardContent>
        <div className="mb-4 rounded-xl bg-primary-subtle/70 p-4"><p className="text-xs font-medium text-primary/80">Remaining scheduled amount</p><p className="mt-1 text-2xl font-semibold text-primary">{formatCurrency(monthTotal, user?.preferredCurrency || 'EUR')}</p></div>
        {bills.length ? <div className="space-y-2.5">{bills.slice().sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map((bill) => <div key={bill.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${bill.status === 'PAID' ? 'bg-income/10 text-income' : 'bg-secondary text-secondary-foreground'}`}>{bill.status === 'PAID' ? <CircleCheck size={17} /> : <Clock3 size={17} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-secondary-foreground">{bill.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(bill.dueDate, { day: 'numeric', month: 'short' })} · {titleCase(bill.category)}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-secondary-foreground">{formatCurrency(bill.amount, bill.currency)}</p><button type="button" onClick={() => statusMutation.mutate({ id: bill.id, status: bill.status === 'PAID' ? 'UPCOMING' : 'PAID' })} className={`mt-1 text-[11px] font-medium ${bill.status === 'PAID' ? 'text-income' : 'text-primary'} hover:underline`}>{bill.status === 'PAID' ? 'Mark unpaid' : 'Mark paid'}</button></div>
        </div>)}</div> : <EmptyState title="A clear month ahead" description="There are no bills recorded in this month. Add a bill to make upcoming commitments visible." actionLabel={undefined} icon={ReceiptText} />}
      </CardContent></Card>
    </div>
  </div>;
}
