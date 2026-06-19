import * as React from 'react'
import { cn } from '../../lib/utils.js'

export const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm text-strong shadow-sm transition placeholder:text-[color:var(--text-quiet)] hover:border-[color:var(--border-strong)] focus-visible:border-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)]',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
