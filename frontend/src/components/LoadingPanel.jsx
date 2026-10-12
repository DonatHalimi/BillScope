import { Spinner } from './ui/spinner.jsx';

export function LoadingPanel({ label = 'Loading your finances…' }) {
  return <div className="panel flex min-h-44 items-center justify-center"><Spinner label={label} /></div>;
}

export function ErrorPanel({ message = 'This information could not be loaded.', onRetry }) {
  return <div className="panel flex min-h-44 flex-col items-center justify-center gap-3 p-6 text-center">
    <p className="text-sm text-muted-foreground">{message}</p>
    {onRetry && <button onClick={onRetry} className="text-sm font-medium text-primary underline underline-offset-4">Try again</button>}
  </div>;
}
