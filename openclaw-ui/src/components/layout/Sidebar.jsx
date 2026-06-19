import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3, Activity, Bot, Radar, LayoutGrid, Store, Plug,
  Network, Settings, Building2, Clock, MessagesSquare,
} from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'

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
          {SECTIONS.map((section) => (
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
