import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, CirclePlus, CreditCard, ReceiptText, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { EmptyState } from '../components/ui/empty-state.jsx';
import { LoadingPanel, ErrorPanel } from '../components/LoadingPanel.jsx';
import { useOverview, useForecast, useTransactions } from '../hooks/useFinanceQueries.js';
import { formatCurrency, formatDate, titleCase } from '../lib/format.js';

const chartPalette = ['hsl(var(--primary))', 'hsl(var(--accent))', '#7c8ca6', '#d8ab54', '#7e9b89', '#c78d8d'];

function buildMovementData(transactions = []) {
  const groups = new Map();
  for (const transaction of transactions) {
    if (transaction.type === 'TRANSFER') continue;
    const date = new Date(transaction.occurredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const group = groups.get(key) || { key, label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date), income: 0, spending: 0 };
    if (transaction.type === 'INCOME') group.income += Number(transaction.amount);
    if (transaction.type === 'EXPENSE') group.spending += Number(transaction.amount);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-10);
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'primary', delta }) {
  return <Card className="overflow-hidden">
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className={`grid size-10 place-items-center rounded-xl ${tone === 'income' ? 'bg-income/10 text-income' : tone === 'expense' ? 'bg-expense/10 text-expense' : 'bg-primary-subtle text-primary'}`}><Icon size={19} /></span></div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-secondary-foreground sm:text-[1.75rem]">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">{delta && <span className={delta === 'positive' ? 'font-medium text-income' : 'font-medium text-expense'}>{delta === 'positive' ? '↑' : '↓'}</span>}{detail}</div>
    </CardContent>
  </Card>;
}

function TransactionIcon({ type }) {
  if (type === 'INCOME') return <span className="grid size-9 place-items-center rounded-xl bg-income/10 text-income"><ArrowDownLeft size={17} /></span>;
  if (type === 'TRANSFER') return <span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ArrowLeftRight size={16} /></span>;
  return <span className="grid size-9 place-items-center rounded-xl bg-expense/10 text-expense"><ArrowUpRight size={17} /></span>;
}

