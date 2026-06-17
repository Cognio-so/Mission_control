import { Server, KeyRound, Hash, FlaskConical } from 'lucide-react'
import { useMission } from '../store/mission.jsx'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function SettingsPage() {
  const { settings, state } = useMission()
  const rows = [
    { icon: Server, label: 'Broker URL', value: settings.base || '—', mono: true },
    { icon: Hash, label: 'Orchestrator session', value: settings.session, mono: true },
    { icon: KeyRound, label: 'Broker secret', value: settings.secret ? '••••••••' + settings.secret.slice(-4) : 'not set', mono: true },
    { icon: FlaskConical, label: 'Demo mode', value: settings.demo ? 'on' : 'off' },
  ]

  return (
    <PageLayout kicker="Administration" title="Settings" description="Connection configuration for this Mission Control instance. These are read from your .env.local at build time.">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-strong">Broker connection</h3>
          <Badge variant={state.conn === 'live' ? 'success' : state.conn === 'connecting' ? 'warning' : 'outline'}>{state.conn}</Badge>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-4 px-5 py-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500"><r.icon className="h-4 w-4" /></div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{r.label}</div>
                <div className={r.mono ? 'font-mono text-sm text-strong' : 'text-sm text-strong'}>{r.value}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        To change these, edit your <span className="font-mono">.env.local</span> and restart the dev server. The values are baked in at build time via Vite&apos;s <span className="font-mono">VITE_*</span> variables.
      </div>
    </PageLayout>
  )
}
