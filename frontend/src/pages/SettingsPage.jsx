import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CircleUserRound, Globe2, ShieldCheck } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { titleCase } from '../lib/format.js';

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', preferredCurrency: user?.preferredCurrency || 'EUR' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '', preferredCurrency: user?.preferredCurrency || 'EUR' });
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

  function submit(event) {
    event.preventDefault(); setError(''); setNotice('');
    mutation.mutate({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
  }

  return <div className="space-y-7">
    <div><p className="eyebrow">Workspace preferences</p><h1 className="page-title mt-2">Settings</h1><p className="page-subtitle">Manage your profile, display currency, and session details.</p></div>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_.75fr]">
      <Card><CardHeader><CardTitle>Personal details</CardTitle><CardDescription>These details are associated with your BillScope account.</CardDescription></CardHeader><CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="firstName">First name</label><Input id="firstName" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required maxLength={60} /></div><div><label className="field-label" htmlFor="lastName">Last name</label><Input id="lastName" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required maxLength={60} /></div></div>
          <div><label className="field-label" htmlFor="email">Email address</label><Input id="email" value={user?.email || ''} disabled readOnly /><p className="mt-1 text-xs text-muted-foreground">Email changes are disabled in this MVP.</p></div>
          <div><label className="field-label" htmlFor="phone">Phone number</label><Input id="phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required minLength={7} maxLength={24} pattern="\+?[0-9][0-9() .-]{5,22}" /></div>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving changes…' : 'Save profile'}<Check size={15} /></Button>
        </form>
      </CardContent></Card>
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Display currency</CardTitle><CardDescription>Default currency for overview and forecast calculations.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-3"><label className="field-label" htmlFor="preferredCurrency">Preferred currency</label><Select id="preferredCurrency" value={form.preferredCurrency} onChange={(event) => setForm({ ...form, preferredCurrency: event.target.value })}>{['EUR', 'USD', 'GBP', 'JPY', 'CHF'].map((currency) => <option key={currency} value={currency}>{currency} — {new Intl.DisplayNames(['en'], { type: 'currency' }).of(currency) || currency}</option>)}</Select><p className="text-xs leading-5 text-muted-foreground">Balances in different currencies are not converted. Summary figures include only accounts in the selected currency.</p><Button className="w-full" variant="outline" type="submit" disabled={mutation.isPending}>Save preferences</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Account security</CardTitle><CardDescription>Session and role information for this account.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary-subtle text-primary"><ShieldCheck size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Rotating session</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Access tokens are memory-only; refresh tokens rotate through an HttpOnly cookie.</p></div></div><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><CircleUserRound size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Account role</p><div className="mt-1"><Badge>{titleCase(user?.role || 'CLIENT')}</Badge></div></div></div><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Globe2 size={17} /></span><div><p className="text-sm font-medium text-secondary-foreground">Theme readiness</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Color tokens include a dark palette; the light theme remains active for MVP 1.</p></div></div></CardContent></Card>
      </div>
    </div>
  </div>;
}
