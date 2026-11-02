import { Link } from 'react-router-dom';
import logo from '../../icon.png';

export function AppLogo({ to = '/app', compact = false, inverse = false }) {
  return (
    <Link to={to} className="group inline-flex w-fit items-center gap-2.5" aria-label="BillScope home">
      <span className={`grid size-10 place-items-center rounded-2xl ${inverse ? 'bg-white/10 text-white' : 'bg-primary text-primary-foreground'} shadow-sm transition group-hover:scale-[1.03]`}>
        <img src={logo} alt="BillScope logo" className="w-10 h-10" />
      </span>
      {!compact && <span className={`text-lg font-semibold tracking-tight ${inverse ? 'text-white' : 'text-secondary-foreground'}`}>bill<span className={inverse ? 'text-emerald-300' : 'text-primary'}>scope</span></span>}
    </Link>
  );
}
