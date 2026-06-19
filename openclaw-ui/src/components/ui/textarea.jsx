import * as React from 'react'
import { cn } from '../../lib/utils.js'

export const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[120px] w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-strong shadow-sm transition placeholder:text-[color:var(--text-quiet)] hover:border-[color:var(--border-strong)] focus-visible:border-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-soft)]',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
