import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowLeftRight, Banknote, CalendarDays, ChartNoAxesCombined,
  ChevronRight, CircleHelp, CreditCard, LayoutDashboard, LogOut, Menu,
  Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Wallet, X, Landmark
} from 'lucide-react';
import { AppLogo } from '../components/AppLogo.jsx';
import { Button } from '../components/ui/button.jsx';
import { getInitials } from '../lib/format.js';
import { useAuth } from '../auth/AuthContext.jsx';

const navItems = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/accounts', label: 'Accounts', icon: Wallet },
  { to: '/app/transactions', label: 'Transactions', icon: Activity },
  { to: '/app/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/app/calendar', label: 'Bill calendar', icon: CalendarDays },
  { to: '/app/budgets', label: 'Spending limits', icon: SlidersHorizontal },
  { to: '/app/forecast', label: 'Forecast', icon: ChartNoAxesCombined }
];

function SideNavigation({ closeMenu }) {
  const { user } = useAuth();
  return <>
    <div className="px-6 pb-7 pt-5"><AppLogo /></div>
    <div className="px-4"><p className="eyebrow px-3 pb-2">Money</p>
      <nav aria-label="Main navigation" className="space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={closeMenu} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}`}>
          <Icon size={18} strokeWidth={1.9} /><span>{label}</span><ChevronRight className="ml-auto opacity-0 transition group-hover:opacity-50" size={15} />
        </NavLink>)}
      </nav>
    </div>
    <div className="mt-8 px-4"><p className="eyebrow px-3 pb-2">Manage</p>
      <nav aria-label="Account navigation" className="space-y-1">
        <NavLink to="/app/settings" onClick={closeMenu} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}`}><Settings2 size={18} />Settings</NavLink>
        {user?.role === 'PROVIDER' && <NavLink to="/app/provider" onClick={closeMenu} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}`}><Landmark size={18} />Provider portal</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/app/admin" onClick={closeMenu} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}`}><ShieldCheck size={18} />Admin portal</NavLink>}
      </nav>
    </div>
    <div className="mt-auto px-5 pb-5 pt-8">
      <div className="rounded-2xl bg-primary-subtle p-4">
        <span className="grid size-9 place-items-center rounded-xl bg-surface text-primary"><Sparkles size={17} /></span>
        <p className="mt-3 text-sm font-semibold text-primary">A little more clarity</p>
        <p className="mt-1 text-xs leading-5 text-primary/80">Connect a mock bank to populate your real dashboard flow with test transactions.</p>
        <NavLink onClick={closeMenu} to="/app/accounts" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Connect account <ChevronRight size={13} /></NavLink>
      </div>
      <div className="mt-4 flex items-center gap-2 px-1 text-xs text-muted-foreground"><CircleHelp size={14} />BillScope local MVP</div>
    </div>
  </>;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return <div className="min-h-screen bg-canvas">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[258px] flex-col border-r border-border bg-surface lg:flex"><SideNavigation /></aside>
    {mobileNavOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/30" onClick={() => setMobileNavOpen(false)} />
      <aside className="relative flex h-full w-[min(300px,85vw)] flex-col border-r border-border bg-surface shadow-xl"><button aria-label="Close navigation menu" className="absolute right-3 top-5 z-10 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setMobileNavOpen(false)}><X size={19} /></button><SideNavigation closeMenu={() => setMobileNavOpen(false)} /></aside>
    </div>}
    <div className="min-h-screen lg:pl-[258px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border bg-canvas/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></Button><div className="hidden sm:block"><p className="text-xs text-muted-foreground">Personal finance workspace</p><p className="mt-0.5 text-sm font-semibold text-secondary-foreground">Good to see you, {user?.firstName || 'there'}</p></div><div className="sm:hidden"><AppLogo compact /></div></div>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground md:inline-flex"><span className="mr-2 mt-1 size-1.5 rounded-full bg-accent" />{user?.preferredCurrency || 'EUR'} overview</span><div className="grid size-9 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary" aria-label={`${user?.firstName} profile`}>{getInitials(user?.firstName, user?.lastName)}</div><Button variant="ghost" size="sm" onClick={signOut} disabled={isSigningOut} className="gap-1.5"> <LogOut size={15} /><span className="hidden sm:inline">{isSigningOut ? 'Signing out…' : 'Sign out'}</span></Button></div>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-7 lg:p-9"><Outlet /></main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-7 lg:px-9">BillScope · Your money, in focus</footer>
    </div>
  </div>;
}
