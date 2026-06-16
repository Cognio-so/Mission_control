import { motion } from 'framer-motion'
import { FEED_EVENTS } from '../../lib/demoData.js'
import { initials, cn } from '../../lib/utils.js'

// Right-panel "Live feed" — realtime task / approval / agent / chat activity.
export function LiveFeed({ items }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live feed</p>
        <p className="mt-1 text-sm font-medium text-slate-900">Realtime task, approval, agent, and board-chat activity.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 scrollbar-thin">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Activity will stream here as agents work.</p>
        ) : (
          items.map((item, i) => {
            const ev = FEED_EVENTS[item.event_type] || FEED_EVENTS.default
            return (
              <motion.div
                key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.25) }}
                className={cn('rounded-xl border p-3 transition-colors', item.fresh ? 'border-blue-200 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300')}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                    {initials(item.author || 'AI')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900" title={item.title}>{item.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', ev.cls)}>{ev.label}</span>
                      {item.author && <span className="font-medium text-slate-700">{item.author}</span>}
                      {item.role && <><span className="text-slate-300">·</span><span className="text-slate-500">{item.role}</span></>}
                      {item.created_at && <><span className="text-slate-300">·</span><span className="text-slate-400">{item.created_at}</span></>}
                    </div>
                  </div>
                </div>
                {item.message && <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{item.message}</div>}
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
