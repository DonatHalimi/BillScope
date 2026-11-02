import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CircleUserRound, Globe2, ShieldCheck, BrainCircuit } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { titleCase } from '../lib/format.js';
import { CurrencySelect } from '../components/CurrencySelect.jsx';

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', preferredCurrency: user?.preferredCurrency || 'EUR', allowAiInsights: Boolean(user?.allowAiInsights) });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', preferredCurrency: user?.preferredCurrency || 'EUR', allowAiInsights: Boolean(user?.allowAiInsights) });
  }, [user]);

  const mutation = useMutation({
    mutationFn: (payload) => api.patch('/profile', payload),
    onSuccess: async (result) => {
      updateUser(result.user);
      setNotice('Profile preferences saved.'); setError('');
      await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.overview }), queryClient.invalidateQueries({ queryKey: queryKeys.forecast }), queryClient.invalidateQueries({ queryKey: queryKeys.accounts })]);
    },
    onError: (mutationError) => { setError(mutationError.message); setNotice(''); }
  });

  function saveProfile(event) {
    event.preventDefault(); setError(''); setNotice('');
    mutation.mutate({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
  }

  function saveCurrency(event) {
    event.preventDefault(); setError(''); setNotice('');
    mutation.mutate({ preferredCurrency: form.preferredCurrency });
  }

  function saveAiPreference(event) {
    event.preventDefault(); setError(''); setNotice('');
    mutation.mutate({ allowAiInsights: Boolean(form.allowAiInsights) });
  }

  return <div className="space-y-7">
    <div><p className="eyebrow">Workspace preferences</p><h1 className="page-title mt-2">Settings</h1><p className="page-subtitle">Manage your profile, display currency, and session details.</p></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_.75fr]">
      <Card><CardHeader><CardTitle>Personal details</CardTitle><CardDescription>These details are associated with your BillScope account.</CardDescription></CardHeader><CardContent>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="firstName">First name</label><Input id="firstName" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required maxLength={60} /></div><div><label className="field-label" htmlFor="lastName">Last name</label><Input id="lastName" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required maxLength={60} /></div></div>
          <div><label className="field-label" htmlFor="email">Email address</label><Input id="email" value={user?.email || ''} disabled readOnly /><p className="mt-1 text-xs text-muted-foreground">Email changes are disabled in this MVP.</p></div>
          <div><label className="field-label" htmlFor="phone">Phone number</label><Input id="phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required minLength={7} maxLength={24} pattern="\+?[0-9][0-9() .-]{5,22}" /></div>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving changes…' : 'Save profile'}<Check size={15} /></Button>
        </form>
      </CardContent></Card>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Display currency</CardTitle><CardDescription>Default currency for overview and forecast calculations.</CardDescription></CardHeader><CardContent><form onSubmit={saveCurrency} className="space-y-3"><label className="field-label" htmlFor="preferredCurrency">Preferred currency</label><CurrencySelect id="preferredCurrency" value={form.preferredCurrency} onChange={(event) => setForm({ ...form, preferredCurrency: event.target.value })} /><p className="text-xs leading-5 text-muted-foreground">This sets your display currency for supported conversion and financial-health calculations. Original account balances remain in their source currencies.</p><Button className="w-full" variant="outline" type="submit" disabled={mutation.isPending}>Save preferences</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>AI spending insights</CardTitle><CardDescription>Optional weekly observations based on aggregate spending totals.</CardDescription></CardHeader><CardContent><form onSubmit={saveAiPreference} className="space-y-4"><label className="flex items-start gap-3 rounded-xl border border-border p-3" htmlFor="allowAiInsights"><input id="allowAiInsights" type="checkbox" className="mt-1 size-4 accent-primary" checked={Boolean(form.allowAiInsights)} onChange={(event) => setForm({ ...form, allowAiInsights: event.target.checked })} /><span><span className="flex items-center gap-2 text-sm font-medium text-secondary-foreground"><BrainCircuit size={16} />Allow AI-assisted insights</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">When enabled and a provider API key is configured, only aggregate category totals, your display currency, and week-over-week totals are sent to the configured AI endpoint. Merchant names, transaction descriptions, account identifiers, and raw transaction rows are not sent. Disabled by default; you can revoke consent here.</span></span></label><Button className="w-full" type="submit" variant="outline" disabled={mutation.isPending}>Save AI preference</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Account security</CardTitle><CardDescription>Session and role information for this account.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary-subtle text-primary"><ShieldCheck size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Rotating session</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Access tokens are memory-only; refresh tokens rotate through an HttpOnly cookie.</p></div></div><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><CircleUserRound size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Account role</p><div className="mt-1"><Badge>{titleCase(user?.role || 'CLIENT')}</Badge></div></div></div><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Globe2 size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Theme readiness</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Color tokens include a dark palette; the light theme remains active for MVP 1.</p></div></div></CardContent></Card>
      </div>
    </div>
  </div>;
}
