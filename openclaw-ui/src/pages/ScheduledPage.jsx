import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bot, CalendarClock, CheckCircle2, Clock, History, Loader2, PauseCircle, Play, Plus,
  RefreshCw, TerminalSquare, Timer, Trash2, XCircle, ChevronDown,
} from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { cn } from '../lib/utils.js'
import { Markdown } from '../components/atoms/Markdown.jsx'
import { useMission } from '../store/mission.jsx'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Textarea } from '../components/ui/textarea.jsx'

function valueOf(obj, keys, fallback = null) {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function formatDate(value) {
  if (!value) return '-'
  if (typeof value === 'string' && Number.isNaN(Date.parse(value))) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(value) {
  if (value === undefined || value === null || value === '') return '-'
  const ms = Number(value)
  if (!Number.isFinite(ms)) return String(value)
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

// Human label for the schedule across the broker's per-kind fields:
// cron → `expr`, one-shot → `at` (ISO), interval → `every` (ms or "5m").
function formatEvery(value) {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) {
    if (n % 86400000 === 0) return n / 86400000 + 'd'
    if (n % 3600000 === 0) return n / 3600000 + 'h'
    if (n % 60000 === 0) return n / 60000 + 'm'
    if (n % 1000 === 0) return n / 1000 + 's'
    return n + 'ms'
  }
  return String(value)
}

function scheduleLabel(job) {
  const at = valueOf(job, ['at', 'runAt', 'run_at'])
  const every = valueOf(job, ['every', 'interval', 'intervalMs', 'interval_ms'])
  const cron = valueOf(job, ['expr', 'cron', 'cronExpression', 'cron_expression', 'expression', 'schedule'])
  const kind = String(valueOf(job, ['kind', 'type'], '')).toLowerCase()
  if (kind.includes('interval') || (every != null && !cron && !at)) return 'Every ' + formatEvery(every)
  if (kind.includes('once') || kind.includes('one') || kind === 'at' || (at && !cron)) return 'Once · ' + formatDate(at)
  if (cron) return String(cron)
  if (at) return 'Once · ' + formatDate(at)
  if (every != null) return 'Every ' + formatEvery(every)
  return '-'
}

// "in 4m 12s" / "12s ago" relative to now.
function relTime(target) {
  const diff = target - Date.now()
  const s = Math.floor(Math.abs(diff) / 1000)
  const label = s < 60 ? `${s}s`
    : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s`
      : s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
        : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  return diff >= 0 ? `in ${label}` : `${label} ago`
}

function NextRunValue({ value }) {
  const [, force] = useState(0)
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(id) }, [])
  if (!value) return '-'
  const target = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(target)) return String(value)
  const diff = target - Date.now()
  return (
    <span>
      {formatDate(target)}{' '}
      <span className={cn('font-semibold', diff >= 0 ? 'text-[color:var(--accent-strong)]' : 'text-[color:var(--warning)]')}>· {relTime(target)}</span>
    </span>
  )
}

function statusTone(status) {
  const s = String(status || '').toLowerCase()
  if (['success', 'succeeded', 'done', 'ok', 'completed', 'active', 'enabled'].includes(s)) return 'success'
  if (['running', 'queued', 'pending'].includes(s)) return 'warning'
  if (['failed', 'failure', 'error', 'disabled', 'paused'].includes(s)) return s === 'paused' || s === 'disabled' ? 'outline' : 'danger'
  return 'outline'
}

// A job is "executing right now" if its current run (or its own state) is running/queued.
function isRunning(job) {
  const run = String(job?.latest?.status || '').toLowerCase()
  const own = String(job?.status || '').toLowerCase()
  return ['running', 'queued', 'pending', 'in_progress'].includes(run) || own === 'running'
}

function normalizeRun(run = {}) {
  return {
    id: valueOf(run, ['id', 'runId', 'run_id'], Math.random().toString(36).slice(2)),
    status: String(valueOf(run, ['status', 'state', 'result'], 'unknown')),
    startedAt: valueOf(run, ['startedAt', 'started_at', 'start', 'createdAt', 'created_at']),
    finishedAt: valueOf(run, ['finishedAt', 'finished_at', 'end', 'completedAt', 'completed_at']),
    durationMs: valueOf(run, ['durationMs', 'duration_ms', 'elapsedMs', 'elapsed_ms']),
    output: valueOf(run, ['output', 'summary', 'message', 'resultText', 'result_text', 'stdout', 'lastOutput'], ''),
    error: valueOf(run, ['error', 'stderr', 'lastError'], ''),
  }
}

// A past cron run (from GET /cron/runs) — survives even if its job was deleted/disabled.
function normalizeHistoryRun(run = {}) {
  return {
    ...normalizeRun(run),
    name: String(valueOf(run, ['name', 'jobName', 'job_name', 'title'], 'Scheduled run')),
    agent: valueOf(run, ['agent', 'agentName', 'agent_name', 'agentId', 'agent_id'], ''),
  }
}

function normalizeJob(job = {}) {
  const runs = Array.isArray(job.runs) ? job.runs.map(normalizeRun) : []
  const latest = runs[0] || normalizeRun({
    status: valueOf(job, ['lastStatus', 'last_status', 'lastResult', 'last_result', 'result']),
    startedAt: valueOf(job, ['lastRun', 'last_run', 'lastStartedAt', 'last_started_at']),
    finishedAt: valueOf(job, ['lastFinishedAt', 'last_finished_at']),
    durationMs: valueOf(job, ['durationMs', 'duration_ms', 'lastDurationMs', 'last_duration_ms']),
    output: valueOf(job, ['lastOutput', 'last_output', 'output', 'summary', 'lastSummary', 'last_summary']),
    error: valueOf(job, ['lastError', 'last_error', 'error']),
  })

  const enabled = valueOf(job, ['enabled', 'active'])
  const status = valueOf(
    job,
    ['status', 'state'],
    enabled === false ? 'paused' : enabled === true ? 'active' : 'active',
  )

  return {
    id: String(valueOf(job, ['id', 'name', 'key'], 'job')),
    name: String(valueOf(job, ['name', 'title', 'id'], 'Scheduled job')),
    status: String(status),
    schedule: scheduleLabel(job),
    timezone: valueOf(job, ['timezone', 'tz'], ''),
    agent: valueOf(job, ['agent', 'agentName', 'agent_name', 'agentId', 'agent_id', 'session', 'sessionKey'], 'Main'),
    message: valueOf(job, ['message', 'prompt', 'task', 'description'], ''),
    nextRun: valueOf(job, ['nextRun', 'next_run', 'nextAt', 'next_at', 'next', 'nextWakeAtMs', 'next_wake_at_ms']),
    lastRun: valueOf(job, ['lastRun', 'last_run', 'lastAt', 'last_at', 'last']),
    runCount: valueOf(job, ['runCount', 'run_count', 'runsCount', 'runs_count', 'totalRuns', 'total_runs'], runs.length || 0),
    successCount: valueOf(job, ['successCount', 'success_count', 'successfulRuns', 'successful_runs']),
    failureCount: valueOf(job, ['failureCount', 'failure_count', 'failedRuns', 'failed_runs']),
    latest,
    runs: runs.slice(0, 3),
  }
}

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xl font-semibold text-strong">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </Card>
  )
}

function OutputPreview({ job, running }) {
  const text = job.latest.error || job.latest.output
  if (!text) {
    if (running) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--border-accent)] bg-[color:var(--accent-soft)] px-3 py-3 text-sm text-[color:var(--accent-strong)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Running now — output will appear here when it finishes.
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-3 text-sm text-muted">
        No output recorded for the latest run.
      </div>
    )
  }
  return (
    <div className={cn(
      'max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed scrollbar-thin',
      job.latest.error
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--text)]',
    )}>
      {text}
    </div>
  )
}

// One past run in the Recent-runs list — expands to its (markdown) output.
function HistoryRow({ run }) {
  const [open, setOpen] = useState(false)
  const text = run.error || run.output
  return (
    <Card className="p-0">
      <button type="button" onClick={() => text && setOpen((o) => !o)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', !text && 'cursor-default')}>
        <Badge variant={statusTone(run.status)}>{run.status}</Badge>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-strong">{run.name}</div>
          <div className="truncate text-xs text-muted">
            {run.agent ? run.agent + ' · ' : ''}{formatDate(run.startedAt)}{run.durationMs != null && run.durationMs !== '' ? ' · ' + formatDuration(run.durationMs) : ''}
          </div>
        </div>
        {text && <ChevronDown className={cn('h-4 w-4 shrink-0 text-[color:var(--text-quiet)] transition-transform', open && 'rotate-180')} />}
      </button>
      {open && text && (
        <div className="border-t border-[color:var(--border)] px-4 py-3">
          <div className={cn('max-h-80 overflow-y-auto rounded-lg border px-3 py-2 text-[12px] leading-relaxed scrollbar-thin',
            run.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-[color:var(--border)] bg-[color:var(--surface-muted)] text-strong')}>
            <Markdown content={text} />
          </div>
        </div>
      )}
    </Card>
  )
}

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const blankJob = () => ({
  name: '',
  agent: 'main',
  cron: '0 9 * * MON',
  timezone: defaultTimezone(),
  message: '',
})

export default function ScheduledPage() {
  const { agents, currentSessionKey } = useMission()
  const { data, source, loading, reload } = useApi(() => Api.cron.list(), [])
  const { data: historyData, reload: reloadHistory } = useApi(() => Api.cron.history(), [])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(blankJob)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const jobs = useMemo(() => (data || []).map(normalizeJob), [data])
  const history = useMemo(() => (historyData || []).map(normalizeHistoryRun), [historyData])
  const anyRunning = jobs.some(isRunning)
  // Poll so a job that fires shows its running state + output live here — faster while
  // running, slower when idle. (Needs the broker to report run status/output, and to expose
  // GET /cron/runs for past runs of self-deleted/disabled one-shots.)
  useEffect(() => {
    const id = setInterval(() => { reload(); reloadHistory() }, anyRunning ? 4000 : 12000)
    return () => clearInterval(id)
  }, [reload, reloadHistory, anyRunning])
  const agentOptions = useMemo(() => (
    (agents || []).map((agent) => ({
      id: agent.id,
      name: agent.name || agent.id,
      role: agent.kind === 'main' ? 'Main' : agent.kind === 'orchestrator' ? (agent.team || 'Team lead') : (agent.team ? agent.team + ' specialist' : 'Specialist'),
    }))
  ), [agents])

  const active = jobs.filter((j) => statusTone(j.status) === 'success').length
  const paused = jobs.filter((j) => ['paused', 'disabled'].includes(j.status.toLowerCase())).length
  const failures = jobs.filter((j) => statusTone(j.latest.status) === 'danger' || j.latest.error).length

  const mutate = async (key, fn) => {
    setBusy(key)
    setError('')
    try {
      await fn()
      await reload()
      return true
    } catch (err) {
      setError(err.message || 'Cron action failed')
      return false
    } finally {
      setBusy('')
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const payload = {
      name: form.name.trim(),
      agent: form.agent || 'main',
      cron: form.cron.trim(),
      timezone: form.timezone.trim() || undefined,
      message: form.message.trim(),
      // Route the run's result into this agent's chat thread (broker delivers there),
      // so the output lands where you'd look for it. Harmless if the broker ignores it.
      sessionKey: currentSessionKey ? currentSessionKey(form.agent || 'main') : undefined,
    }
    if (!payload.name || !payload.cron || !payload.message) {
      setError('Name, schedule, and message are required.')
      return
    }
    const ok = await mutate('create', () => Api.cron.create(payload))
    if (ok) {
      setForm(blankJob())
      setFormOpen(false)
    }
  }

  const runNow = (id) => mutate('run:' + id, () => Api.cron.run(id))
  const toggle = (job) => {
    const disabled = ['paused', 'disabled'].includes(job.status.toLowerCase())
    return mutate('toggle:' + job.id, () => disabled ? Api.cron.enable(job.id) : Api.cron.disable(job.id))
  }
  const remove = (job) => {
    const ok = window.confirm(`Delete scheduled job "${job.name}"?`)
    if (!ok) return null
    return mutate('delete:' + job.id, () => Api.cron.remove(job.id))
  }

  return (
    <PageLayout
      kicker="Operations"
      title="Scheduled jobs"
      description="Recurring agent runs, audits, and digests with timing, ownership, and latest output."
      actions={(
        <>
          <SourceBadge source={source} />
          <Button variant="secondary" size="sm" onClick={reload}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setFormOpen((open) => !open)}>
            <Plus className="h-4 w-4" /> New job
          </Button>
        </>
      )}
      wide
    >
      {formOpen && (
        <Card className="mb-5 p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_190px_210px]">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Weekly rank report" />
              </Field>
              <Field label="Schedule">
                <Input value={form.cron} onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))} className="font-mono" placeholder="0 9 * * MON" />
                <p className="mt-1 text-[11px] text-muted">Cron expression = recurring (stays on this page). One-time jobs self-delete after running — their output goes to the agent's chat.</p>
              </Field>
              <Field label="Timezone">
                <Input value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="Asia/Calcutta" />
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <Field label="Agent">
                <select
                  value={form.agent}
                  onChange={(e) => setForm((f) => ({ ...f, agent: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 text-sm text-strong shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                >
                  {agentOptions.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name} - {agent.role}</option>
                  ))}
                </select>
              </Field>
              <Field label="Message">
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  rows={3}
                  className="min-h-[88px]"
                  placeholder="Run the weekly rank report and summarize actions for the SEO team."
                />
              </Field>
            </div>
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={busy === 'create'}>Cancel</Button>
              <Button type="submit" disabled={busy === 'create'}>
                {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />}
                Create job
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && !formOpen && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyPanel
          icon={Clock}
          title="No scheduled jobs"
          hint="Scheduled agent runs will appear here once they are configured on the broker."
        >
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New job</Button>
        </EmptyPanel>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Total jobs" value={jobs.length} icon={CalendarClock} />
            <Stat label="Active" value={active} icon={CheckCircle2} />
            <Stat label="Paused" value={paused} icon={Clock} />
            <Stat label="Needs attention" value={failures} icon={XCircle} />
          </div>

          <div className="space-y-3">
            {jobs.map((job, i) => {
              const running = isRunning(job)
              return (
              <motion.div key={job.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className={cn('overflow-hidden p-0 transition', running && 'border-[color:var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]')}>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--border)] px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white shadow-sm [background-image:var(--grad-brand)]', running && 'animate-pulse-ring')}>
                        {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-strong">{job.name}</h3>
                          {running ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--warning)]">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--warning)]" /> Running now
                            </span>
                          ) : (
                            <>
                              <Badge variant={statusTone(job.status)}>{job.status}</Badge>
                              <Badge variant={statusTone(job.latest.status)}>{job.latest.status}</Badge>
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <CalendarClock className="h-3.5 w-3.5" /> {job.schedule}
                          </span>
                          {job.timezone && <span>{job.timezone}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Bot className="h-3.5 w-3.5" /> {job.agent}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" disabled={busy === 'toggle:' + job.id} onClick={() => toggle(job)}>
                        {busy === 'toggle:' + job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                        {['paused', 'disabled'].includes(job.status.toLowerCase()) ? 'Enable' : 'Disable'}
                      </Button>
                      <Button size="sm" disabled={busy === 'run:' + job.id} onClick={() => runNow(job.id)}>
                        {busy === 'run:' + job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {busy === 'run:' + job.id ? 'Running...' : 'Run now'}
                      </Button>
                      <Button size="icon" variant="ghost" className="text-rose-600 hover:bg-rose-50" disabled={busy === 'delete:' + job.id} onClick={() => remove(job)} title="Delete job">
                        {busy === 'delete:' + job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_1.2fr]">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">
                          <Timer className="h-3.5 w-3.5" /> Next run
                        </div>
                        <div className="mt-1 text-sm font-medium text-strong"><NextRunValue value={job.nextRun} /></div>
                      </div>
                      <Info icon={History} label="Last run" value={formatDate(job.lastRun || job.latest.startedAt)} />
                      <Info icon={CheckCircle2} label="Successful" value={job.successCount ?? '-'} />
                      <Info icon={XCircle} label="Failed" value={job.failureCount ?? '-'} />
                      <Info icon={TerminalSquare} label="Total runs" value={job.runCount} />
                      <Info icon={Timer} label="Duration" value={formatDuration(job.latest.durationMs)} />
                    </div>

                    <div>
                      {job.message && (
                        <div className="mb-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">Message</div>
                          <div className="line-clamp-3 whitespace-pre-wrap text-sm text-strong">{job.message}</div>
                        </div>
                      )}
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">Latest output</div>
                        {job.latest.finishedAt && <div className="text-xs text-muted">{formatDate(job.latest.finishedAt)}</div>}
                      </div>
                      <OutputPreview job={job} running={running} />
                    </div>
                  </div>

                  {job.runs.length > 0 && (
                    <div className="border-t border-[color:var(--border)] px-5 py-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">Recent runs</div>
                      <div className="grid gap-2 lg:grid-cols-3">
                        {job.runs.map((run) => (
                          <div key={run.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={statusTone(run.status)}>{run.status}</Badge>
                              <span className="text-muted">{formatDuration(run.durationMs)}</span>
                            </div>
                            <div className="mt-2 text-muted">{formatDate(run.startedAt)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">
            <History className="h-4 w-4" /> Recent runs
          </div>
          <div className="space-y-2">
            {history.map((run) => <HistoryRow key={run.id} run={run} />)}
          </div>
        </div>
      )}
    </PageLayout>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">{label}</span>
      {children}
    </label>
  )
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-quiet)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-strong">{value}</div>
    </div>
  )
}
