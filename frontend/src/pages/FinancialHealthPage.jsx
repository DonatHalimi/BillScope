import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BrainCircuit, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Select } from '../components/ui/input.jsx';
import { Money } from '../components/Money.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate } from '../lib/format.js';

const CATEGORIES = ['Groceries', 'Restaurants', 'Transport', 'Utilities', 'Housing', 'Subscriptions', 'Health', 'Shopping', 'Entertainment', 'Travel', 'Other', 'Uncategorised'];
const COMPONENTS = [
  { key: 'incomeStabilityScore', title: 'Income stability', description: 'Consistency of monthly recorded income' },
  { key: 'savingsRateScore', title: 'Savings rate', description: 'Income remaining after recorded expenses' },
  { key: 'debtToIncomeScore', title: 'Debt-to-income estimate', description: 'Estimated recurring debt payments vs income' },
  { key: 'budgetAdherenceScore', title: 'Budget adherence', description: 'How active limits compare with spending' }
];

export function FinancialHealthPage() {
  const client = useQueryClient();
  const [category, setCategory] = useState('Groceries');
  const [drillOpen, setDrillOpen] = useState(false);
  const [error, setError] = useState('');
  const summary = useQuery({ queryKey: ['financial-health-summary'], queryFn: () => api.get('/financial-health/summary'), staleTime: 60_000 });
  const drilldown = useQuery({ queryKey: ['financial-health-drilldown', category], queryFn: () => api.get(`/financial-health/drilldown?category=${encodeURIComponent(category)}&limit=100`), enabled: drillOpen, staleTime: 30_000 });
  const recompute = useMutation({
    mutationFn: () => api.post('/financial-health/recompute', {}),
    onSuccess: async () => { setError(''); await client.invalidateQueries({ queryKey: ['financial-health-summary'] }); },
    onError: (problem) => setError(problem.message)
  });
  const chartData = useMemo(() => (summary.data?.history || []).map((row) => ({ ...row, label: formatDate(row.date, { day: 'numeric', month: 'short' }) })), [summary.data?.history]);
  if (summary.isLoading) return <LoadingPanel label="Calculating financial health…" />;
  if (summary.isError) return <ErrorPanel message="Financial health data could not be loaded." onRetry={() => summary.refetch()} />;
  const current = summary.data.current;
  const metrics = current.metrics || {};
  const scoreLabel = current.score >= 80 ? 'Strong' : current.score >= 60 ? 'Developing' : current.score >= 40 ? 'Needs attention' : 'At risk';

  return <div className="space-y-7">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Financial wellbeing</p><h1 className="page-title mt-2">Financial health</h1><p className="page-subtitle">An explainable score based on recorded transaction history and your active spending limits.</p></div><Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}><RefreshCw size={15} />{recompute.isPending ? 'Recomputing…' : 'Recompute score'}</Button></header>
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
      <Card><CardContent className="flex h-full flex-col justify-center p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity size={17} />Current score</div>
        <div className="mt-4 flex items-end gap-3"><span className="text-6xl font-semibold tracking-tight text-secondary-foreground">{current.score}</span><span className="mb-2 text-sm text-muted-foreground">/ 100</span></div>
        <p className="mt-2 text-base font-semibold text-primary">{scoreLabel}</p>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${current.score}%` }} /></div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Snapshot date: {formatDate(current.snapshotDate)} · rolling analysis window: {metrics.periodDays || 90} days</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Score trend</CardTitle><CardDescription>The trend displays the latest 90 daily snapshots; score history can be recomputed on request.</CardDescription></CardHeader><CardContent className="h-64">
        {chartData.length < 2 ? <div className="flex h-full flex-col items-center justify-center text-center"><TrendingUp size={23} className="text-muted-foreground" /><p className="mt-2 text-sm font-medium text-secondary-foreground">Build your trend history</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Recompute on multiple days as transactions and budgets change to display a trend line.</p></div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => [`${value}/100`, 'Score']} contentStyle={{ borderRadius: 12, borderColor: 'hsl(var(--border))' }} /><Line type="monotone" dataKey="score" name="Score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer>}
      </CardContent></Card>
    </div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: 'Income · last 90 days', value: <Money amount={metrics.totalIncome || 0} currency={metrics.currency || 'EUR'} /> }, { label: 'Expenses · last 90 days', value: <Money amount={metrics.totalExpenses || 0} currency={metrics.currency || 'EUR'} /> }, { label: 'Savings rate', value: `${Math.round(Number(metrics.savingsRate || 0) * 100)}%` }, { label: 'Estimated debt-to-income', value: `${Math.round(Number(metrics.debtToIncome || 0) * 100)}%` }].map((metric) => <Card key={metric.label}><CardContent className="p-5"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><div className="mt-2 text-xl font-semibold tabular-nums text-secondary-foreground">{metric.value}</div></CardContent></Card>)}
    </section>
    <section><div className="mb-3"><h2 className="text-lg font-semibold text-secondary-foreground">Score components</h2><p className="mt-1 text-sm text-muted-foreground">Each component contributes one quarter of the total score.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{COMPONENTS.map((component) => <Card key={component.key}><CardContent className="p-5"><p className="text-sm font-medium text-secondary-foreground">{component.title}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-secondary-foreground">{current[component.key] ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span></p><div className="mt-3 h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, current[component.key] || 0))}%` }} /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{component.description}</p></CardContent></Card>)}</div></section>
    <section className="grid items-start gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card><CardHeader><CardTitle>Weekly spending insights</CardTitle><CardDescription>Insights are generated from category-level totals and weekly comparisons.</CardDescription></CardHeader><CardContent className="space-y-3">{(summary.data.insights || []).map((insight) => <article key={insight.id} className="rounded-xl border border-border p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-subtle text-primary"><BrainCircuit size={17} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-secondary-foreground">{insight.title}</h3><span className="text-[11px] text-muted-foreground">{insight.generatedBy === 'openai-aggregate' ? 'AI-assisted' : 'Rule-based'}</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.body}</p><p className="mt-2 text-xs text-muted-foreground">Confidence {Math.round(Number(insight.confidence) * 100)}% · week ending {formatDate(insight.periodEnd)}</p></div></div></article>)}{!(summary.data.insights || []).length && <p className="py-6 text-center text-sm text-muted-foreground">Weekly insights will appear when enough transaction data is available.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Explore a spending category</CardTitle><CardDescription>View recent expense transactions for a category. Results are limited to the signed-in user.</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setDrillOpen(true); }}><div className="flex-1"><label className="field-label" htmlFor="healthCategory">Category</label><Select id="healthCategory" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</Select></div><div className="flex items-end"><Button type="submit" variant="outline">Explore category</Button></div></form>
        {drillOpen && <div className="mt-5">{drilldown.isLoading ? <p className="text-sm text-muted-foreground">Loading transactions…</p> : drilldown.isError ? <p role="alert" className="text-sm text-destructive">Could not load category transactions.</p> : <><p className="mb-3 text-xs text-muted-foreground">{drilldown.data.transactions.length} transactions · {drilldown.data.skippedForeignCurrencyTransactions} omitted due to unavailable conversion rate</p><div className="max-h-80 space-y-2 overflow-auto">{drilldown.data.transactions.map((transaction) => <div key={transaction.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-secondary-foreground">{transaction.merchant || transaction.description}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(transaction.occurredAt)}</p></div><Money amount={transaction.amountInPreferredCurrency} currency={drilldown.data.currency} className="text-sm font-medium text-secondary-foreground" /></div>)}</div></>}</div>}
      </CardContent></Card>
    </section>
    <div className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6 text-muted-foreground"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" /><p>{metrics.methodology || 'Scores use available transaction history, currency conversion, and active limits.'} The score is an educational estimate, not a credit score or financial advice. AI-assisted insight generation is disabled unless explicitly enabled in Settings.</p></div>
  </div>;
}
