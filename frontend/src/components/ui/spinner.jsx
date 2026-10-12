import { LoaderCircle } from 'lucide-react';

export function Spinner({ label = 'Loading' }) {
  return <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="animate-spin" size={17} />{label}</span>;
}
