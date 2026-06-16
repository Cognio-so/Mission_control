import { cn } from '../../lib/utils.js'

const AGENT = {
  online: 'bg-emerald-500', busy: 'bg-amber-500', provisioning: 'bg-amber-500',
  updating: 'bg-sky-500', deleting: 'bg-rose-500', offline: 'bg-slate-400',
  running: 'bg-emerald-500', ready: 'bg-sky-500', idle: 'bg-slate-300',
}
const APPROVAL = { approved: 'bg-emerald-500', rejected: 'bg-rose-500', pending: 'bg-amber-500' }
const TASK = {
  inbox: 'bg-slate-400', assigned: 'bg-sky-500', in_progress: 'bg-purple-500',
  testing: 'bg-amber-500', review: 'bg-indigo-500', done: 'bg-emerald-500',
}
const MAP = { agent: AGENT, approval: APPROVAL, task: TASK }
const DEFAULT = { agent: 'bg-slate-300', approval: 'bg-amber-500', task: 'bg-slate-300' }

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
