import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Play, CalendarClock, Bot } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { cn } from '../lib/utils.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'

export default function ScheduledPage() {
  const { data: jobs, source, loading, reload } = useApi(() => Api.cron(), [])
  const [running, setRunning] = useState(null)

  const runNow = async (id) => {
    setRunning(id)
    try { await Api.runCron(id) } catch { /* surfaced by reload/no-op */ }
    setRunning(null)
    reload()
  }

  return (
    <PageLayout
      kicker="Operations"
      title="Scheduled jobs"
      description="Cron jobs Cognio runs on a schedule — recurring agent runs, audits, and digests."
      actions={<SourceBadge source={source} />}
      wide
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : (jobs || []).length === 0 ? (
        <EmptyPanel
          icon={Clock}
          title="No scheduled jobs"
          hint="Add the GET /cron endpoint to your broker (it maps to the gateway cron.list RPC) and your scheduled agent runs will appear here."
        />
      ) : (
        <div className="space-y-3">
          {(jobs || []).map((j, i) => (
            <motion.div key={j.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 text-white">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-strong">{j.name || j.id}</span>
                    <Badge variant={j.status === 'active' ? 'success' : 'outline'}>{j.status || 'active'}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 font-mono"><CalendarClock className="h-3.5 w-3.5" /> {j.schedule}</span>
                    {j.agent && <span className="inline-flex items-center gap-1"><Bot className="h-3.5 w-3.5" /> {j.agent}</span>}
                    {j.nextRun && <span>next: {j.nextRun}</span>}
                    {j.lastRun && <span className="text-slate-400">last: {j.lastRun}</span>}
                  </div>
                </div>
                <Button size="sm" variant="secondary" disabled={running === j.id} onClick={() => runNow(j.id)}>
                  <Play className={cn('h-4 w-4', running === j.id && 'animate-pulse')} /> {running === j.id ? 'Running…' : 'Run now'}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
