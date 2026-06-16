import { RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { BrandMark } from '../atoms/BrandMark.jsx'
import { brokerHost } from '../../broker.js'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'

function connDisplay(c) {
  if (c === 'demo') return { cls: 'demo', txt: 'Demo', dot: 'bg-violet-500', Icon: Wifi }
  if (c === 'live') return { cls: 'on', txt: 'Live', dot: 'bg-emerald-500', Icon: Wifi }
  if (c === 'connecting') return { cls: 'connecting', txt: 'Connecting', dot: 'bg-amber-500', Icon: Loader2 }
  return { cls: 'off', txt: 'Offline', dot: 'bg-rose-500', Icon: WifiOff }
}

export function Topbar() {
  const { settings, state, reconnect, loadBrokerAgents, agentsLoading } = useMission()
  const ci = connDisplay(state.conn)
  const Icon = ci.Icon

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <div className="md:w-[236px]">
          <BrandMark />
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <button
            onClick={reconnect}
            title="Reconnect broker"
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              ci.cls === 'on' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              ci.cls === 'demo' && 'border-violet-200 bg-violet-50 text-violet-700',
              ci.cls === 'connecting' && 'border-amber-200 bg-amber-50 text-amber-700',
              ci.cls === 'off' && 'border-rose-200 bg-rose-50 text-rose-700',
            )}
          >
            <span className="relative flex h-2 w-2">
              {ci.cls === 'on' && (
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
                  animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', ci.dot)} />
            </span>
            {ci.txt}
          </button>

          <span className="hidden items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
            {settings.demo ? 'demo workspace' : settings.base ? brokerHost(settings.base) : 'no broker'}
          </span>

          <button
            onClick={() => loadBrokerAgents()}
            disabled={agentsLoading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', agentsLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  )
}
