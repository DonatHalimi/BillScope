import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary-subtle text-primary',
      secondary: 'bg-secondary text-secondary-foreground',
      success: 'bg-income/10 text-income',
      danger: 'bg-expense/10 text-expense',
      warning: 'bg-amber-100 text-amber-800',
      outline: 'border border-border bg-surface text-muted-foreground'
    }
  },
  defaultVariants: { variant: 'default' }
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
