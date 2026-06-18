import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquare, Radio, Plus, X } from 'lucide-react'
import { Api } from '../lib/api.js'
import { BOARD_COLUMNS } from '../lib/demoData.js'
import { cn } from '../lib/utils.js'
import { ORCH_ID } from '../agents.js'
import { dedupeMessages } from '../store/reducer.js'
import { useMission } from '../store/mission.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { TaskCard } from '../components/boards/TaskCard.jsx'
import { AgentsPanel } from '../components/boards/AgentsPanel.jsx'
import { BoardChat } from '../components/boards/BoardChat.jsx'
import { LiveFeed } from '../components/boards/LiveFeed.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'

const REVIEW_BUCKETS = [
  { key: 'all', label: 'All' },
  { key: 'approval_needed', label: 'Approval needed' },
  { key: 'waiting_lead', label: 'Lead review' },
  { key: 'blocked', label: 'Blocked' },
]

export default function BoardDetailPage() {
  const { boardId } = useParams()
  const nav = useNavigate()
  const mission = useMission()

  const [board, setBoard] = useState(null)
  const [tasks, setTasks] = useState([])
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [reviewBucket, setReviewBucket] = useState('all')
  const [tab, setTab] = useState('chat')
  const [addCol, setAddCol] = useState(null)
  const [addTitle, setAddTitle] = useState('')
  const [addAgent, setAddAgent] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [boardErr, setBoardErr] = useState('')
  const [autoRuns, setAutoRuns] = useState({}) // { [agentId]: { taskId, started } }

  const loadBoard = () =>
    Api.board(boardId).then(({ data, source }) => { setBoard(data.board); setTasks(data.tasks); setSource(source) })

  useEffect(() => {
    let alive = true
    setLoading(true)
    Api.board(boardId)
      .then(({ data, source }) => { if (!alive) return; setBoard(data.board); setTasks(data.tasks); setSource(source) })
      .catch(() => { if (alive) { setBoard(null); setTasks([]); setSource(null) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [boardId])

  // AGENTS panel — the real broker agents + their run status (no demo padding).
  const boardAgents = useMemo(
    () =>
      mission.agents.map((a) => {
        const t = mission.getThread(a.id)
        return { id: a.id, name: a.name, role: a.id === ORCH_ID ? 'Board lead' : a.role || 'Generalist', status: a.status || (t.running ? 'busy' : 'online') }
      }),
    [mission.agents, mission.state.threads],
  )

  // Board chat IS the conversation with the lead agent (the Orchestrator) — real, no seed.
  const lead = mission.orchestrator
  const chatMessages = dedupeMessages(mission.getThread(ORCH_ID).messages).map((m) => ({
    id: m.id,
    source: m.role === 'user' ? 'You' : lead?.name || 'Lead Agent',
    role: m.role === 'user' ? '' : 'Board lead',
    content: m.text,
    streaming: m.streaming,
  }))
  const sendChat = (text, effort, files) => mission.sendText(text, ORCH_ID, effort, files)

  // Live feed — real run timeline only (no demo seed).
  const feedItems = useMemo(() => {
    const leadName = lead?.name || 'Lead Agent'
    return [...mission.state.timeline]
      .reverse()
      .filter((t) => t.kind !== 'divider')
      .slice(0, 20)
      .map((t) => ({
        id: 'tl_' + t.id,
        fresh: true,
        event_type: t.cls === 'error' ? 'run.error' : t.kind === 'sub' ? 'task.status_changed' : 'task.comment',
        author: t.kind === 'sub' ? t.title : leadName,
        role: t.kind === 'sub' ? 'Generalist' : 'Board lead',
        title: t.head || t.title || t.text || 'Agent activity',
        message: t.sub || t.stream || null,
        created_at: 'live',
      }))
  }, [mission.state.timeline, lead])

  const moveTask = (taskId, status) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    Api.moveTask(boardId, taskId, status).catch(() => {})
  }
  const onDrop = (colKey) => { setOverCol(null); if (dragId) moveTask(dragId, colKey); setDragId(null) }

  const deleteTask = (task) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    Api.deleteTask(boardId, task.id).catch(() => loadBoard())
  }

  // Auto-run: send the task to its assigned agent, move it to In Progress, and
  // (via the effect below) auto-move to Review when that agent's run completes.
  const runTask = (task) => {
    const agentId = task.assigned_agent_id || ORCH_ID
    const prompt = `You are assigned this board task: "${task.title}". Work on it now. When finished, give a concise summary of the result.`
    mission.sendText(prompt, agentId)
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'in_progress' } : t)))
    Api.moveTask(boardId, task.id, 'in_progress').catch(() => {})
    setAutoRuns((prev) => ({ ...prev, [agentId]: { taskId: task.id, started: false } }))
  }

  // Watch agent run state: mark started when running begins, move to Review when it ends.
  useEffect(() => {
    const completed = []
    let needMarkStarted = false
    for (const [agentId, entry] of Object.entries(autoRuns)) {
      const running = mission.getThread(agentId).running
      if (running && !entry.started) needMarkStarted = true
      else if (entry.started && !running) completed.push({ agentId, taskId: entry.taskId })
    }
    if (needMarkStarted) {
      setAutoRuns((prev) => {
        const next = { ...prev }
        for (const [agentId, entry] of Object.entries(next)) {
          if (mission.getThread(agentId).running && !entry.started) next[agentId] = { ...entry, started: true }
        }
        return next
      })
    }
    if (completed.length) {
      setAutoRuns((prev) => {
        const next = { ...prev }
        completed.forEach(({ agentId }) => delete next[agentId])
        return next
      })
      setTasks((prev) => prev.map((t) => (completed.some((c) => c.taskId === t.id) ? { ...t, status: 'review' } : t)))
      completed.forEach(({ taskId }) => Api.moveTask(boardId, taskId, 'review').catch(() => {}))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.state.threads, autoRuns])

  const runningTaskIds = new Set(Object.values(autoRuns).map((e) => e.taskId))

  const addTask = async (colKey) => {
    const title = addTitle.trim()
    if (!title) return
    setAddBusy(true); setBoardErr('')
    try {
      const agent = addAgent ? mission.agentsById[addAgent] : null
      const created = await Api.createTask(boardId, {
        title, status: colKey, priority: 'medium',
        assignee: agent?.name || null, assigned_agent_id: agent?.id || null,
      })
      setAddTitle(''); setAddCol(null)
      await loadBoard()
      const newTask = created?.task || created
      if (agent && newTask?.id) runTask({ ...newTask, title, assigned_agent_id: agent.id })
      setAddAgent('')
    } catch (e) {
      setBoardErr(e.message || 'Could not add task')
    } finally {
      setAddBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6">
        <div className="mb-5 h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-4">
          {BOARD_COLUMNS.map((c) => <div key={c.key} className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/boards" className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--accent-strong)] hover:underline">
            <ArrowLeft className="h-3 w-3" /> Boards
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-strong md:text-3xl">{board?.name || 'Board'}</h1>
          {board?.description && <p className="mt-1 text-sm text-muted">{board.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge source={source} />
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
            <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare className="h-3.5 w-3.5" /> Board chat</TabBtn>
            <TabBtn active={tab === 'feed'} onClick={() => setTab('feed')}><Radio className="h-3.5 w-3.5" /> Live feed</TabBtn>
          </div>
        </div>
      </div>

      {boardErr && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{boardErr}</div>}

      <div className="flex flex-col gap-4 xl:flex-row">
        <AgentsPanel agents={boardAgents} onAdd={() => nav('/agents')} />

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((col) => {
              let colTasks = tasks.filter((t) => (t.status || 'inbox') === col.key)
              const reviewCounts = col.key === 'review'
                ? colTasks.reduce((acc, t) => {
                    if (t.isBlocked) acc.blocked++
                    else if ((t.approvalsPendingCount ?? 0) > 0) acc.approval_needed++
                    else acc.waiting_lead++
                    return acc
                  }, { all: colTasks.length, approval_needed: 0, waiting_lead: 0, blocked: 0 })
                : null
              if (col.key === 'review' && reviewBucket !== 'all') {
                colTasks = colTasks.filter((t) => {
                  if (reviewBucket === 'blocked') return !!t.isBlocked
                  if (reviewBucket === 'approval_needed') return (t.approvalsPendingCount ?? 0) > 0 && !t.isBlocked
                  if (reviewBucket === 'waiting_lead') return !t.isBlocked && (t.approvalsPendingCount ?? 0) === 0
                  return true
                })
              }
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.key) }}
                  onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                  onDrop={() => onDrop(col.key)}
                  className={cn('rounded-xl transition', overCol === col.key && 'ring-2 ring-slate-300')}
                >
                  <div className="rounded-t-xl border border-b-0 border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                        <h3 className="text-sm font-semibold text-slate-900">{col.label}</h3>
                      </div>
                      <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-semibold', col.badge)}>{colTasks.length}</span>
                    </div>
                    {reviewCounts && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                        {REVIEW_BUCKETS.map((b) => (
                          <button
                            key={b.key} onClick={() => setReviewBucket(b.key)}
                            className={cn('rounded-full border px-2 py-0.5 transition',
                              reviewBucket === b.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
                          >{b.label} · {reviewCounts[b.key]}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-3">
                    <div className="space-y-3">
                      {colTasks.map((t) => (
                        <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                          <TaskCard
                            task={t} draggable={!t.isBlocked} isDragging={dragId === t.id}
                            onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }}
                            onRun={() => runTask(t)} running={runningTaskIds.has(t.id)}
                            onDelete={() => deleteTask(t)}
                          />
                        </motion.div>
                      ))}
                      {colTasks.length === 0 && addCol !== col.key && (
                        <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">No tasks</div>
                      )}

                      {addCol === col.key ? (
                        <div className="space-y-2 rounded-lg border border-[color:var(--accent)] bg-[color:var(--accent-soft)]/40 p-2">
                          <Input
                            autoFocus value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addTask(col.key); if (e.key === 'Escape') { setAddCol(null); setAddTitle('') } }}
                            placeholder="Task title…" className="h-9"
                          />
                          <select
                            value={addAgent} onChange={(e) => setAddAgent(e.target.value)}
                            className="h-9 w-full rounded-xl border border-[color:var(--border)] bg-white px-2 text-xs text-strong focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                          >
                            <option value="">Unassigned (no auto-run)</option>
                            {mission.agents.map((a) => <option key={a.id} value={a.id}>Assign → {a.name}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <Button size="xs" onClick={() => addTask(col.key)} disabled={addBusy || !addTitle.trim()}>{addBusy ? 'Adding…' : addAgent ? 'Add & run' : 'Add'}</Button>
                            <Button size="xs" variant="ghost" onClick={() => { setAddCol(null); setAddTitle('') }}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddCol(col.key); setAddTitle('') }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add task
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex h-[calc(100vh-180px)] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:w-[380px]">
          {tab === 'chat' ? <BoardChat messages={chatMessages} onSend={sendChat} /> : <LiveFeed items={feedItems} />}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
        active ? 'bg-[color:var(--accent)] text-white' : 'text-slate-600 hover:bg-slate-50')}
    >{children}</button>
  )
}
