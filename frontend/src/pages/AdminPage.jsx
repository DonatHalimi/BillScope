import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, ShieldAlert, ShieldCheck, Users, Wallet } from 'lucide-react';
import { api } from '../api/client.js';
import { queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Select } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate, titleCase } from '../lib/format.js';

export function AdminPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const overviewQuery = useQuery({ queryKey: queryKeys.adminOverview, queryFn: () => api.get('/admin/overview') });
  const usersQuery = useQuery({ queryKey: [...queryKeys.adminUsers, search], queryFn: () => api.get(`/admin/users?limit=100&search=${encodeURIComponent(search)}`) });
  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => api.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: async () => { setError(''); await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }); await queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview }); },
    onError: (mutationError) => setError(mutationError.message)
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/admin/users/${id}/status`, { isActive }),
    onSuccess: async () => { setError(''); await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }); await queryClient.invalidateQueries({ queryKey: queryKeys.adminOverview }); },
    onError: (mutationError) => setError(mutationError.message)
  });

  if (overviewQuery.isLoading || usersQuery.isLoading) return <LoadingPanel />;
  if (overviewQuery.isError || usersQuery.isError) return <ErrorPanel message="Admin data could not be loaded. Check that your account has ADMIN access." onRetry={() => { overviewQuery.refetch(); usersQuery.refetch(); }} />;
  const overview = overviewQuery.data.overview;
  const users = usersQuery.data.users || [];

  return <div className="space-y-7">
    <div><p className="eyebrow">Restricted workspace</p><h1 className="page-title mt-2">Admin portal</h1><p className="page-subtitle">Review platform usage and manage user access roles.</p></div>
    <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-secondary-foreground"><ShieldAlert className="mt-0.5 shrink-0 text-amber-600" size={18} /><p><strong>Privileged actions.</strong> Role and account-status changes are checked again by the API. The last active administrator cannot be deactivated or demoted.</p></div>
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: 'Registered users', value: overview.users, icon: Users },
      { label: 'Active accounts', value: overview.activeUsers, icon: ShieldCheck },
      { label: 'Bank accounts', value: overview.accounts, icon: Wallet },
      { label: 'Transactions', value: overview.transactions, icon: Activity }
    ].map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary-subtle text-primary"><Icon size={19} /></span><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-foreground">{value.toLocaleString('en-GB')}</p></CardContent></Card>)}</section>

    <Card><CardHeader><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><CardTitle>User management</CardTitle><CardDescription className="mt-1">{usersQuery.data.total} users found. Password hashes and refresh tokens are never returned.</CardDescription></div><div className="w-full sm:max-w-xs"><label className="sr-only" htmlFor="search">Search users</label><Input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /></div></div></CardHeader><CardContent className="pt-0">
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(120px,.8fr)_minmax(120px,.7fr)_minmax(130px,.8fr)] gap-4 border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid"><span>User</span><span>Role</span><span>Status</span><span>Joined</span></div>
      {users.map((user) => <div key={user.id} className="grid gap-3 border-b border-border py-4 last:border-0 md:grid-cols-[minmax(0,1.5fr)_minmax(120px,.8fr)_minmax(120px,.7fr)_minmax(130px,.8fr)] md:items-center md:gap-4 md:px-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-secondary-foreground">{user.firstName} {user.lastName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{user.email} · {user.phone}</p></div>
        <div><label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.email}</label><Select id={`role-${user.id}`} className="py-2" value={user.role} onChange={(event) => roleMutation.mutate({ id: user.id, role: event.target.value })} disabled={roleMutation.isPending}><option value="CLIENT">Client</option><option value="PROVIDER">Provider</option><option value="ADMIN">Admin</option></Select></div>
        <div><Badge variant={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'Active' : 'Inactive'}</Badge><div><button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate({ id: user.id, isActive: !user.isActive })}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button></div></div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{formatDate(user.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}<ArrowUpRight size={12} /></div>
      </div>)}
      {!users.length && <div className="py-8 text-center text-sm text-muted-foreground">No users match that search.</div>}
    </CardContent></Card>
  </div>;
}
