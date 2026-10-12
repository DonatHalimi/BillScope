import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Plus, ReceiptText, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAccounts, useTransactions, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatCurrency, formatDate, titleCase } from '../lib/format.js';

const categoryOptions = ['Groceries', 'Restaurants', 'Transport', 'Utilities', 'Housing', 'Subscriptions', 'Health', 'Shopping', 'Entertainment', 'Travel', 'Salary', 'Savings', 'Other'];

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const transactionsQuery = useTransactions(100);
  const accountsQuery = useAccounts();
  const [showForm, setShowForm] = useState(searchParams.get('new') === '1');
  const [form, setForm] = useState({ accountId: '', type: 'EXPENSE', amount: '', description: '', merchant: '', category: '', occurredAt: '' });
  const [searchDescription, setSearchDescription] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDescription(form.description.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [form.description]);

  const suggestionQuery = useQuery({
    queryKey: ['category-suggestion', searchDescription],
    queryFn: () => api.get(`/transactions/category-suggestion?description=${encodeURIComponent(searchDescription)}&merchant=${encodeURIComponent(form.merchant)}`),
    enabled: searchDescription.length >= 3,
    staleTime: 60000
  });
  const mutation = useMutation({
    mutationFn: (payload) => api.post('/transactions', payload),
    onSuccess: async (result) => {
      setNotice(`Transaction added${result.transaction?.roundUpAmount > 0 ? ` · ${formatCurrency(result.transaction.roundUpAmount, result.transaction.currency)} moved to savings` : ''}.`);
      setError('');
      setForm((previous) => ({ ...previous, amount: '', description: '', merchant: '', category: '', occurredAt: '' }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forecast }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
      ]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });

  if (transactionsQuery.isLoading || accountsQuery.isLoading) return <LoadingPanel />;
  if (transactionsQuery.isError || accountsQuery.isError) return <ErrorPanel message="Transaction history could not be loaded." onRetry={() => { transactionsQuery.refetch(); accountsQuery.refetch(); }} />;

  const transactions = transactionsQuery.data?.transactions || [];
  const accounts = accountsQuery.data?.accounts || [];
  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const suggestion = suggestionQuery.data;

  function update(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }
  function submit(event) {
    event.preventDefault(); setNotice(''); setError('');
    mutation.mutate({
      accountId: form.accountId,
      type: form.type,
      amount: Number(form.amount),
      description: form.description.trim(),
      merchant: form.merchant.trim() || undefined,
      category: form.category || undefined,
      occurredAt: form.occurredAt ? new Date(`${form.occurredAt}T12:00:00`).toISOString() : undefined
    });
  }

  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Money activity</p><h1 className="page-title mt-2">Transactions</h1><p className="page-subtitle">Review activity, add a manual entry, and use suggested categories.</p></div><Button onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? 'Close form' : 'Add transaction'}</Button></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

    {showForm && <Card><CardHeader><CardTitle>New transaction</CardTitle><CardDescription>Use positive amounts. Income and expenses update the selected local account balance.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="field-label" htmlFor="accountId">Account</label><Select id="accountId" name="accountId" value={form.accountId} onChange={update} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></div>
        <div><label className="field-label" htmlFor="type">Transaction type</label><Select id="type" name="type" value={form.type} onChange={update}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></Select></div>
        <div><label className="field-label" htmlFor="amount">Amount {selectedAccount ? `(${selectedAccount.currency})` : '(EUR by default)'}</label><Input id="amount" name="amount" type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" value={form.amount} onChange={update} required placeholder="0.00" /></div>
        <div><label className="field-label" htmlFor="description">Description</label><Input id="description" name="description" value={form.description} onChange={update} required maxLength={180} placeholder="e.g. Weekly groceries" /></div>
        <div><label className="field-label" htmlFor="merchant">Merchant (optional)</label><Input id="merchant" name="merchant" value={form.merchant} onChange={update} maxLength={120} placeholder="e.g. Meridian Market" /></div>
        <div><label className="field-label" htmlFor="category">Category</label><Select id="category" name="category" value={form.category} onChange={update}><option value="">Suggest automatically</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</Select></div>
        <div><label className="field-label" htmlFor="occurredAt">Transaction date (optional)</label><Input id="occurredAt" name="occurredAt" type="date" value={form.occurredAt} onChange={update} max={new Date().toISOString().slice(0, 10)} /></div>
        <div className="flex items-end pb-0.5">{suggestion?.category && <div className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-primary/15 bg-primary-subtle/60 px-3 py-2"><span className="flex items-center gap-2 text-xs text-primary"><Sparkles size={15} />Suggested: <strong>{suggestion.category}</strong></span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-primary" onClick={() => setForm((previous) => ({ ...previous, category: suggestion.category }))}>Use</Button></div>}</div>
        <div className="flex items-end"><Button type="submit" className="w-full" disabled={mutation.isPending || !accounts.length}>{mutation.isPending ? 'Saving…' : 'Save transaction'}</Button></div>
      </form></CardContent>
    </Card>}

    <Card>
      <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Transaction history</CardTitle><CardDescription className="mt-1">Most recent transactions across your accounts.</CardDescription></div><Badge variant="outline">{transactions.length} loaded</Badge></CardHeader>
      <CardContent className="pt-0">
        {transactions.length ? <div className="divide-y divide-border">{transactions.map((item) => <div className="flex items-center gap-3 py-4" key={item.id}>
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.type === 'INCOME' ? 'bg-income/10 text-income' : item.type === 'TRANSFER' ? 'bg-secondary text-secondary-foreground' : 'bg-expense/10 text-expense'}`}>{item.type === 'INCOME' ? <ArrowDownLeft size={18} /> : item.type === 'TRANSFER' ? <ArrowUpRight size={18} /> : <ArrowUpRight size={18} />}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-secondary-foreground">{item.merchant || item.description}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{item.account?.name || 'Account'}</span><span>·</span><span>{titleCase(item.category)}</span><span>·</span><span>{formatDate(item.occurredAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>{item.roundUpAmount > 0 && <Badge variant="success"><Sparkles size={11} className="mr-1" />Round-up {formatCurrency(item.roundUpAmount, item.currency)}</Badge>}</div></div>
          <div className="shrink-0 text-right"><p className={`text-sm font-semibold tabular-nums ${item.type === 'INCOME' ? 'text-income' : 'text-secondary-foreground'}`}>{item.type === 'INCOME' ? '+' : item.type === 'EXPENSE' ? '−' : ''}{formatCurrency(item.amount, item.currency)}</p><p className="mt-1 text-[11px] text-muted-foreground">{titleCase(item.source || 'manual')}</p></div>
        </div>)}</div> : <EmptyState title="No transactions yet" description="Add your first transaction, or connect a mock bank account to import a sample feed." actionLabel="Connect account" actionTo="/app/accounts" icon={ReceiptText} />}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground"><BadgeCheck size={15} className="shrink-0 text-primary" />Categories are deterministic rule-based suggestions, not financial advice or a third-party AI service.</div>
      </CardContent>
    </Card>
  </div>;
}
