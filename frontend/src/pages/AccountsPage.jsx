import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowRight, Building2, CheckCircle2, CircleDollarSign, Landmark, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { api } from '../api/client.js';
import { useAccounts, useProviderConnections, useProviderInstitutions, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { formatCurrency, formatDate, titleCase } from '../lib/format.js';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';

export function AccountsPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccounts();
  const institutionsQuery = useProviderInstitutions();
  const connectionsQuery = useProviderConnections();
  const [institutionId, setInstitutionId] = useState('evergreen-bank');
  const [currency, setCurrency] = useState('EUR');
  const [accountName, setAccountName] = useState('Everyday account');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const connectMutation = useMutation({
    mutationFn: (payload) => api.post('/provider/connect', payload),
    onSuccess: async () => {
      setNotice('Bank account connected. Sync it to import sample transactions.');
      setError('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.accounts }), queryClient.invalidateQueries({ queryKey: queryKeys.providerConnections })]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });
  const syncMutation = useMutation({
    mutationFn: (id) => api.post(`/provider/connections/${id}/sync`, {}),
    onSuccess: async (result) => {
      setNotice(`${result.imported} new transaction${result.imported === 1 ? '' : 's'} imported.`);
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providerConnections }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forecast }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
      ]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });
  const roundupsMutation = useMutation({
    mutationFn: ({ id, enabled }) => api.patch(`/accounts/${id}/round-ups`, { enabled }),
    onSuccess: async () => {
      setNotice('Round-up preference updated.'); setError('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });

  if (accountsQuery.isLoading || institutionsQuery.isLoading || connectionsQuery.isLoading) return <LoadingPanel />;
  if (accountsQuery.isError) return <ErrorPanel message="Your accounts could not be loaded." onRetry={() => accountsQuery.refetch()} />;

  const accounts = accountsQuery.data?.accounts || [];
  const institutions = institutionsQuery.data?.institutions || [];
  const connections = connectionsQuery.data?.connections || [];
  const selectedInstitution = institutions.find((item) => item.id === institutionId) || institutions[0];
  const supportedCurrencies = selectedInstitution?.currencies || ['EUR'];

  function changeInstitution(nextId) {
    setInstitutionId(nextId);
    const nextInstitution = institutions.find((item) => item.id === nextId);
    if (nextInstitution && !nextInstitution.currencies.includes(currency)) setCurrency(nextInstitution.currencies[0]);
  }

  async function connect(event) {
    event.preventDefault();
    setError(''); setNotice('');
    connectMutation.mutate({ institutionId, currency, accountName: accountName.trim() || undefined });
  }

  return <div className="space-y-7">
    <div><p className="eyebrow">Account overview</p><h1 className="page-title mt-2">Accounts</h1><p className="page-subtitle">Bring balances into one view and manage round-up savings.</p></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => <Card key={account.id} className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-primary-subtle text-primary"><Wallet size={21} /></span><Badge variant={account.accountType === 'SAVINGS' ? 'success' : 'outline'}>{titleCase(account.accountType)}</Badge></div>
          <p className="mt-5 truncate text-sm font-semibold text-secondary-foreground">{account.name}</p><p className="mt-1 text-xs text-muted-foreground">{account.institutionName}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-secondary-foreground">{formatCurrency(account.balance, account.currency)}</p>
          <div className="mt-5 border-t border-border pt-4">
            {account.accountType === 'CHECKING' && account.currency === 'EUR' ? <label className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-secondary-foreground">Automatic round-ups</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">Move spare cents to EUR savings.</p></div><input aria-label={`Round-ups for ${account.name}`} type="checkbox" checked={account.roundUpsEnabled} disabled={roundupsMutation.isPending} onChange={(event) => roundupsMutation.mutate({ id: account.id, enabled: event.target.checked })} className="size-4 shrink-0 rounded border-border accent-primary" /></label> : <p className="text-xs text-muted-foreground">{account.accountType === 'SAVINGS' ? 'Savings destination for round-ups.' : 'Round-ups are currently available for EUR checking accounts.'}</p>}
          </div>
        </CardContent>
      </Card>)}
      <Card className="border-dashed bg-transparent shadow-none"><CardContent className="flex min-h-[245px] flex-col items-center justify-center p-6 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Building2 size={22} /></span><p className="mt-4 text-sm font-semibold text-secondary-foreground">Add another account</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Connect a simulated institution to test the bank sync flow before live Plaid support.</p><a href="#connect-bank" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Connect bank <ArrowRight size={14} /></a></CardContent></Card>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[.95fr_1.05fr]">
      <Card id="connect-bank">
        <CardHeader><CardTitle>Connect a bank</CardTitle><CardDescription>Uses a local mock provider. No real bank credentials are collected.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={connect} className="space-y-4">
            <div><label className="field-label" htmlFor="institution">Financial institution</label><Select id="institution" value={institutionId} onChange={(event) => changeInstitution(event.target.value)} required>{institutions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="currency">Account currency</label><Select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{supportedCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="accountName">Display name</label><Input id="accountName" value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={80} placeholder="Everyday account" /></div>
            <div className="flex items-start gap-2 rounded-xl bg-secondary/70 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" /><span>Mock-only connection. MVP 2 can replace this adapter with Plaid without changing the account UI.</span></div>
            <Button type="submit" className="w-full" disabled={connectMutation.isPending}>{connectMutation.isPending ? 'Connecting…' : 'Connect simulated bank'}<ArrowRight size={15} /></Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Connected institutions</CardTitle><CardDescription>Syncing imports an idempotent sample transaction feed.</CardDescription></CardHeader>
        <CardContent>
          {connections.length ? <div className="space-y-3">{connections.map((connection) => <div key={connection.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Landmark size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-secondary-foreground">{connection.institutionName}</p><p className="mt-1 text-xs text-muted-foreground">{connection.accounts.length} account · {connection.lastSyncedAt ? `Last synced ${formatDate(connection.lastSyncedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'}</p></div></div><Button variant="outline" size="sm" onClick={() => syncMutation.mutate(connection.id)} disabled={syncMutation.isPending}><RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />Sync feed</Button></div>
            <div className="mt-3 flex flex-wrap gap-2">{connection.accounts.map((account) => <Badge key={account.id} variant="secondary">{account.name} · {formatCurrency(account.balance, account.currency)}</Badge>)}</div>
          </div>)}</div> : <div className="py-5"><p className="text-sm font-medium text-secondary-foreground">No external accounts connected</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Connect one of the simulated institutions to import sample transactions.</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownToLine size={15} /> Provider sync runs on demand in MVP 1.</div></div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
