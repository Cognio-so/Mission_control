import { cn } from '../../lib/utils.js'

const AGENT = {
  online: 'bg-[color:var(--success)]', busy: 'bg-[color:var(--warning)]', provisioning: 'bg-[color:var(--warning)]',
  updating: 'bg-[color:var(--accent)]', deleting: 'bg-[color:var(--danger)]', offline: 'bg-[color:var(--text-quiet)]',
  running: 'bg-[color:var(--success)]', ready: 'bg-[color:var(--accent)]', done: 'bg-[color:var(--success)]',
  error: 'bg-[color:var(--danger)]', idle: 'bg-[color:var(--border-strong)]',
}
const APPROVAL = { approved: 'bg-[color:var(--success)]', rejected: 'bg-[color:var(--danger)]', pending: 'bg-[color:var(--warning)]' }
const TASK = {
  inbox: 'bg-[color:var(--text-quiet)]', assigned: 'bg-[color:var(--accent)]', in_progress: 'bg-[color:var(--accent-strong)]',
  testing: 'bg-[color:var(--warning)]', review: 'bg-[color:var(--accent-strong)]', done: 'bg-[color:var(--success)]',
}
const MAP = { agent: AGENT, approval: APPROVAL, task: TASK }
const DEFAULT = { agent: 'bg-[color:var(--border-strong)]', approval: 'bg-[color:var(--warning)]', task: 'bg-[color:var(--border-strong)]' }

export function statusDotClass(status, variant = 'agent') {
  const n = (status ?? '').trim().toLowerCase()
  if (!n) return DEFAULT[variant]
  return MAP[variant][n] ?? DEFAULT[variant]
}

export function StatusDot({ status, variant = 'agent', pulse = false, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-2.5 w-2.5 rounded-full', statusDotClass(status, variant), pulse && 'animate-pulse-ring', className)}
    />
  )
}
