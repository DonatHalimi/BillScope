import { cloneElement, forwardRef, isValidElement } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-surface text-secondary-foreground hover:bg-elevated',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-5',
        icon: 'size-9'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);

export const Button = forwardRef(function Button({ className, variant, size, type = 'button', asChild = false, children, ...props }, ref) {
  const classes = cn(buttonVariants({ variant, size, className }));
  if (asChild) {
    if (!isValidElement(children)) throw new TypeError('Button with asChild requires one React element child.');
    return cloneElement(children, {
      ...props,
      ref,
      className: cn(classes, children.props.className),
      onClick: props.onClick ? (event) => { children.props.onClick?.(event); if (!event.defaultPrevented) props.onClick(event); } : children.props.onClick
    });
  }
  return <button ref={ref} type={type} className={classes} {...props}>{children}</button>;
});

export { buttonVariants };
