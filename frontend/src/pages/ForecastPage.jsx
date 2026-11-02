import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChartNoAxesCombined, Plus, TrendingDown, Wallet } from 'lucide-react';
import { api } from '../api/client.js';
import { CurrencySelect } from '../components/CurrencySelect.jsx';
import { useForecast, useScheduledIncome, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatCurrency, formatDate, titleCase } from '../lib/format.js';

function ForecastMetric({ title, value, currency, icon: Icon, positive = false, negative = false }) {
  return <Card><CardContent className="p-5"><span className={`grid size-10 place-items-center rounded-xl ${positive ? 'bg-income/10 text-income' : negative ? 'bg-expense/10 text-expense' : 'bg-primary-subtle text-primary'}`}><Icon size={19} /></span><p className="mt-4 text-sm text-muted-foreground">{title}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${positive ? 'text-income' : negative ? 'text-expense' : 'text-secondary-foreground'}`}>{formatCurrency(value, currency)}</p></CardContent></Card>;
}

export function ForecastPage() {
  const queryClient = useQueryClient();
  const forecastQuery = useForecast();
  const incomeQuery = useScheduledIncome();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: 'Monthly salary', amount: '', currency: 'EUR', expectedAt: new Date(new Date().getFullYear(), new Date().getMonth(), Math.min(new Date().getDate() + 10, 28)).toISOString().slice(0, 10), period: 'MONTHLY' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const incomeMutation = useMutation({
    mutationFn: (payload) => api.post('/forecasting/income', payload),
    onSuccess: async () => {
      setNotice('Expected income added to the forecast.'); setError(''); setShowForm(false);
      setForm((previous) => ({ ...previous, amount: '' }));
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.forecast }), queryClient.invalidateQueries({ queryKey: queryKeys.incomes }), queryClient.invalidateQueries({ queryKey: queryKeys.overview })]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, active }) => api.patch(`/forecasting/income/${id}/active`, { active }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.forecast }), queryClient.invalidateQueries({ queryKey: queryKeys.incomes })]); },
    onError: (mutationError) => setError(mutationError.message)
  });

  if (forecastQuery.isLoading || incomeQuery.isLoading) return <LoadingPanel />;
  if (forecastQuery.isError || incomeQuery.isError) return <ErrorPanel message="Your forecast could not be calculated." onRetry={() => { forecastQuery.refetch(); incomeQuery.refetch(); }} />;
  const forecast = forecastQuery.data.forecast;
  const incomes = incomeQuery.data?.incomes || [];

  function submit(event) {
    event.preventDefault(); setNotice(''); setError('');
    incomeMutation.mutate({ ...form, description: form.description.trim(), amount: Number(form.amount), expectedAt: new Date(`${form.expectedAt}T12:00:00`).toISOString() });
  }

  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Plan for the next month</p><h1 className="page-title mt-2">Balance forecast</h1><p className="page-subtitle">A transparent estimate of where your balance could land over the next 30 days.</p></div><Button onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? 'Close form' : 'Add expected income'}</Button></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

    <Card className="overflow-hidden border-primary/10"><div className="grid gap-6 bg-primary p-6 text-primary-foreground sm:grid-cols-[1fr_auto] sm:items-center sm:p-8"><div><Badge variant="outline" className="border-white/20 bg-white/10 text-white">30-day estimate</Badge><p className="mt-4 text-sm text-white/70">Projected balance</p><p className="mt-1 text-4xl font-semibold tracking-tight">{formatCurrency(forecast.projectedBalance, forecast.currency)}</p><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">This estimate combines current balances, scheduled income due in the next 30 days, unpaid bills due in that window, and average monthly spend from the last 90 days.</p></div><div className="grid size-20 place-items-center rounded-3xl bg-white/10 text-emerald-200"><ChartNoAxesCombined size={38} /></div></div></Card>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><ForecastMetric title="Current balance" value={forecast.currentBalance} currency={forecast.currency} icon={Wallet} /><ForecastMetric title="Expected income" value={forecast.incomingIncome} currency={forecast.currency} icon={ArrowDownRight} positive /><ForecastMetric title="Upcoming bills" value={forecast.upcomingBills} currency={forecast.currency} icon={CalendarClock} negative /><ForecastMetric title="Average monthly spend" value={forecast.averageMonthlySpend} currency={forecast.currency} icon={TrendingDown} negative /></section>

    <div className="grid items-start gap-5 xl:grid-cols-[1fr_1fr]">
      <Card><CardHeader><CardTitle>Forecast calculation</CardTitle><CardDescription>Every component comes from your recorded account data and scheduled items.</CardDescription></CardHeader><CardContent>
        <div className="space-y-0 rounded-xl border border-border px-4">
          <div className="flex items-center justify-between gap-4 border-b border-border py-3.5"><span className="text-sm text-muted-foreground">Current balance</span><span className="font-medium tabular-nums text-secondary-foreground">{formatCurrency(forecast.currentBalance, forecast.currency)}</span></div>
          <div className="flex items-center justify-between gap-4 border-b border-border py-3.5"><span className="text-sm text-muted-foreground">+ Expected income</span><span className="font-medium tabular-nums text-income">+{formatCurrency(forecast.incomingIncome, forecast.currency)}</span></div>
          <div className="flex items-center justify-between gap-4 border-b border-border py-3.5"><span className="text-sm text-muted-foreground">− Upcoming bills</span><span className="font-medium tabular-nums text-expense">−{formatCurrency(forecast.upcomingBills, forecast.currency)}</span></div>
          <div className="flex items-center justify-between gap-4 border-b border-border py-3.5"><span className="text-sm text-muted-foreground">− Average monthly spend</span><span className="font-medium tabular-nums text-expense">−{formatCurrency(forecast.averageMonthlySpend, forecast.currency)}</span></div>
          <div className="flex items-center justify-between gap-4 py-4"><span className="text-sm font-semibold text-secondary-foreground">Estimated balance</span><span className={`text-lg font-semibold tabular-nums ${forecast.projectedBalance < 0 ? 'text-expense' : 'text-primary'}`}>{formatCurrency(forecast.projectedBalance, forecast.currency)}</span></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Historical spend uses posted expenses from the last 90 days divided by three. The forecast is an estimate, not a guarantee of future funds.</p>
      </CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Expected income</CardTitle><CardDescription className="mt-1">Salary and other planned incoming payments.</CardDescription></div><Badge variant="outline">{incomes.filter((income) => income.active).length} active</Badge></CardHeader><CardContent>
        {showForm && <form onSubmit={submit} className="mb-5 space-y-3 rounded-xl border border-border p-4">
          <div><label className="field-label" htmlFor="description">Income source</label><Input id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required maxLength={100} placeholder="Monthly salary" /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="field-label" htmlFor="amount">Amount</label><Input id="amount" type="number" step="0.01" min="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required placeholder="1250.00" /></div><div><label className="field-label" htmlFor="currency">Currency</label><CurrencySelect id="currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="field-label" htmlFor="expectedAt">Next payment date</label><Input id="expectedAt" type="date" min={new Date().toISOString().slice(0, 10)} value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} required /></div><div><label className="field-label" htmlFor="period">Frequency</label><Select id="period" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}><option value="ONCE">One-time</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></Select></div></div>
          <Button type="submit" className="w-full" disabled={incomeMutation.isPending}>{incomeMutation.isPending ? 'Saving…' : 'Add to forecast'}</Button>
        </form>}
        {incomes.length ? <div className="space-y-2.5">{incomes.map((income) => <div key={income.id} className="flex items-center gap-3 rounded-xl border border-border p-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-income/10 text-income"><ArrowDownRight size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-secondary-foreground">{income.description}</p><p className="mt-0.5 text-xs text-muted-foreground">Next date {formatDate(income.expectedAt, { day: 'numeric', month: 'short', year: 'numeric' })} · {titleCase(income.period)}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-income">{formatCurrency(income.amount, income.currency)}</p><button type="button" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate({ id: income.id, active: !income.active })} className={`mt-1 text-[11px] font-medium hover:underline ${income.active ? 'text-muted-foreground' : 'text-primary'}`}>{income.active ? 'Pause' : 'Resume'}</button></div></div>)}</div> : <EmptyState title="No income schedule yet" description="Add your next salary or another expected payment to make the forecast more useful." icon={ArrowDownRight} />}
      </CardContent></Card>
    </div>
  </div>;
}
