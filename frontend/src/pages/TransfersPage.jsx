import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, ArrowLeftRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useAccounts, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { formatCurrency } from '../lib/format.js';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';

export function TransfersPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccounts();
  const [form, setForm] = useState({ sourceAccountId: '', destinationAccountId: '', amount: '', description: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const transferMutation = useMutation({
    mutationFn: (payload) => api.post('/transfers', payload),
    onSuccess: async () => {
      setNotice('Transfer completed between your BillScope accounts.'); setError('');
      setForm((previous) => ({ ...previous, amount: '', description: '' }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forecast })
      ]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });
  if (accountsQuery.isLoading) return <LoadingPanel />;
  if (accountsQuery.isError) return <ErrorPanel message="Accounts could not be loaded." onRetry={() => accountsQuery.refetch()} />;
  const accounts = accountsQuery.data?.accounts || [];
  const source = accounts.find((account) => account.id === form.sourceAccountId);
  const destinations = accounts.filter((account) => account.id !== form.sourceAccountId && (!source || source.currency === account.currency));

  function submit(event) {
    event.preventDefault(); setError(''); setNotice('');
    transferMutation.mutate({ ...form, amount: Number(form.amount), description: form.description.trim() || undefined });
  }
  function update(event) {
    const { name, value } = event.target;
    setForm((previous) => name === 'sourceAccountId'
      ? { ...previous, sourceAccountId: value, destinationAccountId: accounts.find((account) => account.id === value)?.id === previous.destinationAccountId ? '' : previous.destinationAccountId }
      : { ...previous, [name]: value });
  }

  return <div className="space-y-7">
    <div><p className="eyebrow">Move money locally</p><h1 className="page-title mt-2">Transfers</h1><p className="page-subtitle">Simulate a transfer between accounts you manage in BillScope.</p></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card><CardHeader><CardTitle>New transfer</CardTitle><CardDescription>Transfers are simulated locally and cannot move real money.</CardDescription></CardHeader><CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div><label className="field-label" htmlFor="sourceAccountId">From account</label><Select id="sourceAccountId" name="sourceAccountId" value={form.sourceAccountId} onChange={update} required><option value="">Choose source account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatCurrency(account.balance, account.currency)}</option>)}</Select></div>
          <div className="flex justify-center"><span className="grid size-10 place-items-center rounded-full border border-border bg-secondary text-secondary-foreground"><ArrowDownUp size={17} /></span></div>
          <div><label className="field-label" htmlFor="destinationAccountId">To account</label><Select id="destinationAccountId" name="destinationAccountId" value={form.destinationAccountId} onChange={update} required><option value="">Choose destination account</option>{destinations.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select>{source && !destinations.length && <p className="mt-1.5 text-xs text-muted-foreground">You need another account with {source.currency} to make this transfer.</p>}</div>
          <div><label className="field-label" htmlFor="amount">Amount {source ? `(${source.currency})` : ''}</label><Input id="amount" name="amount" type="number" min="0.01" max={source ? Number(source.balance) : 100000000} step="0.01" value={form.amount} onChange={update} placeholder="0.00" required /></div>
          <div><label className="field-label" htmlFor="description">Note (optional)</label><Input id="description" name="description" value={form.description} onChange={update} maxLength={180} placeholder="e.g. Move monthly savings" /></div>
          <Button type="submit" className="w-full" disabled={transferMutation.isPending || !accounts.length || !destinations.length}>{transferMutation.isPending ? 'Processing transfer…' : 'Confirm simulated transfer'}<ArrowLeftRight size={16} /></Button>
        </form>
      </CardContent></Card>
      <div className="space-y-5">
        <Card><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-2xl bg-primary-subtle text-primary"><ShieldCheck size={20} /></span><h2 className="mt-4 text-base font-semibold text-secondary-foreground">Built-in safeguards</h2><div className="mt-4 space-y-3 text-sm text-muted-foreground"><p className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-income" />Both accounts must belong to your user.</p><p className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-income" />Source and destination currencies must match.</p><p className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-income" />An atomic balance check prevents concurrent transfers from overdrawing an account.</p><p className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-income" />Every successful transfer creates an audit-friendly transaction record.</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Your accounts</CardTitle><CardDescription>Balances in your selected currency.</CardDescription></CardHeader><CardContent className="space-y-3">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/55 px-3.5 py-3"><div><p className="text-sm font-medium text-secondary-foreground">{account.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{account.currency} · {account.accountType.toLowerCase()}</p></div><p className="text-sm font-semibold tabular-nums text-secondary-foreground">{formatCurrency(account.balance, account.currency)}</p></div>)}</CardContent></Card>
      </div>
    </div>
  </div>;
}
