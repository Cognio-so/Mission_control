import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3, Activity, Bot, Radar, LayoutGrid, Store, Plug,
  Network, Settings, Building2, Clock, MessagesSquare, Lock, ChevronDown,
} from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'
import { useAdminUnlocked, unlockAdmin, lockAdmin } from '../../lib/adminLock.js'

const SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
      { to: '/activity', label: 'Live feed', icon: Activity },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/mission', label: 'Mission Control', icon: Radar },
      { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
      { to: '/agents', label: 'Agents', icon: Bot },
      { to: '/scheduled', label: 'Scheduled', icon: Clock },
    ],
  },
  {
    title: 'Boards',
    items: [{ to: '/boards', label: 'Boards', icon: LayoutGrid }],
  },
  {
    title: 'Marketplace',
    items: [
      { to: '/skills/marketplace', label: 'Skills', icon: Store },
      { to: '/skills/plugins', label: 'Plugins', icon: Plug },
    ],
  },
  {
    title: 'Administration',
    admin: true,
    items: [
      { to: '/gateways', label: 'Gateways', icon: Network },
      { to: '/organization', label: 'Organization', icon: Building2 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
          isActive
            ? 'font-semibold text-[color:var(--accent-strong)]'
            : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-0 rounded-xl border border-[color:var(--border-accent)] bg-[color:var(--accent-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--accent)]" />
            </motion.span>
          )}
          <Icon className={cn('relative z-10 h-4 w-4 transition-transform group-hover:scale-110', isActive && 'text-[color:var(--accent)]')} />
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// Administration: collapsible AND passcode-gated. Locked by default; entering the admin
// passcode reveals the items and unlocks the admin routes (Gateways / Organization / Settings).
function AdminNavSection({ section }) {
  const unlocked = useAdminUnlocked()
  const [open, setOpen] = useState(unlocked)
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  // Expand automatically when admin is unlocked (e.g. from a route's passcode prompt).
  useEffect(() => { if (unlocked) setOpen(true) }, [unlocked])

  const submit = (e) => {
    e.preventDefault()
    if (unlockAdmin(pass)) { setPass(''); setError(''); setOpen(true) }
    else setError('Incorrect passcode')
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-quiet)] transition hover:text-[color:var(--text-muted)]"
      >
        <Lock className="h-3 w-3 shrink-0" />
        <span>{section.title}</span>
        {!unlocked && <span className="rounded bg-[color:var(--surface-muted)] px-1 py-px text-[8px] normal-case tracking-normal text-[color:var(--text-quiet)]">locked</span>}
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (unlocked ? (
        <div className="mt-1.5 space-y-1">
          {section.items.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <button
            type="button"
            onClick={() => { lockAdmin(); setOpen(false) }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-[color:var(--text-quiet)] transition hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]"
          >
            <Lock className="h-3.5 w-3.5" /> Lock admin
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 px-2">
          <input
            type="password"
            autoFocus
            value={pass}
            onChange={(e) => { setPass(e.target.value); setError('') }}
            placeholder="Admin passcode"
            className="h-9 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2.5 text-xs text-strong outline-none transition focus:border-[color:var(--accent)]"
          />
          {error && <div className="mt-1 px-1 text-[10px] font-medium text-[color:var(--danger)]">{error}</div>}
          <button type="submit" className="mt-1.5 w-full rounded-lg [background-image:var(--grad-brand)] px-2 py-1.5 text-xs font-semibold text-white transition hover:brightness-[1.05]">
            Unlock
          </button>
        </form>
      ))}
    </div>
  )
}

export function Sidebar() {
  const { conn } = useMission().state
  const operational = conn === 'live' || conn === 'demo'
  const statusLabel =
    conn === 'live' ? 'All systems operational' : conn === 'demo' ? 'Demo workspace' : conn === 'connecting' ? 'Connecting to broker...' : 'Broker offline'

  return (
    <aside className="hidden w-[212px] shrink-0 flex-col border-r border-[color:var(--border)] surface-glass md:flex">
      <div className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-quiet)]">Navigation</p>
        <nav className="mt-3 space-y-6 text-sm">
          {SECTIONS.map((section) => section.admin ? (
            <AdminNavSection key={section.title} section={section} />
          ) : (
            <div key={section.title}>
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-quiet)]">{section.title}</p>
              <div className="mt-1.5 space-y-1">
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-[color:var(--border)] p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2.5 text-xs font-medium text-[color:var(--text-muted)]">
          <span className="relative flex h-2.5 w-2.5">
            {operational && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--success)] opacity-60" />
            )}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                operational ? 'bg-[color:var(--success)]' : conn === 'connecting' ? 'animate-pulse bg-[color:var(--warning)]' : 'bg-[color:var(--danger)]',
              )}
            />
          </span>
          {statusLabel}
        </div>
      </div>
    </aside>
  )
}