export function DashboardPage() {
  const overviewQuery = useOverview();
  const forecastQuery = useForecast();
  const transactionsQuery = useTransactions(100);
  const overview = overviewQuery.data?.overview;
  const forecast = forecastQuery.data?.forecast;
  const transactions = transactionsQuery.data?.transactions || [];
  const movement = buildMovementData(transactions);
  const spendingByCategory = transactions.filter((item) => item.type === 'EXPENSE').reduce((items, item) => {
    items[item.category] = (items[item.category] || 0) + Number(item.amount);
    return items;
  }, {});
  const categoryData = Object.entries(spendingByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  if (overviewQuery.isLoading || forecastQuery.isLoading) return <div className="space-y-5"><div className="h-16 animate-pulse rounded-2xl bg-secondary" /><LoadingPanel /></div>;
  if (overviewQuery.isError) return <ErrorPanel message="Your overview could not be loaded." onRetry={() => overviewQuery.refetch()} />;
  if (!overview) return <EmptyState title="Your overview is not available" description="Sign in again to restore your finance workspace." actionLabel="Go to sign in" actionTo="/login" />;

  const currency = overview.currency || 'EUR';
  const netPositive = overview.netMonthlyCashFlow >= 0;
  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="eyebrow">{new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date())}, financial snapshot</p><h1 className="page-title mt-2">Your money at a glance</h1><p className="page-subtitle">Here is what is happening across your accounts this month.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/app/transfers"><ArrowLeftRight size={16} />Transfer</Link></Button><Button asChild><Link to="/app/transactions?new=1"><CirclePlus size={16} />Add transaction</Link></Button></div>
    </div>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account overview">
      <MetricCard title="Total balance" value={formatCurrency(overview.totalBalance, currency)} detail={`Across ${overview.accountCount} ${overview.accountCount === 1 ? 'account' : 'accounts'}`} icon={Wallet} />
      <MetricCard title="Income this month" value={formatCurrency(overview.monthlyIncome, currency)} detail="Posted income" icon={ArrowDownLeft} tone="income" />
      <MetricCard title="Spending this month" value={formatCurrency(overview.monthlyExpenses, currency)} detail="Posted expenses" icon={ArrowUpRight} tone="expense" />
      <MetricCard title="Monthly cash flow" value={formatCurrency(overview.netMonthlyCashFlow, currency)} detail={netPositive ? 'More money in than out' : 'Spending is above income'} icon={ChartNoAxesCombined} tone={netPositive ? 'income' : 'expense'} delta={netPositive ? 'positive' : 'negative'} />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Money movement</CardTitle><CardDescription className="mt-1">Income and spending across your recent transactions.</CardDescription></div><Badge variant="outline">Recent activity</Badge></CardHeader>
        <CardContent className="h-[285px] pt-1">
          {movement.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={movement} margin={{ top: 14, right: 4, left: -18, bottom: 0 }} barGap={5}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${currency === 'EUR' ? '€' : ''}${value}`} />
            <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', color: 'hsl(var(--secondary-foreground))', fontSize: 12 }} formatter={(value, name) => [formatCurrency(value, currency), name === 'income' ? 'Income' : 'Spending']} />
            <Bar dataKey="income" name="income" fill="hsl(var(--income))" radius={[5, 5, 0, 0]} maxBarSize={23} />
            <Bar dataKey="spending" name="spending" fill="hsl(var(--expense))" radius={[5, 5, 0, 0]} maxBarSize={23} />
          </BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-center"><div><p className="text-sm font-medium text-secondary-foreground">No movement yet</p><p className="mt-1 text-xs text-muted-foreground">Add a transaction or sync a mock bank connection to build this chart.</p></div></div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Spending categories</CardTitle><CardDescription className="mt-1">Based on your available posted expenses.</CardDescription></CardHeader>
        <CardContent>
          {categoryData.length ? <>
            <div className="h-[178px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={77} paddingAngle={3} stroke="none">{categoryData.map((entry, index) => <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />)}</Pie><Tooltip formatter={(value) => formatCurrency(value, currency)} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', color: 'hsl(var(--secondary-foreground))', fontSize: 12 }} /></PieChart></ResponsiveContainer></div>
            <div className="mt-2 space-y-2.5">{categoryData.slice(0, 4).map((item, index) => <div key={item.name} className="flex items-center gap-2.5 text-sm"><span className="size-2.5 rounded-full" style={{ background: chartPalette[index % chartPalette.length] }} /><span className="flex-1 text-muted-foreground">{item.name}</span><span className="font-medium tabular-nums text-secondary-foreground">{formatCurrency(item.value, currency)}</span></div>)}</div>
          </> : <div className="py-7 text-center"><p className="text-sm font-medium text-secondary-foreground">Categories will show here</p><p className="mt-1 text-xs leading-5 text-muted-foreground">BillScope suggests categories from merchant and description patterns.</p></div>}
        </CardContent>
      </Card>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent transactions</CardTitle><CardDescription className="mt-1">Your latest account activity.</CardDescription></div><Button variant="ghost" size="sm" asChild><Link to="/app/transactions">View all <ArrowRight size={15} /></Link></Button></CardHeader>
        <CardContent className="pt-0">
          {transactionsQuery.isLoading ? <div className="space-y-4 py-3">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-secondary" />)}</div> : overview.recentTransactions.length ? <div className="divide-y divide-border">{overview.recentTransactions.slice(0, 6).map((item) => <div key={item.id} className="flex items-center gap-3 py-3.5">
            <TransactionIcon type={item.type} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-secondary-foreground">{item.merchant || item.description}</p><p className="mt-1 text-xs text-muted-foreground">{titleCase(item.category)} · {formatDate(item.occurredAt, { day: 'numeric', month: 'short' })}</p></div><div className="text-right"><p className={`text-sm font-semibold tabular-nums ${item.type === 'INCOME' ? 'text-income' : 'text-secondary-foreground'}`}>{item.type === 'INCOME' ? '+' : item.type === 'TRANSFER' ? '' : '−'}{formatCurrency(item.amount, currency)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.account?.name || 'Account'}</p></div>
          </div>)}</div> : <EmptyState title="No transactions yet" description="Connect a mock bank account or add your first transaction to see your activity here." actionLabel="Go to accounts" actionTo="/app/accounts" icon={ReceiptText} />}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="overflow-hidden border-primary/10">
          <div className="bg-primary px-5 py-4 text-primary-foreground sm:px-6"><div className="flex items-center justify-between"><span className="text-sm font-medium text-white/75">30-day forecast</span><ChartNoAxesCombined size={19} className="text-emerald-200" /></div><p className="mt-2 text-3xl font-semibold tracking-tight">{forecastQuery.isError ? '—' : formatCurrency(forecast?.projectedBalance, forecast?.currency || currency)}</p><p className="mt-1 text-xs text-white/65">Projected balance after planned income, bills and average spending.</p></div>
          <CardContent className="space-y-3 pt-4">
            <ForecastRow label="Current balance" value={forecast?.currentBalance} currency={currency} />
            <ForecastRow label="Expected income" value={forecast?.incomingIncome} currency={currency} positive />
            <ForecastRow label="Upcoming bills" value={forecast?.upcomingBills} currency={currency} />
            <ForecastRow label="Average monthly spend" value={forecast?.averageMonthlySpend} currency={currency} />
            <Button variant="outline" className="mt-2 w-full" asChild><Link to="/app/forecast">Review forecast <ArrowRight size={15} /></Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><CalendarDays size={19} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-secondary-foreground">Bills coming up</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{overview.upcomingBillsCount ? `${overview.upcomingBillsCount} bill${overview.upcomingBillsCount === 1 ? '' : 's'} due in the next 30 days.` : 'No upcoming bills recorded for the next 30 days.'}</p><Link className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" to="/app/calendar">Open calendar <ArrowRight size={14} /></Link></div></CardContent>
        </Card>
      </div>
    </section>
  </div>;
}

function ForecastRow({ label, value, currency, positive = false }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className={`font-medium tabular-nums ${positive ? 'text-income' : 'text-secondary-foreground'}`}>{positive ? '+' : ''}{formatCurrency(value || 0, currency)}</span></div>;
}
