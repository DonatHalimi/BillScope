import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, RefreshCw, ThumbsDown } from 'lucide-react';
import { api } from '../api/client.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Money } from '../components/Money.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate, titleCase } from '../lib/format.js';

const categories = ['Subscriptions', 'Groceries', 'Restaurants', 'Transport', 'Utilities', 'Housing', 'Insurance', 'Health', 'Shopping', 'Entertainment', 'Travel', 'Debt', 'Other', 'Uncategorised'];

export function RecurringPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('DETECTED');
  const [categoryEdits, setCategoryEdits] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['recurring-candidates'], queryFn: () => api.get('/recurring'), staleTime: 30_000 });
  const review = useMutation({
    mutationFn: ({ id, status, category }) => api.patch(`/recurring/${id}/review`, { status, ...(category ? { category } : {}) }),
    onSuccess: async (result) => { setNotice(result.billsCreated ? `Confirmed. ${result.billsCreated} future bill reminders were created.` : 'Subscription review saved.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['recurring-candidates'] }); await queryClient.invalidateQueries({ queryKey: ['bills'] }); },
    onError: (problem) => setError(problem.message)
  });
  const feedback = useMutation({
    mutationFn: (body) => api.post('/recurring/feedback', body),
    onSuccess: async () => { setNotice('Category correction saved and will be used as feedback.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['transactions'] }); },
    onError: (problem) => setError(problem.message)
  });
  const detect = useMutation({
    mutationFn: () => api.post('/recurring/detect', {}),
    onSuccess: async (result) => { setNotice(`Scan complete: ${result.detected} recurring candidates found; ${result.classification?.updated || 0} uncategorised transactions classified.`); setError(''); await queryClient.invalidateQueries({ queryKey: ['recurring-candidates'] }); await queryClient.invalidateQueries({ queryKey: ['transactions'] }); },
    onError: (problem) => setError(problem.message)
  });
  const all = query.data?.candidates || [];
  const candidates = useMemo(() => filter === 'ALL' ? all : all.filter((item) => item.status === filter), [all, filter]);

  if (query.isLoading) return <LoadingPanel label="Detecting recurring payments…" />;
  if (query.isError) return <ErrorPanel message="Recurring payments could not be loaded." onRetry={() => query.refetch()} />;

  return <div className="space-y-7">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Recurring transaction intelligence</p><h1 className="page-title mt-2">Subscriptions & bills</h1><p className="page-subtitle">Review candidate recurring payments before they become bill reminders.</p></div><Button variant="outline" onClick={() => detect.mutate()} disabled={detect.isPending}><RefreshCw size={15} />{detect.isPending ? 'Scanning…' : 'Classify & rescan'}</Button></header>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}{error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">{[{ label: 'Candidates', value: all.length }, { label: 'Confirmed', value: all.filter((row) => row.status === 'CONFIRMED').length }, { label: 'Needs review', value: all.filter((row) => row.status === 'DETECTED').length }].map((metric) => <Card key={metric.label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold text-secondary-foreground">{metric.value}</p></CardContent></Card>)}</div>
    <div className="flex items-center gap-3"><label htmlFor="candidateFilter" className="text-sm font-medium text-secondary-foreground">Show</label><Select id="candidateFilter" className="max-w-56" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="DETECTED">Needs review</option><option value="CONFIRMED">Confirmed</option><option value="DISMISSED">Dismissed</option><option value="ALL">All candidates</option></Select></div>
    <div className="grid gap-4 xl:grid-cols-2">{candidates.map((item) => <Card key={item.id}><CardContent className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-base font-semibold text-secondary-foreground">{item.displayName}</h2><p className="mt-1 text-xs text-muted-foreground">{item.transactionCount} transactions · {titleCase(item.cadence)} · {item.currency}</p></div><Badge variant={item.status === 'CONFIRMED' ? 'success' : item.status === 'DISMISSED' ? 'secondary' : item.confidence >= 0.75 ? 'success' : 'warning'}>{titleCase(item.status)}</Badge></div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs text-muted-foreground">Typical charge</p><p className="mt-1 text-2xl font-semibold text-secondary-foreground"><Money amount={item.averageAmount} currency={item.currency} /></p></div><div className="min-w-36"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Confidence</span><span className="font-semibold text-secondary-foreground">{Math.round(Number(item.confidence) * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, Number(item.confidence) * 100))}%` }} /></div></div></div>
      <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2"><p>Last charge: {item.lastSeenAt ? formatDate(item.lastSeenAt) : '—'}</p><p>Next expected: {item.nextExpectedAt ? formatDate(item.nextExpectedAt) : 'Not enough history'}</p></div>
      {item.status === 'DETECTED' ? <>
        <div className="mt-4"><label className="field-label" htmlFor={`category-${item.id}`}>Category correction</label><Select id={`category-${item.id}`} value={categoryEdits[item.id] ?? item.category ?? 'Subscriptions'} onChange={(event) => setCategoryEdits((current) => ({ ...current, [item.id]: event.target.value }))}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</Select></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => review.mutate({ id: item.id, status: 'CONFIRMED', category: categoryEdits[item.id] ?? item.category ?? 'Subscriptions' })} disabled={review.isPending}><Check size={15} />Confirm & remind</Button><Button variant="outline" onClick={() => review.mutate({ id: item.id, status: 'DISMISSED' })} disabled={review.isPending}><ThumbsDown size={15} />Not recurring</Button></div>
      </> : <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock size={15} />{item.status === 'CONFIRMED' ? 'Bill reminders are scheduled ahead.' : 'Dismissed candidates remain available for audit of your review.'}</p>}
    </CardContent></Card>)}</div>
    {!candidates.length && <Card><CardContent className="p-10 text-center"><CalendarClock size={24} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold text-secondary-foreground">Nothing in this view</p><p className="mt-1 text-sm text-muted-foreground">Recurring detection needs repeated posted transactions with consistent timing and similar amounts.</p></CardContent></Card>}
    <Card><CardHeader><CardTitle>Correct a transaction category</CardTitle><CardDescription>Correction feedback updates the transaction and stores the original prediction for future classifier evaluation.</CardDescription></CardHeader><CardContent><FeedbackForm onSubmit={(payload) => feedback.mutate(payload)} pending={feedback.isPending} /></CardContent></Card>
  </div>;
}

function FeedbackForm({ onSubmit, pending }) {
  const [transactionId, setTransactionId] = useState('');
  const [predictedCategory, setPredictedCategory] = useState('Subscriptions');
  const [correctedCategory, setCorrectedCategory] = useState('Utilities');
  return <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ transactionId: transactionId.trim(), predictedCategory, correctedCategory }); }}>
    <div><label className="field-label" htmlFor="feedbackTransactionId">Transaction ID</label><Input id="feedbackTransactionId" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength={80} required placeholder="Transaction ID" /></div>
    <div><label className="field-label" htmlFor="predictedCategory">Current prediction</label><Select id="predictedCategory" value={predictedCategory} onChange={(event) => setPredictedCategory(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</Select></div>
    <div><label className="field-label" htmlFor="correctedCategory">Correct category</label><Select id="correctedCategory" value={correctedCategory} onChange={(event) => setCorrectedCategory(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</Select></div>
    <div className="flex items-end"><Button type="submit" disabled={pending} className="w-full">{pending ? 'Saving…' : 'Save correction'}</Button></div>
  </form>;
}
