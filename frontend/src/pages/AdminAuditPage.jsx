import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileCheck2, Search, ShieldAlert } from 'lucide-react';
import { api } from '../api/client.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { formatDate } from '../lib/format.js';

function dateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function filterQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (!params.has('limit')) params.set('limit', '100');
  return params.toString();
}

export function AdminAuditPage() {
  const [draft, setDraft] = useState({ action: '', targetType: '', targetId: '', actorUserId: '', from: '', to: '' });
  const [filters, setFilters] = useState({ action: '', targetType: '', targetId: '', actorUserId: '', from: '', to: '' });
  const [integrity, setIntegrity] = useState(null);
  const [status, setStatus] = useState('');
  const query = useQuery({ queryKey: ['admin-audit-logs', filters], queryFn: () => api.get(`/admin/audit-logs?${filterQuery(filters)}`), staleTime: 15_000 });

  async function verify() {
    setStatus(''); setIntegrity(null);
    try {
      const response = await api.get('/admin/audit-logs/verify');
      setIntegrity(response.integrity);
      setStatus(response.integrity.valid ? 'The audit hash chain verified successfully.' : 'Integrity verification found a mismatch. Preserve the database and investigate immediately.');
    } catch (problem) { setStatus(problem.message); }
  }

  async function exportCsv() {
    setStatus('');
    try {
      const csv = await api.get(`/admin/audit-logs/export.csv?${filterQuery({ ...filters, limit: '1000' })}`);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'billscope-admin-audit.csv';
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setStatus('Audit log export prepared. The export event is itself recorded in the audit trail.');
    } catch (problem) { setStatus(problem.message); }
  }

  if (query.isLoading) return <LoadingPanel label="Loading administrative audit records…" />;
  if (query.isError) return <ErrorPanel message="Audit records could not be loaded. The API restricts this page to administrators." onRetry={() => query.refetch()} />;
  const logs = query.data.auditLogs || [];

  return <div className="space-y-7">
    <header><p className="eyebrow">Privileged activity</p><h1 className="page-title mt-2">Immutable audit log</h1><p className="page-subtitle">Filter and export administrative actions. Hashes support tamper detection; this is not a substitute for restricted database credentials and independent backups.</p></header>
    {status && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${integrity && !integrity.valid ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-border text-secondary-foreground'}`}>{status}</div>}
    <div className="flex flex-wrap gap-2"><Button onClick={verify} variant="outline"><FileCheck2 size={16} />Verify full chain</Button><Button onClick={exportCsv}><Download size={16} />Export filtered CSV</Button></div>
    {integrity && <Card><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-xl ${integrity.valid ? 'bg-income/10 text-income' : 'bg-destructive/10 text-destructive'}`}><ShieldAlert size={19} /></span><div><p className="text-sm font-semibold text-secondary-foreground">{integrity.valid ? 'Chain integrity valid' : 'Chain integrity failed'}</p><p className="mt-1 text-xs text-muted-foreground">{integrity.checked ?? integrity.count ?? 0} records checked{integrity.failedAt ? ` · mismatch at ${integrity.failedAt}` : ''}</p></div></div><Badge variant={integrity.valid ? 'success' : 'danger'}>{integrity.valid ? 'Verified' : 'Mismatch'}</Badge></CardContent></Card>}

    <Card><CardHeader><CardTitle>Audit filters</CardTitle><CardDescription>Filters are applied server-side. Export is capped at 1,000 rows per request.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setIntegrity(null); setFilters({ ...draft }); }}>
      <div><label className="field-label" htmlFor="auditAction">Action</label><Input id="auditAction" value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} maxLength={80} placeholder="USER_ROLE_CHANGED" /></div>
      <div><label className="field-label" htmlFor="auditTargetType">Target type</label><Input id="auditTargetType" value={draft.targetType} onChange={(event) => setDraft({ ...draft, targetType: event.target.value })} maxLength={80} placeholder="User" /></div>
      <div><label className="field-label" htmlFor="auditTargetId">Target ID</label><Input id="auditTargetId" value={draft.targetId} onChange={(event) => setDraft({ ...draft, targetId: event.target.value })} maxLength={100} /></div>
      <div><label className="field-label" htmlFor="auditActor">Actor user ID</label><Input id="auditActor" value={draft.actorUserId} onChange={(event) => setDraft({ ...draft, actorUserId: event.target.value })} maxLength={80} /></div>
      <div><label className="field-label" htmlFor="auditFrom">From</label><Input id="auditFrom" type="datetime-local" value={dateTimeLocalValue(draft.from)} onChange={(event) => setDraft({ ...draft, from: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></div>
      <div><label className="field-label" htmlFor="auditTo">To</label><Input id="auditTo" type="datetime-local" value={dateTimeLocalValue(draft.to)} onChange={(event) => setDraft({ ...draft, to: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><Button type="submit"><Search size={15} />Apply filters</Button><Button type="button" variant="outline" onClick={() => { const empty = { action: '', targetType: '', targetId: '', actorUserId: '', from: '', to: '' }; setDraft(empty); setFilters(empty); setIntegrity(null); }}>Clear</Button></div>
    </form></CardContent></Card>

    <Card><CardHeader><CardTitle>Recorded actions</CardTitle><CardDescription>{query.data.total.toLocaleString('en-GB')} records match these filters. Hash values and metadata are available for investigation.</CardDescription></CardHeader><CardContent>
      <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(120px,.8fr)_minmax(100px,.7fr)_minmax(150px,1fr)] gap-3 border-b border-border pb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid"><span>Action / time</span><span>Actor</span><span>Target</span><span>Chain hash</span></div>
      <div className="divide-y divide-border">{logs.map((item) => <details key={item.id} className="py-4"><summary className="grid cursor-pointer list-none gap-3 lg:grid-cols-[minmax(140px,1fr)_minmax(120px,.8fr)_minmax(100px,.7fr)_minmax(150px,1fr)] lg:items-center"><span><span className="block text-sm font-semibold text-secondary-foreground">{item.action}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(item.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></span><span className="text-sm text-secondary-foreground">{item.actor ? `${item.actor.firstName} ${item.actor.lastName}` : item.actorUserId}<span className="mt-1 block text-xs text-muted-foreground">{item.actor?.email || ''}</span></span><span className="break-all text-xs text-muted-foreground">{item.targetType} · {item.targetId}</span><span className="break-all font-mono text-[10px] text-muted-foreground">{item.currentHash}</span></summary><div className="mt-4 grid gap-3 rounded-xl bg-secondary/50 p-4 text-xs sm:grid-cols-2"><div><p className="font-semibold text-secondary-foreground">Previous hash</p><p className="mt-1 break-all font-mono text-muted-foreground">{item.previousHash}</p></div><div><p className="font-semibold text-secondary-foreground">Request fingerprints</p><p className="mt-1 break-all font-mono text-muted-foreground">IP: {item.ipHash || 'Not recorded'} · Agent: {item.userAgentHash || 'Not recorded'}</p></div><div className="sm:col-span-2"><p className="font-semibold text-secondary-foreground">Metadata</p><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{JSON.stringify(item.metadata, null, 2)}</pre></div><div className="sm:col-span-2"><p className="font-semibold text-secondary-foreground">Record ID</p><p className="mt-1 break-all font-mono text-muted-foreground">{item.id}</p></div></div></details>)}</div>
      {!logs.length && <div className="py-10 text-center text-sm text-muted-foreground">No administrative audit records match these filters.</div>}
    </CardContent></Card>
  </div>;
}
