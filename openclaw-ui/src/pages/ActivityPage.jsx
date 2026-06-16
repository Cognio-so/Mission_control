import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { cn } from '../lib/utils.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function ActivityPage() {
  const { state } = useMission()
  const feed = [...state.timeline].reverse()

  return (
    <PageLayout kicker="Overview" title="Live feed" description="Every plan step, tool call, delegation, and run boundary as it streams from the broker." wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          {feed.length === 0 ? (
            <EmptyPanel icon={Activity} title="No activity yet" hint="Start a run from Mission Control and events will stream here in real time." />
          ) : (
            <div className="space-y-2">
              {feed.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    t.cls === 'error' ? 'bg-rose-500' : t.kind === 'divider' ? 'bg-slate-300' : t.kind === 'sub' ? 'bg-violet-500' : 'bg-[color:var(--accent)]')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-strong">{t.head || t.text || t.title || 'event'}</div>
                    {t.sub && <div className="truncate text-xs text-muted">{t.sub}</div>}
                  </div>
                  {t.badge && <Badge variant="outline">{t.badge}</Badge>}
                  {t.tag && <Badge variant="accent">{t.tag}</Badge>}
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex h-[70vh] flex-col p-0">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-strong">Raw broker log</div>
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
