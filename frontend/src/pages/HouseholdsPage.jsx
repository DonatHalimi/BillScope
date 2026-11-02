import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, Radio, ReceiptText, ShieldCheck, UsersRound } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { CurrencySelect } from '../components/CurrencySelect.jsx';
import { Money } from '../components/Money.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';

function defaultPercentageForMember(memberIds, memberId) {
  const count = Math.max(1, memberIds.length);
  const index = Math.max(0, memberIds.indexOf(memberId));
  const baseBasisPoints = Math.floor(10000 / count);
  const remainderBasisPoints = 10000 - baseBasisPoints * count;
  return ((baseBasisPoints + (index < remainderBasisPoints ? 1 : 0)) / 100).toFixed(2);
}

export function HouseholdsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [householdForm, setHouseholdForm] = useState({ name: '', currency: user?.preferredCurrency || 'EUR' });
  const [budgetForm, setBudgetForm] = useState({ name: '', category: '', amount: '', period: 'MONTHLY' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER' });
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', splitMode: 'EQUAL', memberIds: [], percentages: {}, amounts: {} });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [socketStatus, setSocketStatus] = useState('disconnected');

  const households = useQuery({ queryKey: ['households'], queryFn: () => api.get('/households'), staleTime: 30_000 });
  const activeId = selectedId || households.data?.households?.[0]?.id || '';
  const detail = useQuery({ queryKey: ['household', activeId], queryFn: () => api.get(`/households/${encodeURIComponent(activeId)}`), enabled: Boolean(activeId), staleTime: 10_000 });
  const household = detail.data?.household;
  const members = household?.members || [];
  const myMembership = members.find((member) => member.user.id === user?.id);
  const isAdmin = myMembership && ['OWNER', 'ADMIN'].includes(myMembership.role);
  const canCreateExpense = myMembership && ['OWNER', 'ADMIN', 'MEMBER'].includes(myMembership.role);
  const splitParticipants = useMemo(() => members.filter((member) => expenseForm.memberIds.includes(member.user.id)), [members, expenseForm.memberIds]);

  const createHousehold = useMutation({ mutationFn: () => api.post('/households', householdForm), onSuccess: async (result) => { setNotice('Household created.'); setError(''); setSelectedId(result.household.id); setHouseholdForm((form) => ({ ...form, name: '' })); await queryClient.invalidateQueries({ queryKey: ['households'] }); }, onError: (problem) => setError(problem.message) });
  const createBudget = useMutation({ mutationFn: () => api.post(`/households/${activeId}/budgets`, { ...budgetForm, amount: Number(budgetForm.amount), currency: household.currency }), onSuccess: async () => { setNotice('Household budget saved.'); setError(''); setBudgetForm({ name: '', category: '', amount: '', period: 'MONTHLY' }); await queryClient.invalidateQueries({ queryKey: ['household', activeId] }); }, onError: (problem) => setError(problem.message) });
  const inviteMember = useMutation({ mutationFn: () => api.post(`/households/${activeId}/members`, inviteForm), onSuccess: async () => { setNotice('Existing BillScope user added to the household.'); setError(''); setInviteForm({ email: '', role: 'MEMBER' }); await queryClient.invalidateQueries({ queryKey: ['household', activeId] }); await queryClient.invalidateQueries({ queryKey: ['households'] }); }, onError: (problem) => setError(problem.message) });
  const createExpense = useMutation({
    mutationFn: () => api.post(`/households/${activeId}/expenses`, {
      description: expenseForm.description.trim(), amount: Number(expenseForm.amount), splitMode: expenseForm.splitMode,
      splits: splitParticipants.map((member) => ({ memberUserId: member.user.id, ...(expenseForm.splitMode === 'PERCENTAGE' ? { percentage: Number(expenseForm.percentages[member.user.id] || 0) } : {}), ...(expenseForm.splitMode === 'CUSTOM' ? { amount: Number(expenseForm.amounts[member.user.id] || 0) } : {}) }))
    }),
    onSuccess: async () => { setNotice('Expense recorded and household members notified.'); setError(''); setExpenseForm({ description: '', amount: '', splitMode: 'EQUAL', memberIds: members.map((member) => member.user.id), percentages: {}, amounts: {} }); await queryClient.invalidateQueries({ queryKey: ['household', activeId] }); await queryClient.invalidateQueries({ queryKey: ['households'] }); },
    onError: (problem) => setError(problem.message)
  });

  useEffect(() => { if (members.length && expenseForm.memberIds.length === 0) setExpenseForm((form) => ({ ...form, memberIds: members.map((member) => member.user.id) })); }, [members, expenseForm.memberIds.length]);

  useEffect(() => {
    if (!activeId || !household) return undefined;
    let closed = false;
    let socket;
    api.post(`/households/${activeId}/socket-ticket`, {}).then(({ ticket }) => {
      if (closed) return;
      const base = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin);
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      base.pathname = `${base.pathname.replace(/\/$/, '')}/households/${encodeURIComponent(activeId)}/live`;
      base.search = new URLSearchParams({ ticket }).toString();
      socket = new WebSocket(base.toString());
      socket.addEventListener('open', () => { if (!closed) setSocketStatus('connected'); });
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type) queryClient.invalidateQueries({ queryKey: ['household', activeId] });
        } catch { /* Ignore malformed event payloads; server messages are JSON only. */ }
      });
      socket.addEventListener('close', () => { if (!closed) setSocketStatus('disconnected'); });
      socket.addEventListener('error', () => { if (!closed) setSocketStatus('unavailable'); });
    }).catch(() => { if (!closed) setSocketStatus('unavailable'); });
    return () => { closed = true; socket?.close(1000, 'Household changed'); setSocketStatus('disconnected'); };
  }, [activeId, Boolean(household), queryClient]);

  if (households.isLoading) return <LoadingPanel label="Loading household workspaces…" />;
  if (households.isError) return <ErrorPanel message="Household workspaces could not be loaded." onRetry={() => households.refetch()} />;

  return <div className="space-y-7">
    <header><p className="eyebrow">Collaborative finances</p><h1 className="page-title mt-2">Household budgets</h1><p className="page-subtitle">Share household budgets, record expenses, and split costs with server-enforced roles and membership checks.</p></header>
    {notice && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">{notice}</div>}{error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <Card><CardHeader><CardTitle>Create a household</CardTitle><CardDescription>A new household starts with you as its owner.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createHousehold.mutate(); }}><div><label className="field-label" htmlFor="householdName">Name</label><Input id="householdName" value={householdForm.name} onChange={(event) => setHouseholdForm({ ...householdForm, name: event.target.value })} maxLength={80} required placeholder="e.g. Our household" /></div><div><label className="field-label" htmlFor="householdCurrency">Currency</label><CurrencySelect id="householdCurrency" value={householdForm.currency} onChange={(event) => setHouseholdForm({ ...householdForm, currency: event.target.value })} /></div><Button type="submit" disabled={createHousehold.isPending}>{createHousehold.isPending ? 'Creating…' : 'Create household'}</Button></form></CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Your households</CardTitle><CardDescription>Only household memberships assigned to your account are shown.</CardDescription></div><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Radio size={14} className={socketStatus === 'connected' ? 'text-income' : ''} />Live updates: {socketStatus}</span></div></CardHeader><CardContent>{!households.data.households.length ? <p className="py-5 text-sm text-muted-foreground">Create your first household to share budgets and expenses.</p> : <div className="space-y-2">{households.data.households.map((item) => { const myRole = item.members?.find((entry) => entry.user.id === user?.id)?.role || ''; return <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setNotice(''); setError(''); }} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${activeId === item.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-secondary/50'}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-secondary-foreground">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.currency} · {item._count?.expenses || 0} expenses · {item._count?.budgets || 0} budgets</span></span><Badge>{myRole}</Badge></button>; })}</div>}</CardContent></Card>
    </div>

    {activeId && detail.isLoading && <LoadingPanel label="Opening household…" />}
    {activeId && detail.isError && <ErrorPanel message="This household could not be opened. You may have been removed from its membership." onRetry={() => detail.refetch()} />}
    {household && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-secondary-foreground">{household.name}</h2><p className="mt-1 text-sm text-muted-foreground">{members.length} members · all amounts are in {household.currency}</p></div><Badge>{myMembership?.role || 'Member'}</Badge></div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound size={17} />Membership & permissions</CardTitle><CardDescription>Roles are checked by the API and PostgreSQL policies, not only by this interface.</CardDescription></CardHeader><CardContent><div className="space-y-3">{members.map((member) => <div key={member.user.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-secondary-foreground">{member.user.firstName} {member.user.lastName}</p><p className="truncate text-xs text-muted-foreground">{member.user.email}</p></div><Badge variant={member.role === 'OWNER' ? 'success' : 'secondary'}>{member.role}</Badge></div>)}</div>
          {isAdmin && <form className="mt-5 border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); inviteMember.mutate(); }}><h3 className="mb-3 text-sm font-semibold text-secondary-foreground">Add existing user</h3><div className="grid gap-3 sm:grid-cols-[1fr_.65fr_auto]"><div><label className="field-label" htmlFor="inviteEmail">Account email</label><Input id="inviteEmail" type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required maxLength={254} /></div><div><label className="field-label" htmlFor="inviteRole">Role</label><Select id="inviteRole" value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option>{myMembership.role === 'OWNER' && <option value="ADMIN">Admin</option>}</Select></div><div className="flex items-end"><Button type="submit" disabled={inviteMember.isPending}>Add</Button></div></div></form>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText size={17} />Household budgets</CardTitle><CardDescription>Only Owner and Admin roles can create shared budget limits.</CardDescription></CardHeader><CardContent>
          <div className="space-y-2">{(household.budgets || []).map((budget) => <div key={budget.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 p-3"><div><p className="text-sm font-medium text-secondary-foreground">{budget.name}</p><p className="mt-1 text-xs text-muted-foreground">{budget.category || 'All categories'} · {budget.period.toLowerCase()}</p></div><Money amount={budget.amount} currency={budget.currency} className="text-sm font-semibold text-secondary-foreground" /></div>)}{!household.budgets?.length && <p className="py-4 text-sm text-muted-foreground">No household budgets created yet.</p>}</div>
          {isAdmin && <form className="mt-5 space-y-3 border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); createBudget.mutate(); }}><h3 className="text-sm font-semibold text-secondary-foreground">Create a shared budget</h3><div className="grid gap-3 sm:grid-cols-2"><div><label className="field-label" htmlFor="sharedBudgetName">Name</label><Input id="sharedBudgetName" value={budgetForm.name} onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })} required maxLength={80} /></div><div><label className="field-label" htmlFor="sharedBudgetCategory">Category (optional)</label><Input id="sharedBudgetCategory" value={budgetForm.category} onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })} maxLength={60} /></div><div><label className="field-label" htmlFor="sharedBudgetAmount">Budget amount ({household.currency})</label><Input id="sharedBudgetAmount" type="number" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} min="0.01" max="100000000" step="0.01" required /></div><div><label className="field-label" htmlFor="sharedBudgetPeriod">Period</label><Select id="sharedBudgetPeriod" value={budgetForm.period} onChange={(event) => setBudgetForm({ ...budgetForm, period: event.target.value })}><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option></Select></div></div><Button type="submit" disabled={createBudget.isPending}>{createBudget.isPending ? 'Saving…' : 'Save budget'}</Button></form>}
        </CardContent></Card>
      </div>

      {canCreateExpense && <Card><CardHeader><CardTitle>Record and split an expense</CardTitle><CardDescription>Equal, percentage, and custom splits are reconciled on the server to the exact cent.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createExpense.mutate(); }}>
        <div className="grid gap-3 md:grid-cols-3"><div><label className="field-label" htmlFor="expenseDescription">Description</label><Input id="expenseDescription" value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} maxLength={180} required placeholder="Groceries, utilities…" /></div><div><label className="field-label" htmlFor="expenseAmount">Total ({household.currency})</label><Input id="expenseAmount" type="number" min="0.01" max="100000000" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} required /></div><div><label className="field-label" htmlFor="splitMode">Split method</label><Select id="splitMode" value={expenseForm.splitMode} onChange={(event) => setExpenseForm({ ...expenseForm, splitMode: event.target.value })}><option value="EQUAL">Equal share</option><option value="PERCENTAGE">Percentages</option><option value="CUSTOM">Custom amounts</option></Select></div></div>
        <div><p className="mb-2 text-sm font-semibold text-secondary-foreground">Participants</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{members.map((member) => { const id = member.user.id; const selected = expenseForm.memberIds.includes(id); return <div key={id} className="rounded-xl border border-border p-3"><label className="flex items-center gap-2 text-sm font-medium text-secondary-foreground"><input type="checkbox" checked={selected} onChange={(event) => setExpenseForm((form) => ({ ...form, memberIds: event.target.checked ? [...form.memberIds, id] : form.memberIds.filter((value) => value !== id) }))} />{member.user.firstName} {member.user.lastName}</label>{selected && expenseForm.splitMode === 'PERCENTAGE' && <div className="mt-2"><label className="field-label" htmlFor={`pct-${id}`}>Share %</label><Input id={`pct-${id}`} type="number" min="0" max="100" step="0.01" value={expenseForm.percentages[id] ?? defaultPercentageForMember(expenseForm.memberIds, id)} onChange={(event) => setExpenseForm((form) => ({ ...form, percentages: { ...form.percentages, [id]: event.target.value } }))} required /></div>}{selected && expenseForm.splitMode === 'CUSTOM' && <div className="mt-2"><label className="field-label" htmlFor={`amount-${id}`}>Share amount</label><Input id={`amount-${id}`} type="number" min="0.01" max="100000000" step="0.01" value={expenseForm.amounts[id] ?? ''} onChange={(event) => setExpenseForm((form) => ({ ...form, amounts: { ...form.amounts, [id]: event.target.value } }))} required /></div>}</div>; })}</div></div>
        <Button type="submit" disabled={createExpense.isPending || splitParticipants.length === 0}>{createExpense.isPending ? 'Saving expense…' : 'Record expense'}</Button>
      </form></CardContent></Card>}

      <Card><CardHeader><CardTitle>Recent shared expenses</CardTitle><CardDescription>Each expense includes its allocated shares for household members.</CardDescription></CardHeader><CardContent>{(household.expenses || []).length ? <div className="space-y-4">{household.expenses.map((expense) => <article key={expense.id} className="border-b border-border pb-4 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-secondary-foreground">{expense.description}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(expense.occurredAt).toLocaleDateString()} · {expense.splitMode.toLowerCase()} split</p></div><Money amount={expense.amount} currency={expense.currency} className="text-sm font-semibold text-secondary-foreground" /></div><div className="mt-3 flex flex-wrap gap-2">{(expense.splits || []).map((split) => <span key={split.id} className="rounded-lg bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{split.householdMember.user.firstName}: <Money amount={split.amount} currency={expense.currency} /></span>)}</div></article>)}</div> : <p className="py-5 text-sm text-muted-foreground">No shared expenses yet.</p>}</CardContent></Card>
    </>}
    <div className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6 text-muted-foreground"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" /><p>Database row-level security limits household reads and writes to the current database-session user. WebSocket tickets are short-lived, single-use, origin-checked, and membership-validated before a socket is accepted.</p></div>
  </div>;
}
