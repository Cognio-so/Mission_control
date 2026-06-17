import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bot, Radar, Store, LayoutGrid, Activity, ArrowRight, Zap } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { Api, useApi } from '../lib/api.js'
import { brokerHost } from '../broker.js'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function DashboardPage() {
  const { agents, managed, state, anyRunning, settings } = useMission()
  const teamAgents = agents.filter((agent) => agent.kind !== 'main')
  const { data: boards } = useApi(() => Api.boards(), [])
  const { data: skills } = useApi(() => Api.skills(), [])

  const stats = [
    { label: 'Agents', value: teamAgents.length, icon: Bot, to: '/agents', tint: 'from-[#45a895] to-[#0f4b49]' },
    { label: 'Specialists', value: managed.length, icon: Radar, to: '/mission', tint: 'from-[#6aa99b] to-[#154f4c]' },
    { label: 'Boards', value: (boards || []).length, icon: LayoutGrid, to: '/boards', tint: 'from-[#8fbfb1] to-[#12524c]' },
    { label: 'Skills', value: (skills || []).length, icon: Store, to: '/skills/marketplace', tint: 'from-[#c99a55] to-[#8f6234]' },
  ]
  const recent = state.timeline.slice(-6).reverse()
  const connLive = state.conn === 'live' || state.conn === 'demo'

  return (
    <PageLayout kicker="Overview" title="Mission Control" description="Your command center for Cognio agents - coordinate runs, manage skills, and track work across boards." wide>
      {/* hero banner */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="mb-6 overflow-hidden rounded-lg border border-[#b8d6cc] bg-[linear-gradient(135deg,#154f4c_0%,#0f4b49_58%,#45a895_145%)] p-7 text-[#fffaf0] shadow-[0_24px_70px_rgba(15,75,73,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <span className={`h-2 w-2 rounded-full ${connLive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              {connLive ? 'Broker connected' : 'Broker offline'}
            </div>
            <h2 className="font-display text-2xl font-semibold md:text-3xl">{anyRunning ? 'A run is in progress' : 'Ready for the next run'}</h2>
            <p className="mt-1 text-sm text-[#c7e8df]">Connected to <span className="font-mono">{settings.demo ? 'demo workspace' : brokerHost(settings.base)}</span></p>
          </div>
          <Link to="/mission" className="inline-flex items-center gap-2 rounded-full bg-[#fffaf0] px-5 py-3 text-sm font-semibold text-[#0f4b49] shadow-sm transition hover:bg-[#eef8f4]">
            <Zap className="h-4 w-4" /> Open Mission Control
          </Link>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
            <Link to={s.to}>
              <Card className="group flex items-center gap-4 p-5">
                <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${s.tint} text-white shadow-sm`}>
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="text-2xl font-semibold text-strong">{s.value}</div>
                  <div className="text-xs text-muted">{s.label}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[color:var(--accent)]" />
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-strong"><Activity className="h-4 w-4" /> Recent activity</h3>
            <Link to="/activity" className="text-xs font-semibold text-[color:var(--accent)]">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No activity yet. Start a run from Mission Control.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${t.cls === 'error' ? 'bg-rose-500' : t.kind === 'divider' ? 'bg-slate-300' : 'bg-[color:var(--accent)]'}`} />
                  <span className="flex-1 truncate text-slate-700">{t.head || t.text || t.title || 'event'}</span>
                  {t.badge && <Badge variant="outline">{t.badge}</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-strong">Quick actions</h3>
          <div className="space-y-2">
            {[
              { to: '/mission', label: 'Coordinate a run', icon: Radar },
              { to: '/agents', label: 'Manage agents', icon: Bot },
              { to: '/skills/marketplace', label: 'Browse marketplace', icon: Store },
              { to: '/boards', label: 'Open boards', icon: LayoutGrid },
            ].map((a) => (
              <Link key={a.to} to={a.to}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]">
                <a.icon className="h-4 w-4" />
                <span className="flex-1">{a.label}</span>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[color:var(--accent)]" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}
