import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Plus, Target, TrendingUp } from 'lucide-react';
import { api } from '../api/client.js';
import { useBudgets, useCreateBudget, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatCurrency, titleCase } from '../lib/format.js';

const categoryOptions = ['Groceries', 'Restaurants', 'Transport', 'Utilities', 'Housing', 'Subscriptions', 'Health', 'Shopping', 'Entertainment', 'Travel', 'Other'];

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const budgetsQuery = useBudgets();
  const createBudget = useCreateBudget();
  const [form, setForm] = useState({ name: 'Groceries', category: 'Groceries', amount: '', currency: 'EUR', period: 'MONTHLY' });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.patch(`/budgets/${id}/enabled`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
    onError: (mutationError) => setError(mutationError.message)
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
    onError: (mutationError) => setError(mutationError.message)
  });

  if (budgetsQuery.isLoading) return <LoadingPanel />;
  if (budgetsQuery.isError) return <ErrorPanel message="Spending limits could not be loaded." onRetry={() => budgetsQuery.refetch()} />;
  const budgets = budgetsQuery.data?.budgets || [];
  function submit(event) {
    event.preventDefault(); setError(''); setNotice('');
    createBudget.mutate({ ...form, name: form.name.trim(), category: form.category.trim(), amount: Number(form.amount) }, {
      onSuccess: () => { setNotice('Spending limit saved.'); setShowForm(false); setForm((previous) => ({ ...previous, amount: '' })); },
      onError: (mutationError) => setError(mutationError.message)
    });
  }

  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Spend with intention</p><h1 className="page-title mt-2">Spending limits</h1><p className="page-subtitle">Set category limits and see how much of each budget is already used.</p></div><Button onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? 'Close form' : 'Create limit'}</Button></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    {showForm && <Card><CardHeader><CardTitle>New spending limit</CardTitle><CardDescription>Each category can have one limit per period. Saving the same category and period updates it.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div><label className="field-label" htmlFor="name">Name</label><Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} /></div>
      <div><label className="field-label" htmlFor="category">Category</label><Select id="category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, name: event.target.value })}>{categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
      <div><label className="field-label" htmlFor="amount">Limit amount</label><Input id="amount" type="number" min="0.01" max="100000000" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required placeholder="150.00" /></div>
      <div><label className="field-label" htmlFor="currency">Currency</label><Select id="currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{['EUR', 'USD', 'GBP', 'JPY', 'CHF'].map((item) => <option key={item}>{item}</option>)}</Select></div>
      <div><label className="field-label" htmlFor="period">Period</label><Select id="period" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option></Select></div>
      <div className="md:col-span-2 xl:col-span-5"><Button type="submit" disabled={createBudget.isPending}>{createBudget.isPending ? 'Saving…' : 'Save spending limit'}</Button></div>
    </form></CardContent></Card>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {budgets.map((budget) => {
        const percentage = Math.min(100, budget.percentUsed);
        const isOver = budget.percentUsed >= 100;
        const isNear = budget.percentUsed >= 80;
        return <Card key={budget.id} className="overflow-hidden"><CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-subtle text-primary"><Target size={19} /></span><Badge variant={isOver ? 'danger' : isNear ? 'warning' : 'success'}>{isOver ? 'Over limit' : isNear ? 'Near limit' : 'On track'}</Badge></div>
          <p className="mt-4 text-base font-semibold text-secondary-foreground">{budget.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{titleCase(budget.category)} · {titleCase(budget.period)}</p>
          <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-xl font-semibold tabular-nums text-secondary-foreground">{formatCurrency(budget.spent, budget.currency)}</p><p className="mt-1 text-xs text-muted-foreground">of {formatCurrency(budget.amount, budget.currency)}</p></div><p className={`text-sm font-semibold ${isOver ? 'text-expense' : 'text-muted-foreground'}`}>{budget.percentUsed}%</p></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full transition-all ${isOver ? 'bg-expense' : isNear ? 'bg-amber-500' : 'bg-accent'}`} style={{ width: `${percentage}%` }} /></div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">{isOver ? <AlertTriangle size={14} className="text-expense" /> : <CheckCircle2 size={14} className="text-income" />}{isOver ? `${formatCurrency(budget.spent - budget.amount, budget.currency)} above limit` : `${formatCurrency(budget.remaining, budget.currency)} remaining`}</p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4"><button type="button" onClick={() => toggleMutation.mutate({ id: budget.id, enabled: !budget.enabled })} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline" disabled={toggleMutation.isPending}>{budget.enabled ? 'Pause limit' : 'Enable limit'}</button><button type="button" onClick={() => deleteMutation.mutate(budget.id)} className="text-xs font-medium text-destructive underline-offset-4 hover:underline" disabled={deleteMutation.isPending}>Remove</button></div>
        </CardContent></Card>;
      })}
    </div>
    {!budgets.length && <Card><CardContent><EmptyState title="No spending limits yet" description="Create a limit for groceries, subscriptions, transport, or any category you want to track." icon={CircleDollarSign} /></CardContent></Card>}
    {budgets.length > 0 && <Card><CardContent className="flex items-start gap-3 p-5"><TrendingUp size={19} className="mt-0.5 text-primary" /><div><p className="text-sm font-semibold text-secondary-foreground">How these limits work</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Spending is summed from posted expense transactions during the current week or month. Limits do not block transactions; they highlight when spending approaches or exceeds your chosen amount.</p></div></CardContent></Card>}
  </div>;
}
