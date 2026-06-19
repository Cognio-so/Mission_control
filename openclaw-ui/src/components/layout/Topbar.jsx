import { LogOut, RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { BrandMark } from '../atoms/BrandMark.jsx'
import { ThemeToggle } from '../atoms/ThemeToggle.jsx'
import { brokerHost } from '../../broker.js'
import { signOut } from '../../lib/auth.js'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'

function connDisplay(c) {
  if (c === 'demo') return { cls: 'demo', txt: 'Demo', Icon: Wifi }
  if (c === 'live') return { cls: 'on', txt: 'Live', Icon: Wifi }
  if (c === 'connecting') return { cls: 'connecting', txt: 'Connecting', Icon: Loader2 }
  return { cls: 'off', txt: 'Offline', Icon: WifiOff }
}

const PILL = {
  on: 'border-[color:var(--border-accent)] bg-[color:var(--success-soft)] text-[color:var(--success)]',
  demo: 'border-transparent bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
  connecting: 'border-transparent bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
  off: 'border-transparent bg-[color:var(--danger-soft)] text-[color:var(--danger)]',
}
const DOT = {
  on: 'bg-[color:var(--success)]',
  demo: 'bg-[color:var(--warning)]',
  connecting: 'bg-[color:var(--warning)]',
  off: 'bg-[color:var(--danger)]',
}

export function Topbar() {
  const { settings, state, reconnect, loadBrokerAgents, agentsLoading, anyRunning, stopAll } = useMission()
  const ci = connDisplay(state.conn)

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)] surface-glass shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <div className="md:w-[236px]">
          <BrandMark />
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <button
            onClick={reconnect}
            title="Reconnect broker"
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-px',
              PILL[ci.cls],
            )}
          >
            <span className="relative flex h-2 w-2">
              {ci.cls === 'on' && (
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-[color:var(--accent)]"
                  animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT[ci.cls], ci.cls === 'connecting' && 'animate-pulse')} />
            </span>
            {ci.txt}
          </button>

          <span className="hidden items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1.5 font-mono text-xs font-medium text-[color:var(--text-muted)] sm:inline-flex">
            {settings.demo ? 'demo workspace' : settings.base ? brokerHost(settings.base) : 'no broker'}
          </span>

          {anyRunning && (
            <button
              onClick={stopAll}
              title="Stop all running agents and their subagents"
              className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[color:var(--danger-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--danger)] transition hover:-translate-y-px hover:brightness-95"
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
              <span className="hidden sm:inline">Stop all</span>
            </button>
          )}

          <ThemeToggle />

          <button
            onClick={() => loadBrokerAgents()}
            disabled={agentsLoading}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', agentsLoading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)] transition hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-soft)] hover:text-[color:var(--danger)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
