import * as React from 'react'
import { cn } from '../../lib/utils.js'

export const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[120px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-strong shadow-sm placeholder:text-[color:var(--text-quiet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
