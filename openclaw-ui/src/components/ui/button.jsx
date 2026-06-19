import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'rounded-full text-white [background-image:var(--grad-brand)] shadow-[0_14px_30px_var(--accent-glow)] hover:-translate-y-px hover:brightness-[1.05] active:translate-y-0 active:brightness-100',
        secondary:
          'border border-[color:var(--border)] bg-[color:var(--surface)] text-strong shadow-sm hover:-translate-y-px hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]',
        outline:
          'border border-[color:var(--border-strong)] bg-transparent text-strong hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]',
        ghost: 'bg-transparent text-strong hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]',
        danger: 'bg-[color:var(--danger)] text-white shadow-sm hover:-translate-y-px hover:brightness-[1.05]',
      },
      size: {
        xs: 'h-8 px-3 text-xs',
        sm: 'h-9 px-4',
        md: 'h-11 px-5',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
))
Button.displayName = 'Button'
