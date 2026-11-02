import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input } from '../components/ui/input.jsx';
import { CurrencySelect } from '../components/CurrencySelect.jsx';
import { Money } from '../components/Money.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate } from '../lib/format.js';

export function CurrencyPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState(user?.preferredCurrency || 'EUR');
  const [toCurrency, setToCurrency] = useState('USD');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const rates = useQuery({ queryKey: ['fx-rates', fromCurrency], queryFn: () => api.get(`/fx/rates?base=${encodeURIComponent(fromCurrency)}`), staleTime: 60_000, retry: 1 });
  const mutation = useMutation({
    mutationFn: ({ body, key }) => api.post('/fx/convert', body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (response) => { setResult(response); setError(''); },
    onError: (problem) => { setError(problem.message); setResult(null); }
  });
  useEffect(() => { if (user?.preferredCurrency) setFromCurrency(user.preferredCurrency); }, [user?.preferredCurrency]);

  function convert(event) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) { setError('Enter an amount greater than zero and no greater than 1,000,000,000.'); return; }
    setError('');
    mutation.mutate({ body: { amount: parsed, fromCurrency, toCurrency }, key: crypto.randomUUID() });
  }

  async function setPreferredCurrency() {
    try {
      const response = await api.patch('/profile', { preferredCurrency: fromCurrency });
      updateUser(response.user);
      await queryClient.invalidateQueries();
    } catch (problem) { setError(problem.message); }
  }

  const conversion = result?.conversion;
  const listedRates = rates.data?.rates || [];
  const targetRate = listedRates.find((rate) => rate.quoteCurrency === toCurrency);

  if (rates.isLoading && !rates.data) return <LoadingPanel label="Loading exchange rates…" />;
  return <div className="space-y-7">
    <header><p className="eyebrow">International money</p><h1 className="page-title mt-2">Currency & conversions</h1><p className="page-subtitle">Convert using provider-backed rates, a persisted rate history, and a bounded stale-cache fallback.</p></header>
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.75fr)]">
      <Card><CardHeader><CardTitle>Currency converter</CardTitle><CardDescription>Every conversion request requires its own idempotency key to prevent duplicate records.</CardDescription></CardHeader><CardContent>
        <form onSubmit={convert} className="space-y-4">
          <div><label className="field-label" htmlFor="fxAmount">Amount</label><Input id="fxAmount" type="number" min="0.00000001" max="1000000000" step="0.00000001" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div><label className="field-label" htmlFor="fxFrom">From</label><CurrencySelect id="fxFrom" value={fromCurrency} onChange={(event) => { setFromCurrency(event.target.value); setResult(null); }} /></div>
            <Button type="button" variant="outline" size="icon" aria-label="Swap currencies" className="mb-0.5" onClick={() => { setFromCurrency(toCurrency); setToCurrency(fromCurrency); setResult(null); }}><ArrowDownUp size={16} /></Button>
            <div><label className="field-label" htmlFor="fxTo">To</label><CurrencySelect id="fxTo" value={toCurrency} onChange={(event) => { setToCurrency(event.target.value); setResult(null); }} /></div>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Converting…' : 'Convert amount'}</Button><Button type="button" variant="outline" onClick={() => rates.refetch()} disabled={rates.isFetching}><RefreshCw size={15} />Refresh rates</Button><Button type="button" variant="ghost" onClick={setPreferredCurrency}>Set {fromCurrency} as default</Button></div>
        </form>
        {conversion && <div role="status" className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Converted estimate</p>
          <p className="mt-1 text-3xl font-semibold text-secondary-foreground"><Money amount={conversion.convertedAmount} currency={toCurrency} /></p>
          <p className="mt-2 text-sm text-muted-foreground"><Money amount={conversion.amount} currency={fromCurrency} /> · rate {conversion.rate} · source {conversion.rateSource || result?.source || 'cached'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rate as of {conversion.rateAsOf ? formatDate(conversion.rateAsOf, { day: 'numeric', month: 'short', year: 'numeric' }) : 'provider update'}{result.staleRate ? ' · using cached rate' : ''}{result.replayed ? ' · idempotent replay' : ''}</p>
        </div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Rate snapshot</CardTitle><CardDescription>Source and timestamp are stored for traceability. Quotes are indicative, not a promise of bank settlement rates.</CardDescription></CardHeader><CardContent>
        {rates.isError ? <ErrorPanel message="Rates are temporarily unavailable. Try again to use a provider or permitted cached rate." onRetry={() => rates.refetch()} /> : <>
          <div className="rounded-xl bg-secondary/70 p-4"><p className="text-xs text-muted-foreground">Selected pair</p><p className="mt-1 text-lg font-semibold text-secondary-foreground">1 {fromCurrency} = {targetRate?.rate ?? '—'} {toCurrency}</p><p className="mt-1 text-xs text-muted-foreground">{targetRate?.source || rates.data?.source || 'Rate cache'}{rates.data?.stale ? ' · stale fallback' : ''}</p></div>
          <div className="mt-4 space-y-2">{listedRates.filter((rate) => rate.quoteCurrency !== fromCurrency).slice(0, 8).map((rate) => <div key={rate.quoteCurrency} className="flex items-center justify-between border-b border-border py-2 last:border-0"><span className="text-sm text-secondary-foreground">{rate.quoteCurrency}</span><span className="text-sm tabular-nums text-muted-foreground">{rate.rate}</span></div>)}</div>
          {rates.data?.asOf && <p className="mt-3 text-xs text-muted-foreground">Rate date: {formatDate(rates.data.asOf, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </>}
      </CardContent></Card>
    </div>
    <div className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" /><p>Amounts are calculated with decimal arithmetic on the server. Currency pairs and provider timestamps are persisted; upstream providers are tried in sequence, and stale rates are accepted only within the configured maximum age.</p></div>
  </div>;
}
