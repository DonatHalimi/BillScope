import { ArrowRight, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './button.jsx';

export function EmptyState({ title, description, actionLabel, actionTo, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-subtle text-primary"><Icon size={22} /></span>
      <h3 className="text-sm font-semibold text-secondary-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {actionLabel && actionTo && <Button asChild className="mt-4"><Link to={actionTo}>{actionLabel}<ArrowRight size={15} /></Link></Button>}
    </div>
  );
}
