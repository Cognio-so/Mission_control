import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Pencil, Trash2, Eraser, Send, Terminal, Sparkles } from 'lucide-react'
import { ORCH_ID, newAgentTemplate, sessionKeyFor } from '../agents.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { dedupeMessages } from '../store/reducer.js'
import { useMission } from '../store/mission.jsx'
import { AgentModal } from '../components/agents/AgentModal.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'

export default function MissionPage() {
  const m = useMission()
  const {
    settings, agents, agentsById, orchestrator, roster, managed,
    activeId, setActiveId, state, anyRunning, agentsLoading, agentsError, agentStatus,
    sendText, clearThread, saveAgent, deleteAgent, agentSaving, getThread,
  } = m

  const active = agentsById[activeId] || orchestrator
  const thread = getThread(activeId)
  const activeSession = sessionKeyFor(active, settings.session)

  // Recent conversations — agents you've chatted with, most recent first.
  const recent = useMemo(() => {
    return agents
      .map((a) => ({ a, t: getThread(a.id) }))
      .filter((x) => x.t.messages.length > 0)
      .map((x) => {
        const last = x.t.messages[x.t.messages.length - 1]
        return { id: x.a.id, name: x.a.name, icon: x.a.icon, text: last?.text || '', ts: last?.ts || 0 }
      })
      .sort((p, q) => q.ts - p.ts)
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, state.threads])

  const [composer, setComposer] = useState('')
  const [agentModal, setAgentModal] = useState(null)
  const [rawOpen, setRawOpen] = useState(false)
  const chatRef = useRef(null)
  const tlRef = useRef(null)
  const rawRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [thread.messages, activeId])
  useEffect(() => { if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight }, [state.timeline])
  useEffect(() => { if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight }, [state.raw])
  useEffect(() => {
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [composer, activeId])

  const send = () => {
    const t = composer.trim()
    if (!t) return
    setComposer('')
    sendText(t)
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const insertMention = (id) => { setComposer((c) => (c ? c.replace(/\s*$/, ' ') : '') + '@' + id + ' '); taRef.current?.focus() }

  const onSave = async (agent, mode) => {
    try { await saveAgent(agent, mode); setAgentModal(null) } catch { /* status shown in store */ }
  }

  return (
    <div className="grid h-[calc(100vh-61px)] grid-cols-1 lg:grid-cols-[280px_1fr_360px]">
      {/* ---- Roster ---- */}
      <aside className="hidden flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white p-4 scrollbar-thin lg:flex">
        <Button className="w-full" onClick={() => setAgentModal({ mode: 'new', agent: newAgentTemplate() })}>
          <Plus className="h-4 w-4" /> New agent
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Metric label="Total agents" value={agents.length} />
          <Metric label="Managed" value={managed.length} />
        </div>

        {agentsError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{agentsError}</div>}
        {agentStatus && (
          <div className={cn('rounded-lg px-3 py-2 text-xs',
            agentStatus.tone === 'error' && 'bg-rose-50 text-rose-600',
            agentStatus.tone === 'ok' && 'bg-emerald-50 text-emerald-700',
            agentStatus.tone === 'pending' && 'bg-amber-50 text-amber-700')}>{agentStatus.text}</div>
        )}

        <SectionLabel>Orchestrator</SectionLabel>
        {orchestrator && (
          <AgentCard
            a={orchestrator} active={activeId === ORCH_ID} running={getThread(ORCH_ID).running}
            hasMsgs={getThread(ORCH_ID).messages.length > 0} orchestrator meta={managed.length + ' managed'}
            onSelect={() => setActiveId(ORCH_ID)} onEdit={() => setAgentModal({ mode: 'edit', agent: orchestrator })}
          />
        )}

        <SectionLabel>
          Specialists <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{roster.length}</span>
        </SectionLabel>
        <div className="space-y-2">
          {roster.length === 0 && <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">Create a specialist to start delegation.</div>}
          {roster.map((a) => (
            <AgentCard
              key={a.id} a={a} active={activeId === a.id} running={getThread(a.id).running}
              hasMsgs={getThread(a.id).messages.length > 0} meta={a.managedByOrchestrator ? 'managed' : 'standalone'}
              onSelect={() => setActiveId(a.id)} onEdit={() => setAgentModal({ mode: 'edit', agent: a })}
              onDelete={() => deleteAgent(a.id)}
            />
          ))}
        </div>

        {recent.length > 0 && (
          <>
            <SectionLabel>Recent</SectionLabel>
            <div className="space-y-1.5">
              {recent.map((r) => (
                <button
                  key={r.id} onClick={() => setActiveId(r.id)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition',
                    activeId === r.id ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-bold text-white">{cleanIcon(r.icon, initials(r.name))}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-strong">{r.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(r.ts)}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">{r.text || '…'}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* ---- Chat ---- */}
      <section className="flex min-h-0 flex-col bg-slate-50">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-xs font-bold text-white">
            {cleanIcon(active?.icon, initials(active?.name))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-strong">{active?.name}</span>
              {active?.id === ORCH_ID ? <Badge variant="accent">orchestrator</Badge> : active?.managedByOrchestrator ? <Badge variant="outline">managed</Badge> : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="truncate">{active?.role || 'agent'}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono">{activeSession}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => clearThread(activeId)} title="Clear thread"><Eraser className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setAgentModal({ mode: 'edit', agent: active })} title="Edit"><Pencil className="h-4 w-4" /></Button>
          {active?.id !== ORCH_ID && (
            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => deleteAgent(active.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
          )}
        </header>

        <div ref={chatRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6 scrollbar-thin">
          {thread.messages.length === 0 ? (
            <EmptyState active={active} onPick={sendText} />
          ) : (
            dedupeMessages(thread.messages).map((msg) => <ChatBubble key={msg.id} m={msg} active={active} />)
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3">
          {active?.id === ORCH_ID && managed.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delegate</span>
              {managed.map((a) => (
                <button
                  key={a.id} onClick={() => insertMention(a.id)} title={'@' + a.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                >
                  <span className="grid h-4 w-4 place-items-center rounded bg-white text-[9px] font-bold text-slate-500">{cleanIcon(a.icon, initials(a.name))}</span>
                  {a.name.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-[color:var(--accent)]">
            <textarea
              ref={taRef} rows={1} value={composer} onChange={(e) => setComposer(e.target.value)} onKeyDown={onKey}
              placeholder={active?.id === ORCH_ID ? 'Ask the Orchestrator to coordinate your agents' : 'Message ' + (active?.name || 'agent')}
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-strong placeholder:text-slate-400 focus:outline-none"
            />
            <Button onClick={send} disabled={thread.running} className="shrink-0">
              <Send className="h-4 w-4" /> Run
            </Button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {settings.demo ? 'Demo mode' : <>Broker <span className="font-mono">{settings.base}</span> · session <b className="font-mono">{activeSession}</b></>}
          </div>
        </div>
      </section>

      {/* ---- Mission panel ---- */}
      <aside className="hidden min-h-0 flex-col border-l border-slate-200 bg-white lg:flex">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-strong">Mission Control</div>
            <div className="text-xs text-muted">{anyRunning ? 'Run in progress' : 'Idle'}</div>
          </div>
          <Button variant={rawOpen ? 'primary' : 'secondary'} size="xs" onClick={() => setRawOpen((o) => !o)}>
            <Terminal className="h-3.5 w-3.5" /> Raw
          </Button>
        </div>

        <RunGraph orchestrator={orchestrator} agents={managed} timeline={state.timeline} running={anyRunning} conn={state.conn} />

        <div ref={tlRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 scrollbar-thin">
          {state.timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-400">MC</div>
              <p className="max-w-[200px] text-xs text-slate-400">Activity appears here when an agent plans, calls tools, or delegates work.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {state.timeline.map((t) => <TimelineItem key={t.id} t={t} agentsById={agentsById} />)}
            </AnimatePresence>
          )}
        </div>

        {rawOpen && (
          <div ref={rawRef} className="h-48 shrink-0 space-y-0.5 overflow-y-auto border-t border-slate-200 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed scrollbar-thin">
            {state.raw.map((r) => (
              <div key={r.id} className={cn(
                r.kind === 'err' && 'text-rose-400', r.kind === 'sys' && 'text-sky-400',
                r.kind === 'in' && 'text-emerald-400', r.kind === 'out' && 'text-amber-300',
                !['err', 'sys', 'in', 'out'].includes(r.kind) && 'text-slate-300')}>{r.line}</div>
            ))}
          </div>
        )}
      </aside>

      {agentModal && (
        <AgentModal
          entry={agentModal} onSave={onSave} saving={agentSaving}
          onDelete={agentModal.mode === 'edit' && agentModal.agent.id !== ORCH_ID ? async () => { if (await deleteAgent(agentModal.agent.id)) setAgentModal(null) } : null}
          onClose={() => setAgentModal(null)}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div className="mt-1 flex items-center px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>
}

function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  return Math.floor(h / 24) + 'd'
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-xl font-semibold text-strong">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function AgentCard({ a, active, running, hasMsgs, orchestrator, meta, onSelect, onEdit, onDelete }) {
  const dot = running ? 'running' : hasMsgs ? 'ready' : 'idle'
  return (
    <motion.div
      whileHover={{ y: -1 }}
      onClick={onSelect}
      title={'@' + a.id}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition',
        active ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-slate-200 bg-white hover:border-slate-300',
        orchestrator && 'bg-gradient-to-br from-white to-blue-50/40',
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-bold text-white">
        {cleanIcon(a.icon, initials(a.name))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-strong">{a.name}</div>
        <div className="truncate text-xs text-muted">{a.role || meta}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <StatusDot status={dot} pulse={running} />
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && <IconBtn onClick={(e) => { e.stopPropagation(); onEdit() }}><Pencil className="h-3 w-3" /></IconBtn>}
          {onDelete && <IconBtn danger onClick={(e) => { e.stopPropagation(); onDelete() }}><Trash2 className="h-3 w-3" /></IconBtn>}
        </div>
      </div>
    </motion.div>
  )
}

function IconBtn({ children, danger, ...props }) {
  return (
    <button {...props} className={cn('grid h-6 w-6 place-items-center rounded-md border text-slate-500 transition',
      danger ? 'border-rose-200 hover:bg-rose-50 hover:text-rose-600' : 'border-slate-200 hover:bg-slate-50')}>{children}</button>
  )
}

function ChatBubble({ m, active }) {
  const isUser = m.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white',
        isUser ? 'bg-slate-400' : 'bg-gradient-to-br from-blue-600 to-blue-700')}>
        {isUser ? 'You' : cleanIcon(active?.icon, initials(active?.name))}
      </div>
      <div className={cn('max-w-[80%]', isUser && 'text-right')}>
        <div className="mb-1 text-xs font-semibold text-slate-500">{isUser ? 'You' : active?.name}</div>
        <div className={cn('inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-[color:var(--accent)] text-white' : 'surface-card text-strong')}>
          {m.text}
          {m.streaming && <span className="stream-caret" />}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyState({ active, onPick }) {
  const isOrch = active?.id === ORCH_ID
  const sugg = isOrch
    ? ['Plan a launch with research and content', 'Compare competitors and brief the team', 'Create an SEO content sprint']
    : [active?.role ? 'Help with ' + active.role : 'What can you do, ' + (active?.name || 'agent') + '?', 'Give me a useful example']
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 text-lg font-bold text-white shadow-lg"
      >
        {cleanIcon(active?.icon, initials(active?.name))}
      </motion.div>
      <h2 className="text-lg font-semibold text-strong">{isOrch ? 'Orchestrator ready' : active?.name + ' ready'}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {isOrch ? 'Start with a goal. Managed agents appear in the run graph as work is delegated.' : 'Start a direct thread with this specialist.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {sugg.map((s, i) => (
          <button key={i} onClick={() => onPick(s)}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]">
            <Sparkles className="h-3 w-3" /> {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function RunGraph({ orchestrator, agents, timeline, running, conn }) {
  const delegated = timeline.filter((t) => t.kind === 'sub')
  const latestByName = new Map()
  for (const item of delegated) latestByName.set(item.title, item)
  const recent = delegated.slice(-3).reverse()
  const shown = agents.slice(0, 6)
  const stateFor = (agent) => {
    const ev = latestByName.get(agent.name)
    if (!ev) return 'idle'
    if (ev.badge === 'done') return 'done'
    if (ev.badge === 'error') return 'error'
    return 'running'
  }

  return (
    <div className="border-b border-slate-200 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-strong">Run Graph</div>
          <div className="text-xs text-muted">{running ? 'Live delegation map' : 'Ready for the next run'}</div>
        </div>
        <Badge variant={conn === 'live' || conn === 'demo' ? 'success' : 'outline'}>{conn}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn('flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2',
          running ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-slate-200 bg-slate-50')}>
          <div className={cn('grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-[10px] font-bold text-white', running && 'animate-pulse-ring')}>
            {cleanIcon(orchestrator?.icon, 'OC')}
          </div>
          <span className="text-xs font-semibold text-strong">{orchestrator?.name || 'Orchestrator'}</span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent" />
      </div>
      <div className="mt-2 grid gap-2">
        {shown.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">No managed agents yet.</div>
        ) : (
          shown.map((agent) => {
            const status = stateFor(agent)
            return (
              <div key={agent.id} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                status === 'running' && 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]',
                status === 'done' && 'border-emerald-200 bg-emerald-50',
                status === 'error' && 'border-rose-200 bg-rose-50',
                status === 'idle' && 'border-slate-200 bg-white')}>
                <span className="grid h-6 w-6 place-items-center rounded bg-white text-[9px] font-bold text-slate-600">{cleanIcon(agent.icon, initials(agent.name))}</span>
                <span className="flex-1 truncate font-medium text-strong">{agent.name}</span>
                <StatusDot status={status} pulse={status === 'running'} />
              </div>
            )
          })
        )}
      </div>
      {recent.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recent.map((item) => (
            <span key={item.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{item.title}: {item.badge || 'queued'}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineItem({ t, agentsById }) {
  if (t.kind === 'divider') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t.text}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    )
  }
  if (t.kind === 'sub') {
    const parent = t.parent && agentsById[t.parent]
    return (
      <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600">{cleanIcon(t.icon, 'A')}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-strong">{t.title}</div>
            <div className="truncate text-[11px] text-muted">{parent ? parent.name + ' / ' : ''}{t.sub}</div>
          </div>
          <SubBadge badge={t.badge} />
        </div>
        {t.stream && <div className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600 scrollbar-thin">{t.stream}</div>}
        {t.result && <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-700">{t.result}</div>}
      </motion.div>
    )
  }
  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
      className={cn('rounded-xl border p-3', t.cls === 'error' ? 'border-rose-200 bg-rose-50' : t.cls === 'tool' ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white')}>
      <div className="flex items-center gap-2 text-xs font-semibold text-strong">
        <span className="flex-1">{t.head}</span>
        {t.tag && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-500">{t.tag}</span>}
        {t.status && <span className="text-[11px] text-slate-400">{t.status}</span>}
      </div>
      {t.sub && <div className="mt-1 break-words text-[11px] text-muted">{t.sub}</div>}
      {t.pre && <div className="mt-1 whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">{t.pre}</div>}
    </motion.div>
  )
}

function SubBadge({ badge }) {
  const map = { queued: 'outline', running: 'accent', done: 'success', error: 'danger' }
  return <Badge variant={map[badge] || 'outline'}>{badge || 'queued'}</Badge>
}
