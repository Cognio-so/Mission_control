import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ChevronDown, Bot, Terminal } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { cn, cleanIcon } from '../lib/utils.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'

const isEndDivider = (t) => t.kind === 'divider' && /^run (complete|failed)$/i.test(String(t.text || '').trim())

// Collapse the flat timeline into runs delimited by the run-boundary dividers.
// Each run keeps the operations (plan steps, tool calls, delegated agents) inside it.
function groupRuns(timeline, anyRunning) {
  const runs = []
  let cur = null
  let n = 0
  const start = (title) => { n += 1; cur = { id: 'run_' + n, num: n, title, ops: [], status: null }; runs.push(cur) }
  for (const t of timeline) {
    if (t.kind === 'divider') {
      if (isEndDivider(t)) {
        if (!cur) start(null)
        cur.status = /failed/i.test(String(t.text)) ? 'error' : 'done'
        cur = null
      } else {
        start(t.text && !/^run started$/i.test(t.text.trim()) ? t.text : null)
      }
      continue
    }
    if (!cur) start(null)
    cur.ops.push(t)
  }
  runs.forEach((r, i) => {
    if (r.status == null) r.status = i === runs.length - 1 && anyRunning ? 'running' : 'done'
  })
  return runs
}

export default function ActivityPage() {
  const { state, anyRunning } = useMission()
  const runs = groupRuns(state.timeline, anyRunning).reverse() // newest run first

  return (
    <PageLayout kicker="Overview" title="Live feed" description="Every run as it streams from the broker — grouped by run. Open a card to inspect every plan step, tool call, and delegated agent." wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          {runs.length === 0 && state.raw.length === 0 ? (
            <EmptyPanel icon={Activity} title="No activity yet" hint="Start a run from Mission Control and runs will stream here in real time." />
          ) : (
            <div className="space-y-3">
              {runs.length === 0 && (
                <div className="rounded-xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-4 py-3 text-sm text-muted">
                  No agent runs yet this session — start one from Mission Control. The broker session log is below.
                </div>
              )}
              {runs.map((run, i) => (
                <RunCard key={run.id} run={run} defaultOpen={i === 0} delay={Math.min(i * 0.04, 0.3)} />
              ))}
              {state.raw.length > 0 && (
                <SessionCard conn={state.conn} raw={state.raw} defaultOpen={runs.length === 0} delay={Math.min(runs.length * 0.04 + 0.04, 0.34)} />
              )}
            </div>
          )}
        </Card>

        <Card className="flex h-[70vh] flex-col p-0">
          <div className="border-b border-[color:var(--border)] px-4 py-3 text-sm font-semibold text-strong">Raw broker log</div>
          <div className="flex-1 space-y-0.5 overflow-y-auto bg-slate-950 px-3 py-2 font-mono text-[11px] scrollbar-thin">
            {state.raw.length === 0 ? (
              <div className="text-slate-500">Waiting for broker frames…</div>
            ) : state.raw.map((r) => (
              <div key={r.id} className={cn(
                r.kind === 'err' && 'text-rose-400', r.kind === 'sys' && 'text-sky-400',
                r.kind === 'in' && 'text-emerald-400', r.kind === 'out' && 'text-amber-300',
                !['err', 'sys', 'in', 'out'].includes(r.kind) && 'text-slate-300')}>{r.line}</div>
            ))}
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}

function RunCard({ run, defaultOpen, delay }) {
  const [open, setOpen] = useState(defaultOpen)
  const dotStatus = run.status === 'error' ? 'error' : run.status === 'done' ? 'done' : 'running'
  const agents = new Set(run.ops.filter((o) => o.kind === 'sub').map((o) => o.key || o.title)).size
  const errors = run.ops.filter((o) => o.cls === 'error' || o.badge === 'error').length

  const summary = [
    `${run.ops.length} operation${run.ops.length === 1 ? '' : 's'}`,
    agents ? `${agents} agent${agents === 1 ? '' : 's'}` : null,
    errors ? `${errors} error${errors === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm transition hover:border-[color:var(--border-strong)]"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--surface-tint)]"
        aria-expanded={open}
      >
        <StatusDot status={dotStatus} pulse={run.status === 'running'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-strong">{run.title || `Run ${run.num}`}</div>
          <div className="truncate text-xs text-muted">{summary}</div>
        </div>
        <RunStatusBadge status={run.status} />
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-quiet transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden border-t border-[color:var(--border)]"
          >
            <div className="max-h-[460px] space-y-1.5 overflow-y-auto bg-[color:var(--surface-2)] px-3 py-3 scrollbar-thin">
              {run.ops.length === 0 ? (
                <div className="px-1 py-6 text-center text-xs text-quiet">No operations recorded for this run.</div>
              ) : (
                run.ops.map((op) => <OperationRow key={op.id} op={op} />)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Always-present card folding the broker connection/health/system frames into the
// feed. Open by default when there are no runs yet; collapsed beneath run cards otherwise.
function SessionCard({ conn, raw, defaultOpen, delay }) {
  const [open, setOpen] = useState(defaultOpen)
  const live = conn === 'live' || conn === 'demo'
  const frames = [...raw].reverse() // newest first, like the run cards
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-sm transition hover:border-[color:var(--border-strong)]"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--surface-tint)]"
        aria-expanded={open}
      >
        <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--surface-muted)] text-[color:var(--accent-strong)]">
          {live && <span className="absolute inset-0 animate-pulse-ring rounded-lg" />}
          <Terminal className="relative h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-strong">Broker session</div>
          <div className="truncate text-xs text-muted">{raw.length} frame{raw.length === 1 ? '' : 's'} · {live ? 'connected' : conn}</div>
        </div>
        <Badge variant={live ? 'accent' : 'outline'}>{live ? 'live' : 'system'}</Badge>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-quiet transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden border-t border-[color:var(--border)]"
          >
            <div className="max-h-[460px] space-y-0.5 overflow-y-auto bg-slate-950 px-3 py-3 font-mono text-[11px] leading-relaxed scrollbar-thin">
              {frames.map((r) => (
                <div key={r.id} className={cn(
                  r.kind === 'err' && 'text-rose-400', r.kind === 'sys' && 'text-sky-400',
                  r.kind === 'in' && 'text-emerald-400', r.kind === 'out' && 'text-amber-300',
                  !['err', 'sys', 'in', 'out'].includes(r.kind) && 'text-slate-300')}>{r.line}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function RunStatusBadge({ status }) {
  if (status === 'running') return <Badge variant="accent">live</Badge>
  if (status === 'error') return <Badge variant="danger">failed</Badge>
  return <Badge variant="success">done</Badge>
}

function SubBadge({ badge }) {
  const map = { queued: 'outline', running: 'accent', done: 'success', error: 'danger' }
  return <Badge variant={map[badge] || 'outline'}>{badge || 'queued'}</Badge>
}

// One operation inside a run — a delegated agent (sub) or a plan/tool node.
function OperationRow({ op }) {
  if (op.kind === 'sub') {
    return (
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--surface-muted)] text-[10px] font-bold text-strong">
            {cleanIcon(op.icon, 'A')}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-strong">{op.title}</div>
              {op.sub && <div className="truncate text-[11px] text-muted">{op.sub}</div>}
            </div>
          </div>
          <SubBadge badge={op.badge} />
        </div>
        {op.stream && (
          <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[color:var(--surface-muted)] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin">{op.stream}</pre>
        )}
        {op.result && (
          <div className="mt-2 rounded-lg bg-[color:var(--success-soft)] px-2.5 py-1.5 text-[11px] text-[color:var(--success)]">{op.result}</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-2.5',
      op.cls === 'error' ? 'border-rose-200 bg-rose-50' : op.cls === 'tool' ? 'border-blue-200 bg-blue-50' : 'border-[color:var(--border)] bg-[color:var(--surface)]',
    )}>
      <div className="flex items-center gap-2 text-xs font-semibold text-strong">
        <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', op.cls === 'error' ? 'bg-[color:var(--danger)]' : op.cls === 'tool' ? 'bg-[color:var(--info)]' : 'bg-[color:var(--accent)]')} />
        <span className="min-w-0 flex-1 break-words">{op.head || op.text || op.title || 'event'}</span>
        {op.tag && <Badge variant="accent">{op.tag}</Badge>}
        {op.status && <span className="shrink-0 text-[11px] font-normal text-quiet">{op.status}</span>}
      </div>
      {op.sub && <div className="mt-1 break-words text-[11px] text-muted">{op.sub}</div>}
      {op.pre && (
        <pre className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[color:var(--surface-muted)] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-muted scrollbar-thin">{op.pre}</pre>
      )}
    </div>
  )
}
