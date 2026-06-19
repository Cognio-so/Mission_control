import { Database, Cloud } from 'lucide-react'
import { cn } from '../../lib/utils.js'

// Shows whether the data on screen came from the live broker or local demo fallback.
// 'unavailable' (no broker endpoint, demo off) renders nothing — the page shows an empty state.
export function SourceBadge({ source, className }) {
  if (source === 'broker') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-accent)] bg-[color:var(--success-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--success)]', className)}>
        <Cloud className="h-3 w-3" /> Live
      </span>
    )
  }
  if (source === 'demo') {
    return (
      <span
        title="Bundled demo data — set VITE_USE_DEMO_DATA=1 off / add the broker endpoint to go live."
        className={cn('inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[color:var(--warning-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--warning)]', className)}
      >
        <Database className="h-3 w-3" /> Demo data
      </span>
    )
  }
  return null
}
