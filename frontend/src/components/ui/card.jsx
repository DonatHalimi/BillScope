import { cn } from '../../lib/cn.js';

export function Card({ className, ...props }) {
  return <section className={cn('rounded-2xl border border-border bg-surface shadow-soft', className)} {...props} />;
}
export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-3 sm:p-6 sm:pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-base font-semibold tracking-tight text-secondary-foreground', className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-2 sm:p-6 sm:pt-3', className)} {...props} />;
}
export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />;
}
