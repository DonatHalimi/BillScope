import { ShieldCheck, ChartNoAxesCombined, CalendarClock, CircleCheck } from 'lucide-react';
import { AppLogo } from '../components/AppLogo.jsx';

const benefits = [
  { icon: ChartNoAxesCombined, title: 'See the full picture', body: 'Accounts, spending, and savings in one calm overview.' },
  { icon: CalendarClock, title: 'Stay ahead of bills', body: 'Know what is due before it becomes urgent.' },
  { icon: ShieldCheck, title: 'Keep control of your data', body: 'Short-lived access tokens and protected refresh sessions.' }
];

export function AuthLayout({ children, title, subtitle }) {
  return (
    <main className="min-h-screen bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-surface shadow-card lg:grid-cols-[1.04fr_.96fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-white lg:flex xl:p-14">
          <div className="absolute -right-24 -top-20 size-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-32 -left-16 size-96 rounded-full border border-white/10" />
          <div className="absolute right-14 top-36 size-28 rounded-full bg-accent/10 blur-2xl" />
          <AppLogo to="/login" inverse />
          <div className="relative z-10 max-w-lg">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-emerald-100"><CircleCheck size={14} /> Money clarity, without the noise</span>
            <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Make every euro feel more intentional.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/70">BillScope brings everyday money, future bills, and spending patterns into one clear view.</p>
            <div className="mt-10 space-y-5">
              {benefits.map(({ icon: Icon, title: itemTitle, body }) => <div className="flex gap-3" key={itemTitle}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200"><Icon size={20} /></span>
                <div><p className="text-sm font-semibold">{itemTitle}</p><p className="mt-1 max-w-xs text-sm leading-5 text-white/65">{body}</p></div>
              </div>)}
            </div>
          </div>
          <p className="relative z-10 text-xs text-white/45">Personal finance tools · EUR by default · Local-first MVP</p>
        </section>
        <section className="flex items-center justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-16">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden"><AppLogo to="/login" /></div>
            <p className="eyebrow">BillScope account</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-secondary-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">Your financial account is private. Never share your password or verification codes.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
