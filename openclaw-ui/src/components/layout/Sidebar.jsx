import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart3, Activity, Bot, Radar, LayoutGrid, Store, Boxes,
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
    title: 'Skills',
    items: [
      { to: '/skills/marketplace', label: 'Marketplace', icon: Store },
      { to: '/skills/packs', label: 'Packs', icon: Boxes },
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
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[color:var(--text-muted)] transition',
          isActive ? 'font-medium text-[color:var(--accent-strong)]' : 'hover:bg-[color:var(--surface-tint)] hover:text-[color:var(--accent-strong)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-0 rounded-lg border border-[#c8e7dd] bg-[#eef8f4]"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <Icon className="relative z-10 h-4 w-4" />
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
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-[color:var(--border)] bg-[#fffaf0]/90 backdrop-blur md:flex">
      <div className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Navigation</p>
        <nav className="mt-3 space-y-5 text-sm">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-quiet)]">{section.title}</p>
              <div className="mt-1 space-y-1">
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-[color:var(--border)] p-4">
        <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              operational ? 'bg-[color:var(--success)]' : conn === 'connecting' ? 'bg-[color:var(--warning)] animate-pulse' : 'bg-[color:var(--danger)]',
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  )
}
