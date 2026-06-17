import { motion } from 'framer-motion'
import { Network, Wifi, ShieldCheck } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { useMission } from '../store/mission.jsx'
import { brokerHost } from '../broker.js'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function GatewaysPage() {
  const { data: gateways, source, loading } = useApi(() => Api.gateways(), [])
  const { state, settings } = useMission()
  const connLive = state.conn === 'live' || state.conn === 'demo'

  // The broker connection is real even without a /gateways endpoint — show it.
  const synthetic = settings.base
    ? [{ id: 'broker', name: brokerHost(settings.base), url: settings.base, connected: connLive, scopes: ['operator.read', 'operator.write'] }]
    : []
  const list = gateways && gateways.length ? gateways : synthetic

  return (
    <PageLayout
      kicker="Administration"
      title="Gateways"
      description="The gateways your broker connects to Cognio through. Status reflects the live broker connection."
      actions={<SourceBadge source={source} />}
      wide
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 1 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((g, i) => {
            const connected = g.connected ?? connLive
            return (
              <motion.div key={g.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                      <Network className="h-5 w-5" />
                    </div>
                    <Badge variant={connected ? 'success' : 'danger'}>{connected ? 'connected' : 'down'}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-strong">{g.name}</h3>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">{g.url}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(g.scopes || []).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        <ShieldCheck className="h-3 w-3" /> {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <Wifi className="h-3.5 w-3.5" /> Live broker status: <span className="font-semibold capitalize">{state.conn}</span>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </PageLayout>
  )
}
