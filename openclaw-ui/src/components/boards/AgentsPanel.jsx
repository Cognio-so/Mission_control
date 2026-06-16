import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { initials } from '../../lib/utils.js'
import { StatusDot } from '../atoms/StatusDot.jsx'

// Left panel: shows the agents working this board with live status.
export function AgentsPanel({ agents, onAdd }) {
  return (
    <div className="flex w-full shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm md:w-60">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agents</span>
          <span className="text-xs text-slate-400">{agents.length} total</span>
        </div>
        <button
          onClick={onAdd}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add</span>
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {agents.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
          >
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
              {initials(a.name)}
              <StatusDot
                status={a.status}
                pulse={a.status === 'busy' || a.status === 'running'}
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{a.name}</div>
              <div className="text-[11px] text-slate-500">{a.role}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
