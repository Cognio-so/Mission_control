import { CalendarClock, UserCircle, Play, Loader2, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils.js'

const priorityBadge = (value) => {
  const n = (value || '').toLowerCase()
  if (n === 'high') return 'bg-rose-100 text-rose-700'
  if (n === 'medium') return 'bg-amber-100 text-amber-700'
  if (n === 'low') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
}

export function TaskCard({ task, draggable, isDragging, onDragStart, onDragEnd, onClick, onRun, running, onDelete }) {
  const { title, status, priority, assignee, due, isOverdue, approvalsPendingCount = 0, tags = [], isBlocked, blockedByCount = 0 } = task
  const hasPendingApproval = approvalsPendingCount > 0
  const needsLeadReview = status === 'review' && !isBlocked && !hasPendingApproval
  const leftBar = isBlocked ? 'bg-rose-400' : hasPendingApproval ? 'bg-amber-400' : needsLeadReview ? 'bg-indigo-400' : null
  const visibleTags = tags.slice(0, 3)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={cn(
        'group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        isDragging && 'opacity-60 shadow-none',
        hasPendingApproval && 'border-amber-200 bg-amber-50/40',
        isBlocked && 'border-rose-200 bg-rose-50/50',
        needsLeadReview && 'border-indigo-200 bg-indigo-50/30',
      )}
    >
      {leftBar && <span className={cn('absolute left-0 top-0 h-full w-1 rounded-l-lg', leftBar)} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="break-words text-sm font-medium text-slate-900 line-clamp-2">{title}</p>
          {isBlocked && (
            <Flag color="rose">Blocked{blockedByCount > 0 ? ` · ${blockedByCount}` : ''}</Flag>
          )}
          {hasPendingApproval && <Flag color="amber">Approval needed · {approvalsPendingCount}</Flag>}
          {needsLeadReview && <Flag color="indigo">Waiting for lead review</Flag>}
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleTags.map((tag) => (
                <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `#${tag.color}` }} />
                  {tag.name}
                </span>
              ))}
              {tags.length > visibleTags.length && <span className="text-[10px] font-semibold text-slate-500">+{tags.length - visibleTags.length}</span>}
            </div>
          )}
        </div>
        <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide', priorityBadge(priority))}>
          {(priority || 'medium').toUpperCase()}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-slate-400" />
          <span>{assignee ?? 'Unassigned'}</span>
        </div>
        <div className="flex items-center gap-2">
          {due && (
            <div className={cn('flex items-center gap-2', isOverdue && 'font-semibold text-rose-600')}>
              <CalendarClock className={cn('h-4 w-4', isOverdue ? 'text-rose-500' : 'text-slate-400')} />
              <span>{due}</span>
            </div>
          )}
          {onRun && status !== 'done' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun() }}
              disabled={running}
              title={running ? 'Running…' : 'Run with assigned agent'}
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--accent)] bg-[color:var(--accent-soft)] px-2 py-1 text-[10px] font-semibold text-[color:var(--accent-strong)] transition hover:bg-[color:var(--accent)] hover:text-white disabled:opacity-60"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {running ? 'Running' : 'Run'}
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title="Delete task"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Flag({ color, children }) {
  const map = { rose: 'text-rose-700 bg-rose-500', amber: 'text-amber-700 bg-amber-500', indigo: 'text-indigo-700 bg-indigo-500' }
  const [text, dot] = map[color].split(' ')
  return (
    <div className={cn('flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide', text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {children}
    </div>
  )
}
