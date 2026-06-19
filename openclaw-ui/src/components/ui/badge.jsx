import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
  {
    variants: {
      variant: {
        default: 'bg-[color:var(--surface-muted)] text-strong',
        outline: 'border border-[color:var(--border-strong)] text-[color:var(--text-muted)]',
        accent: 'bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]',
        success: 'border border-[color:var(--border-accent)] bg-[color:var(--success-soft)] text-[color:var(--success)]',
        warning: 'border border-transparent bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
        danger: 'border border-transparent bg-[color:var(--danger-soft)] text-[color:var(--danger)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
