import * as React from 'react'
import { cn } from '../../lib/utils.js'

export const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-11 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm text-strong shadow-sm placeholder:text-[color:var(--text-quiet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
