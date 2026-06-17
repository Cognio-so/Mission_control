import { LogOut, RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { BrandMark } from '../atoms/BrandMark.jsx'
import { brokerHost } from '../../broker.js'
import { signOut } from '../../lib/auth.js'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'

function connDisplay(c) {
  if (c === 'demo') return { cls: 'demo', txt: 'Demo', dot: 'bg-[color:var(--warning)]', Icon: Wifi }
  if (c === 'live') return { cls: 'on', txt: 'Live', dot: 'bg-[color:var(--success)]', Icon: Wifi }
  if (c === 'connecting') return { cls: 'connecting', txt: 'Connecting', dot: 'bg-[color:var(--warning)]', Icon: Loader2 }
  return { cls: 'off', txt: 'Offline', dot: 'bg-[color:var(--danger)]', Icon: WifiOff }
}

export function Topbar() {
  const { settings, state, reconnect, loadBrokerAgents, agentsLoading } = useMission()
  const ci = connDisplay(state.conn)
  const Icon = ci.Icon

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)] bg-[#fffaf0]/92 shadow-[0_1px_0_rgba(15,75,73,0.04)] backdrop-blur">
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
              ci.cls === 'on' && 'border-[#b7ded4] bg-[#eef8f4] text-[#12524c]',
              ci.cls === 'demo' && 'border-[#ead9ad] bg-[#fff6df] text-[#8a5c16]',
              ci.cls === 'connecting' && 'border-amber-200 bg-amber-50 text-amber-700',
              ci.cls === 'off' && 'border-rose-200 bg-rose-50 text-rose-700',
            )}
          >
            <span className="relative flex h-2 w-2">
              {ci.cls === 'on' && (
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--accent)]"
                  animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', ci.dot)} />
            </span>
            {ci.txt}
          </button>

          <span className="hidden items-center rounded-full border border-[color:var(--border)] bg-[#f5efe2] px-3 py-1.5 text-xs font-medium text-[color:var(--text-muted)] sm:inline-flex">
            {settings.demo ? 'demo workspace' : settings.base ? brokerHost(settings.base) : 'no broker'}
          </span>

          <button
            onClick={() => loadBrokerAgents()}
            disabled={agentsLoading}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', agentsLoading && 'animate-spin')} />
            Refresh
          </button>

          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
