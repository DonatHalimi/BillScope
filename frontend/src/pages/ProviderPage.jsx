import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProviderConnections, queryKeys } from '../hooks/useFinanceQueries.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate } from '../lib/format.js';

export function ProviderPage() {
  const queryClient = useQueryClient();
  const connectionsQuery = useProviderConnections();
  const syncMutation = useMutation({
    mutationFn: (id) => api.post(`/provider/connections/${id}/sync`, {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.providerConnections }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview })
      ]);
    }
  });

  if (connectionsQuery.isLoading) return <LoadingPanel />;
  if (connectionsQuery.isError) return <ErrorPanel message="Provider stream data could not be loaded." onRetry={() => connectionsQuery.refetch()} />;
  const connections = connectionsQuery.data.connections || [];
  return <div className="space-y-7">
    <div><p className="eyebrow">Provider workspace</p><h1 className="page-title mt-2">Mock provider stream</h1><p className="page-subtitle">Inspect the MVP bank adapter and simulate idempotent transaction imports.</p></div>
    {syncMutation.isSuccess && <div role="status" className="rounded-xl border border-income/20 bg-income/5 px-4 py-3 text-sm text-income">Sync completed. {syncMutation.data.imported} new transactions imported.</div>}
    {syncMutation.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{syncMutation.error.message}</div>}
    <div className="grid gap-4 md:grid-cols-3">{[
      { title: 'Adapter boundary', body: 'MockBankProvider supplies institutions and test transactions.', icon: Waves },
      { title: 'Idempotent sync', body: 'External transaction IDs prevent duplicate imports.', icon: CheckCircle2 },
      { title: 'Access control', body: 'The provider portal is guarded by PROVIDER or ADMIN role.', icon: ShieldCheck }
    ].map(({ title, body, icon: Icon }) => <Card key={title}><CardContent className="p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary-subtle text-primary"><Icon size={19} /></span><h2 className="mt-4 text-sm font-semibold text-secondary-foreground">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p></CardContent></Card>)}</div>
    <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Connected test sources</CardTitle><CardDescription className="mt-1">Sync simulates a feed request; it does not connect to real financial institutions.</CardDescription></div><Badge variant="outline">MVP 1</Badge></CardHeader><CardContent>
      {connections.length ? <div className="space-y-3">{connections.map((connection) => <div key={connection.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-secondary-foreground">{connection.institutionName}</p><p className="mt-1 text-xs text-muted-foreground">{connection.accounts.length} accounts · {connection.lastSyncedAt ? `Last sync ${formatDate(connection.lastSyncedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'No sync recorded yet'}</p></div><Button variant="outline" size="sm" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate(connection.id)}><RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />Pull sample feed</Button></div>)}</div> : <EmptyState title="No connected source" description="Connect a mock institution from the Accounts page before pulling a test feed." actionLabel="Open accounts" actionTo="/app/accounts" icon={Activity} />}
      <div className="mt-5 rounded-xl bg-secondary/60 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MVP 2 connection points</p><p className="mt-2 text-sm leading-6 text-muted-foreground">The provider registry isolates institution discovery and transaction import from the account UI. A Plaid adapter can implement the same contract later; WebSocket push delivery remains out of scope and current pages poll sync status on a bounded interval.</p><Link to="/app/accounts" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Manage connected accounts <ArrowRight size={14} /></Link></div>
    </CardContent></Card>
  </div>;
}
