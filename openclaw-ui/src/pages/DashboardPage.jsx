import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Radar, Store, LayoutGrid, ArrowRight, Zap, Loader2, MessageSquarePlus } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { ORCH_ID } from '../agents.js'
import { Api, useApi } from '../lib/api.js'
import { brokerHost } from '../broker.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'
import { InteractiveBackground } from '../components/atoms/InteractiveBackground.jsx'

// Operations inside the most recent (still-open) run.
function lastRunSlice(timeline) {
  let start = -1
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i]
    if (t.kind === 'divider' && !/^run (complete|failed)$/i.test(String(t.text || '').trim())) start = i
  }
  return start < 0 ? timeline : timeline.slice(start + 1)
}

export default function DashboardPage() {
  const { agents, managed, state, anyRunning, settings, newChat } = useMission()
  const navigate = useNavigate()
  const teamAgents = agents.filter((agent) => agent.kind !== 'main')
  const { data: boards } = useApi(() => Api.boards(), [])
  const { data: skills } = useApi(() => Api.skills(), [])

  const stats = [
    { label: 'Agents', value: teamAgents.length, icon: Bot, to: '/agents', tint: 'from-[#45a895] to-[#0f4b49]' },
    { label: 'Specialists', value: managed.length, icon: Radar, to: '/mission', tint: 'from-[#6aa99b] to-[#154f4c]' },
    { label: 'Boards', value: (boards || []).length, icon: LayoutGrid, to: '/boards', tint: 'from-[#8fbfb1] to-[#12524c]' },
    { label: 'Skills', value: (skills || []).length, icon: Store, to: '/skills/marketplace', tint: 'from-[#c99a55] to-[#8f6234]' },
  ]
  const connLive = state.conn === 'live' || state.conn === 'demo'

  return (
    <div className="relative min-h-full overflow-hidden">
      <InteractiveBackground className="pointer-events-none absolute inset-0 z-0 h-full w-full" />

      <div className="relative z-10">
        <PageLayout kicker="Overview" title="Mission Control" description="Your command center for Cognio agents - coordinate runs, manage skills, and track work across boards." wide>
          {/* hero banner */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="grad-hero relative mb-6 overflow-hidden rounded-2xl border border-[color:var(--border-accent)] p-7 text-[#f3faf7] shadow-[var(--shadow-pop)]"
          >
            <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 animate-glow-pulse rounded-full bg-white/10 blur-3xl" />
            <svg className="pointer-events-none absolute right-6 top-1/2 hidden h-32 w-44 -translate-y-1/2 opacity-30 md:block" viewBox="0 0 160 110" fill="none">
              <g stroke="#bfeede" strokeWidth="1.4">
                <line className="animate-edge-flow" x1="22" y1="22" x2="84" y2="55" />
                <line className="animate-edge-flow" x1="84" y1="55" x2="140" y2="26" />
                <line className="animate-edge-flow" x1="84" y1="55" x2="120" y2="92" />
              </g>
              <g fill="#d6f5ea">
                <circle cx="22" cy="22" r="5" />
                <circle cx="84" cy="55" r="7" />
                <circle cx="140" cy="26" r="5" />
                <circle cx="120" cy="92" r="5" />
              </g>
            </svg>

            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
                  <span className="relative flex h-2 w-2">
                    {connLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />}
                    <span className={`relative h-2 w-2 rounded-full ${connLive ? 'bg-emerald-300' : 'bg-rose-300'}`} />
                  </span>
                  {connLive ? 'Broker connected' : 'Broker offline'}
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{anyRunning ? 'A run is in progress' : 'Ready for the next run'}</h2>
                <p className="mt-1 text-sm text-[#c7e8df]">Connected to <span className="font-mono">{settings.demo ? 'demo workspace' : brokerHost(settings.base)}</span></p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => { newChat(ORCH_ID); navigate('/mission?chat=1') }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-[#f3faf7] backdrop-blur transition hover:-translate-y-px hover:bg-white/20"
                >
                  <MessageSquarePlus className="h-4 w-4" /> Start chat
                </button>
                <Link to="/mission" className="group inline-flex items-center gap-2 rounded-full bg-[#fffaf0] px-5 py-3 text-sm font-semibold text-[#0f4b49] shadow-sm transition hover:-translate-y-px hover:bg-white">
                  <Zap className="h-4 w-4" /> Open Mission Control
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.06, ease: 'easeOut' }} whileHover={{ y: -4 }}>
                <Link to={s.to}>
                  <Card className="group flex items-center gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-glow)]">
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${s.tint} text-white shadow-sm transition-transform group-hover:scale-105`}>
                      <s.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="font-heading text-2xl font-semibold text-strong">{s.value}</div>
                      <div className="text-xs text-muted">{s.label}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[color:var(--text-quiet)] transition group-hover:translate-x-1 group-hover:text-[color:var(--accent)]" />
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* live run status — ephemeral: appears only while agents are running, clears when done */}
          <AnimatePresence>{anyRunning && <LiveRuns key="live" />}</AnimatePresence>
        </PageLayout>
      </div>
    </div>
  )
}

function LiveRuns() {
  const { agents, getThread, state } = useMission()

  const threadRunning = agents.filter((a) => getThread(a.id).running)
  const items = threadRunning.map((a) => ({
    id: a.id, name: a.name, icon: a.icon,
    status: a.id === ORCH_ID ? 'Coordinating' : 'Running',
  }))
  const seen = new Set(items.map((it) => it.name))
  for (const t of lastRunSlice(state.timeline)) {
    if (t.kind !== 'sub') continue
    if (t.badge === 'done' || t.badge === 'error') continue
    const name = t.title || t.key
    if (!name || seen.has(name)) continue
    seen.add(name)
    items.push({ id: 'sub_' + (t.key || name), name, icon: t.icon, status: t.badge === 'queued' ? 'Queued' : 'Running' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mt-6 overflow-hidden"
    >
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-strong">
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
            Active runs
          </h3>
          <Badge variant="accent">{items.length || 1} live</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {items.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2.5">
              <StatusDot status="running" pulse />
              <span className="text-sm font-medium text-muted">Working…</span>
            </div>
          ) : (
            items.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2.5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white [background-image:var(--grad-brand)]">
                  {cleanIcon(it.icon, initials(it.name))}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-strong">{it.name}</div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--accent-strong)]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--accent)] opacity-70" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                    </span>
                    {it.status}
                  </div>
                </div>
                <span className={cn('text-[10px] font-semibold uppercase tracking-wide', it.status === 'Queued' ? 'text-[color:var(--warning)]' : 'text-[color:var(--accent-strong)]')}>
                  {it.status === 'Queued' ? 'queued' : 'live'}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </Card>
    </motion.div>
  )
}
