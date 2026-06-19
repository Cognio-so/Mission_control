import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Pencil, Trash2, Eraser, Send, Terminal, Sparkles, MessageSquarePlus, ChevronDown, History, Paperclip, X, FileText, Maximize2, Bot, Loader2, Zap, Activity } from 'lucide-react'
import { ORCH_ID, newAgentTemplate } from '../agents.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { cleanChatText } from '../lib/chatText.js'
import { dedupeMessages } from '../store/reducer.js'
import { useMission } from '../store/mission.jsx'
import { AgentModal } from '../components/agents/AgentModal.jsx'
import { AgentFilesDialog } from '../components/agents/AgentFilesDialog.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'
import { Markdown } from '../components/atoms/Markdown.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'

export default function MissionPage() {
  const m = useMission()
  const {
    settings, agents, agentsById, orchestrator, roster, managed, teams,
    activeId, setActiveId, state, anyRunning, agentsLoading, agentsError, agentStatus,
    sendText, stopRun, clearThread, saveAgent, deleteAgent, agentSaving, getThread, newChat,
    savedChats, resumeChat, deleteConversation, currentSessionKey,
  } = m

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const chatOnly = searchParams.get('chat') === '1' // focused "Start chat" view — Main only, no side panels

  const selectedId = chatOnly ? ORCH_ID : agentsById[activeId] ? activeId : ORCH_ID
  const active = agentsById[selectedId] || orchestrator
  const activeSessionKey = currentSessionKey(selectedId) // current chat session — scopes the run artifact
  const thread = getThread(selectedId)
  const mainThread = getThread(ORCH_ID)

  const teamMeta = useMemo(() => {
    const map = new Map([[ORCH_ID, { label: 'Central', team: 'Central', role: 'Main' }]])
    for (const team of teams || []) {
      const name = team.name || team.team || 'Team'
      if (team.orchestrator?.id) map.set(team.orchestrator.id, { label: name + ' team / Lead', team: name, role: 'Lead' })
      for (const member of team.members || []) {
        if (member?.id) map.set(member.id, { label: name + ' team / Specialist', team: name, role: 'Specialist' })
      }
    }
    for (const agent of roster) {
      if (!map.has(agent.id)) {
        map.set(agent.id, {
          label: agent.team ? agent.team + ' team' : 'Ungrouped agent',
          team: agent.team || '',
          role: agent.kind === 'orchestrator' ? 'Lead' : 'Specialist',
        })
      }
    }
    return map
  }, [teams, roster])

  // Team tree comes from the broker when available.
  // Recent conversations — active threads + saved (archived) chats, newest first.
  // An agent can have many; New chat archives the previous one here.
  const recent = useMemo(() => {
    const active = agents
      .map((a) => ({ a, t: getThread(a.id) }))
      .filter((x) => x.t.messages.length > 0)
      .map((x) => {
        const last = x.t.messages[x.t.messages.length - 1]
        const meta = teamMeta.get(x.a.id) || {}
        return {
          kind: 'active', cid: 'active_' + x.a.id, agentId: x.a.id,
          name: x.a.name, icon: x.a.icon, teamLabel: meta.label || 'Direct agent',
          text: last?.text || '', ts: last?.ts || 0,
        }
      })
    const saved = (savedChats || [])
      .map((c) => ({ ...c, agentId: c.agentId === 'orchestrator' ? ORCH_ID : c.agentId }))
      .map((c) => {
        const agent = agentsById[c.agentId]
        const meta = teamMeta.get(c.agentId) || {}
        return {
          kind: 'saved', cid: c.cid, agentId: c.agentId,
          name: agent?.name || (c.agentId === ORCH_ID ? 'Main' : c.name || c.agentId),
          icon: agent?.icon || c.icon,
          teamLabel: meta.label || 'Saved conversation',
          text: c.messages?.[c.messages.length - 1]?.text || '',
          ts: c.ts,
          saved: c,
        }
      })
    return [...active, ...saved].sort((p, q) => q.ts - p.ts).slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, agentsById, state.threads, savedChats, teamMeta])

  const liveAgentIds = useMemo(
    () => new Set(inferActiveAgentCallsFromTimeline(state.timeline, agents, anyRunning).map(({ agent }) => agent.id)),
    [state.timeline, agents, anyRunning],
  )

  const [composer, setComposer] = useState('')
  const [effort, setEffort] = useState('medium')
  const [files, setFiles] = useState([])
  const [agentModal, setAgentModal] = useState(null)
  const [filesAgent, setFilesAgent] = useState(null)
  const [rawOpen, setRawOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const isMain = active?.id === ORCH_ID
  const toggleTeam = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))
  const chatRef = useRef(null)
  const tlRef = useRef(null)
  const rawRef = useRef(null)
  const taRef = useRef(null)
  const fileRef = useRef(null)
  // Hide the empty assistant placeholder entirely — the working spinner stands in for it.
  const visibleMessages = useMemo(
    () => dedupeMessages(thread.messages).filter((msg) => !(msg.role === 'assistant' && !String(msg.text || '').trim())),
    [thread.messages],
  )
  const runningSteps = useMemo(() => {
    const agentSteps = activeCallsToSteps(computeActiveCalls(buildAllAgents(orchestrator, agents, teams), state.timeline, true), selectedId)
    const toolSteps = currentRunSlice(state.timeline, true).filter((t) => t.kind === 'node').map(classifyStep).filter(isUsefulActivityStep)
    return [...agentSteps, ...toolSteps]
  }, [orchestrator, agents, teams, selectedId, state.timeline])
  // Prefer the latest step that's actually still running, so a just-finished sub
  // never leaves the bubble stuck on "Delegating to …" while the parent works on.
  const latestRunningStep =
    [...runningSteps].reverse().find((step) => step.status === 'running') ||
    runningSteps[runningSteps.length - 1] ||
    null
  // Spinner shows until the real answer text arrives — not tied to the run flag, so a
  // still-working agent never collapses to a blank bubble.
  const lastMsg = thread.messages[thread.messages.length - 1]
  const awaitingAnswer = !!lastMsg && lastMsg.role === 'assistant' && !String(lastMsg.text || '').trim()
  // Spin while the team is genuinely working: the parent is running, OR a delegated sub
  // is ACTIVELY running (badge 'running' — NOT merely 'queued', which can stay stuck and
  // would falsely keep a finished run spinning). A safety guard settles it if events go
  // silent for a stretch, so a dropped terminal badge can't pin the spinner forever.
  const hasRunningSubs = useMemo(
    () => currentRunSlice(state.timeline, true).some((t) => t.kind === 'sub' && t.badge === 'running'),
    [state.timeline],
  )
  const [tlChangedAt, setTlChangedAt] = useState(() => Date.now())
  useEffect(() => { setTlChangedAt(Date.now()) }, [state.timeline])
  const [, setStaleTick] = useState(0)
  useEffect(() => {
    if (!hasRunningSubs) return
    const iv = setInterval(() => setStaleTick((n) => n + 1), 5000)
    return () => clearInterval(iv)
  }, [hasRunningSubs])
  const liveSubs = hasRunningSubs && Date.now() - tlChangedAt < 120000
  const runActive = thread.running || awaitingAnswer || liveSubs
  const showWorkingBubble = runActive && !visibleMessages.some((msg) => msg.role === 'assistant' && msg.streaming && String(msg.text || '').trim())

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [thread.messages, selectedId])
  useEffect(() => { if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight }, [state.timeline])
  useEffect(() => { if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight }, [state.raw])
  useEffect(() => {
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [composer, selectedId])

  // Run artifact: auto-open when the active agent starts a run (in both the full
  // cockpit and the focused Start-chat view), auto-close shortly after it finishes.
  // A header button re-opens it on demand.
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [nodeDetail, setNodeDetail] = useState(null) // clicked Coordination-Map node → centered card
  // Open the artifact when a run starts; keep it open afterwards so the graph + run
  // history persist (the user closes it manually, or reopens via the Run button).
  useEffect(() => { if (runActive) setArtifactOpen(true) }, [runActive])
  // On load, surface the persisted run history once if this chat already has runs.
  const restoredOnceRef = useRef(false)
  useEffect(() => {
    if (restoredOnceRef.current) return
    if (groupRuns(state.timeline, activeSessionKey).length > 0) { setArtifactOpen(true); restoredOnceRef.current = true }
  }, [state.timeline, activeSessionKey])

  const send = () => {
    const t = composer.trim()
    if (!t && !files.length) return
    const picked = files
    setComposer('')
    setFiles([])
    if (fileRef.current) fileRef.current.value = ''
    sendText(t, selectedId, effort, picked)
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const addFiles = (list) => setFiles((prev) => [...prev, ...Array.from(list || []).filter(Boolean)].slice(0, 10))
  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index))

  const onSave = async (agent, mode) => {
    try { await saveAgent(agent, mode); setAgentModal(null) } catch { /* status shown in store */ }
  }

  return (
    <div className={cn('relative grid h-full min-h-0 overflow-hidden grid-cols-1', !chatOnly && 'lg:grid-cols-[256px_1fr]')}>
      {/* ---- Roster ---- */}
      <aside className={cn('hidden min-h-0 overflow-hidden flex-col border-r border-slate-200 bg-white lg:flex', chatOnly && 'lg:hidden')}>
        {/* fixed top */}
        <div className="space-y-2.5 p-3 pb-2">
          <Button size="sm" className="w-full" onClick={() => setAgentModal({ mode: 'new', agent: newAgentTemplate() })}>
            <Plus className="h-3.5 w-3.5" /> New agent
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Total agents" value={roster.length} />
            <Metric label="Managed" value={managed.length} />
          </div>
          {agentsError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{agentsError}</div>}
          {agentStatus && (
            <div className={cn('rounded-lg px-3 py-2 text-xs',
              agentStatus.tone === 'error' && 'bg-rose-50 text-rose-600',
              agentStatus.tone === 'ok' && 'bg-emerald-50 text-emerald-700',
              agentStatus.tone === 'pending' && 'bg-amber-50 text-amber-700')}>{agentStatus.text}</div>
          )}
        </div>

        {/* team tree — scrolls in its own area so all agents are reachable */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-thin">
        <div>
          <SectionLabel>Central</SectionLabel>
          <div
            className={cn(
              'group mt-1.5 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition',
              selectedId === ORCH_ID
                ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] shadow-[0_14px_34px_rgba(64,163,148,0.18)]'
                : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-tint)]',
            )}
          >
            <button onClick={() => setActiveId(ORCH_ID)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg [background-image:var(--grad-brand)] text-[10px] font-bold text-white', mainThread.running && 'animate-pulse-ring')}>
                {cleanIcon(orchestrator?.icon, 'CG')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-strong">Main</span>
                  <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent-strong)]">Global</span>
                </div>
                <div className="truncate text-[10px] text-muted">Chat with the central controller</div>
              </div>
            </button>
            <IconBtn onClick={(e) => { e.stopPropagation(); setFilesAgent({ id: ORCH_ID, name: 'Main' }) }}><Pencil className="h-3 w-3" /></IconBtn>
            <StatusDot status={mainThread.running ? 'running' : mainThread.messages.length ? 'ready' : 'idle'} pulse={mainThread.running} />
          </div>
        </div>

        {false && recent.length > 0 && (
          <div>
            <SectionLabel>
              Conversations <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{recent.length}</span>
            </SectionLabel>
            <div className="mt-1.5 space-y-1.5">
              {recent.map((r) => (
                <div
                  key={r.cid}
                  className={cn(
                    'group flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 shadow-sm transition',
                    r.kind === 'active' && selectedId === r.agentId
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
                      : 'border-[color:var(--border)] hover:border-[color:var(--accent)] hover:bg-[#fffaf0]',
                  )}
                >
                  <button
                    onClick={() => (r.kind === 'active' ? setActiveId(r.agentId) : resumeChat(r.saved))}
                    title={r.kind === 'saved' ? 'Saved conversation - click to resume' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-bold text-white">
                      {cleanIcon(r.icon, initials(r.name))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-strong">
                          {r.kind === 'saved' && <History className="h-3 w-3 shrink-0 text-slate-400" />}
                          <span className="truncate">{r.name}</span>
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(r.ts)}</span>
                      </div>
                      <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-strong)]">{r.teamLabel}</div>
                      <div className="truncate text-[11px] text-muted">{r.text || 'No messages yet'}</div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(r) }}
                    title="Delete conversation"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-transparent text-slate-300 opacity-0 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <SectionLabel>
          Team tree <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{roster.length}</span>
        </SectionLabel>
        {teams.length === 0 && (
          <div className="rounded-lg border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-3 py-4 text-center text-xs text-muted">
            No teams yet. Create a team lead to start building the tree.
          </div>
        )}
        {teams.map((team) => {
          const o = team.orchestrator
          const oT = getThread(o.id)
          const oLive = liveAgentIds.has(o.id)
          const oDot = oLive ? 'running' : oT.running ? 'running' : oT.messages.length ? 'ready' : o.status || 'idle'
          const isCollapsed = collapsed[team.id]
          return (
            <div key={team.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* team header */}
              <button
                onClick={() => toggleTeam(team.id)}
                className="flex w-full items-center gap-1.5 bg-gradient-to-r from-slate-50 to-white px-2.5 py-1.5 text-left"
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{team.name} team</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 py-px text-[9px] font-semibold text-slate-500">{team.members.length}</span>
                <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-slate-400 transition-transform', isCollapsed && '-rotate-90')} />
              </button>

              {/* team lead */}
              <div className={cn('group flex items-center gap-2 border-t border-slate-100 px-2 py-2 transition',
                selectedId === o.id ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-slate-50')}>
                <button onClick={() => setActiveId(o.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg [background-image:var(--grad-brand)] text-[10px] font-bold text-white', oT.running && 'animate-pulse-ring')}>
                    {cleanIcon(o.icon, initials(o.name))}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-strong">{o.name}</span>
                      <span className="shrink-0 rounded bg-[color:var(--accent-soft)] px-1 py-px text-[8px] font-bold uppercase tracking-wide text-[color:var(--accent-strong)]">Team lead</span>
                    </div>
                    <div className="truncate text-[10px] text-muted">{o.role || 'team lead'}</div>
                  </div>
                </button>
                <StatusDot status={oDot} pulse={oT.running} />
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <IconBtn onClick={(e) => { e.stopPropagation(); setFilesAgent({ id: o.id, name: o.name }) }}><Pencil className="h-3 w-3" /></IconBtn>
                  {o.id !== ORCH_ID && <IconBtn danger onClick={(e) => { e.stopPropagation(); deleteAgent(o.id) }}><Trash2 className="h-3 w-3" /></IconBtn>}
                </div>
              </div>

              {/* members tree */}
              {!isCollapsed && (
                <div className="relative py-1 pl-6 pr-2">
                  <div className="absolute left-[18px] top-0 bottom-4 w-px bg-slate-200" />
                  {team.members.length === 0 ? (
                    <div className="py-2 pl-1 text-[11px] text-slate-400">No subagents yet.</div>
                  ) : team.members.map((m) => {
                    const t = getThread(m.id)
                    const mLive = liveAgentIds.has(m.id)
                    const dot = mLive ? 'running' : t.running ? 'running' : t.messages.length ? 'ready' : m.status || 'idle'
                    return (
                      <div key={m.id} className="relative">
                        <span className="absolute -left-[6px] top-1/2 h-px w-2.5 bg-slate-200" />
                        <div className={cn('group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition',
                          selectedId === m.id ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-slate-50')}>
                          <button onClick={() => setActiveId(m.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-[8px] font-bold text-white">
                              {cleanIcon(m.icon, initials(m.name))}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-strong">{m.name}</div>
                              <div className="truncate text-[10px] text-muted">{m.role || 'specialist'}</div>
                            </div>
                          </button>
                          <StatusDot status={dot} pulse={t.running} />
                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <IconBtn onClick={(e) => { e.stopPropagation(); setFilesAgent({ id: m.id, name: m.name }) }}><Pencil className="h-3 w-3" /></IconBtn>
                            <IconBtn danger onClick={(e) => { e.stopPropagation(); deleteAgent(m.id) }}><Trash2 className="h-3 w-3" /></IconBtn>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        </div>

        {false && recent.length > 0 && (
          <div className="hidden">
            <SectionLabel>
              Recent <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{recent.length}</span>
            </SectionLabel>
            <div className="mt-1.5 max-h-60 space-y-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
              {recent.map((r) => (
                <button
                  key={r.cid} onClick={() => (r.kind === 'active' ? setActiveId(r.agentId) : resumeChat(r.saved))}
                  title={r.kind === 'saved' ? 'Saved conversation — click to resume' : undefined}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition',
                    r.kind === 'active' && selectedId === r.agentId ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-bold text-white">{cleanIcon(r.icon, initials(r.name))}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-strong">
                        {r.kind === 'saved' && <History className="h-3 w-3 shrink-0 text-slate-400" />}
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(r.ts)}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">{r.text || '…'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ---- Chat ---- */}
      <section className={cn(
        'flex min-h-0 min-w-0 overflow-hidden flex-col bg-slate-50 transition-[padding] duration-300 ease-out',
        chatOnly && 'mx-auto w-full max-w-4xl border-x border-slate-200',
        artifactOpen && !chatOnly && 'lg:pr-[440px]', // shift chat clear of the run-artifact drawer instead of letting it overlap
      )}>
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl [background-image:var(--grad-brand)] text-xs font-bold text-white">
            {cleanIcon(active?.icon, initials(active?.name))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-strong">{active?.name}</span>
              {isMain ? <Badge variant="accent">main</Badge> : active?.kind === 'orchestrator' ? <Badge variant="accent">team lead</Badge> : active?.managedByOrchestrator ? <Badge variant="outline">specialist</Badge> : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="truncate">{active?.role || 'agent'}</span>
            </div>
          </div>
          <Button variant={artifactOpen ? 'primary' : 'secondary'} size="sm" onClick={() => setArtifactOpen((o) => !o)} title="Show run activity" className="relative">
            <Activity className="h-4 w-4" /> Run
            {thread.running && !artifactOpen && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-[color:var(--accent)]" />}
          </Button>
          {chatOnly && (
            <Button variant="secondary" size="sm" onClick={() => navigate('/mission')} title="Open full Mission Control"><Maximize2 className="h-4 w-4" /> Mission Control</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => newChat(selectedId)} title="Start a new chat (fresh session)"><MessageSquarePlus className="h-4 w-4" /> New chat</Button>
          <Button variant="ghost" size="sm" onClick={() => clearThread(selectedId)} title="Clear thread"><Eraser className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setFilesAgent({ id: active.id, name: active.name })} title={isMain ? 'Open main markdown' : 'Open agent markdown'}><Pencil className="h-4 w-4" /></Button>
          {!isMain && (
            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => deleteAgent(active.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
          )}
        </header>

        <div ref={chatRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-6 scrollbar-thin">
          {thread.messages.length === 0 ? (
            <EmptyState active={active} onPick={(text) => sendText(text, selectedId, effort)} />
          ) : (
            visibleMessages.map((msg) => <ChatBubble key={msg.id} m={msg} active={active} />)
          )}
          {showWorkingBubble && <WorkingBubble active={active} step={latestRunningStep} />}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <span
                  key={file.name + '_' + index}
                  className="inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-muted)]"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    title="Remove file"
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-[color:var(--accent)]">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              ref={taRef} rows={1} value={composer} onChange={(e) => setComposer(e.target.value)} onKeyDown={onKey}
              placeholder={isMain ? 'Ask Main to coordinate your teams and agents' : 'Message ' + (active?.name || 'agent')}
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-strong placeholder:text-slate-400 focus:outline-none"
            />
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              title="Reasoning effort"
              className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none transition hover:border-[color:var(--accent)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            >
              {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            {runActive ? (
              <Button type="button" variant="danger" onClick={() => stopRun(selectedId)} title="Stop this run and all its subagents" className="shrink-0">
                <span className="h-3 w-3 rounded-[2px] bg-current" /> Stop
              </Button>
            ) : (
              <Button onClick={send} disabled={!composer.trim() && !files.length} className="shrink-0">
                <Send className="h-4 w-4" /> Run
              </Button>
            )}
          </div>
          {settings.demo && <div className="mt-2 text-[11px] text-slate-400">Demo mode</div>}
        </div>
      </section>

      {/* ---- Run artifact (on-demand; auto-opens during a run) ---- */}
      <RunArtifact
        open={artifactOpen}
        onClose={() => setArtifactOpen(false)}
        orchestrator={orchestrator}
        agents={agents}
        teams={teams}
        active={active}
        sessionKey={activeSessionKey}
        timeline={state.timeline}
        conn={state.conn}
        onSelectNode={setNodeDetail}
      />

      {/* ---- Clicked-node detail: opens centered over the chat, tracks live output ---- */}
      <RunNodeDetail node={nodeDetail} timeline={state.timeline} agentsById={agentsById} onClose={() => setNodeDetail(null)} />

      {agentModal && (
        <AgentModal
          entry={agentModal} onSave={onSave} saving={agentSaving}
          onDelete={agentModal.mode === 'edit' && agentModal.agent.id !== ORCH_ID ? async () => { if (await deleteAgent(agentModal.agent.id)) setAgentModal(null) } : null}
          onClose={() => setAgentModal(null)}
        />
      )}
      {filesAgent && (
        <AgentFilesDialog agentId={filesAgent.id} agentName={filesAgent.name} onClose={() => setFilesAgent(null)} />
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div className="mt-1 flex items-center px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="text-lg font-semibold leading-tight text-strong">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
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
  const text = cleanChatText(m.text, m.role)
  const empty = !text || !text.trim()
  if (isUser && empty) return null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white',
        isUser ? 'bg-slate-400' : '[background-image:var(--grad-brand)]')}>
        {isUser ? 'You' : cleanIcon(active?.icon, initials(active?.name))}
      </div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div className="mb-1 text-xs font-semibold text-slate-500">{isUser ? 'You' : active?.name}</div>
        <div className={cn('max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'block w-fit overflow-hidden bg-[color:var(--accent)] text-left text-white' : 'block w-fit overflow-hidden surface-card text-left text-strong')}>
          {isUser ? (
            <Markdown content={text} className="chat-markdown-user text-white" />
          ) : empty && m.streaming ? (
            <Thinking />
          ) : (
            <>
              <Markdown content={text} />
              {m.streaming && <span className="stream-caret align-middle" />}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function WorkingBubble({ active, step }) {
  // Only name a step when it's a real delegated agent / named tool / skill / plugin —
  // never the generic "Tool"/"Command"/"Update" noise. Shown as shimmering text (no box)
  // with the spinner beside it, persisting until the answer arrives.
  const meaningful = step && step.kind !== 'operation' && !isGenericActivityLabel(step.label)
  const label = meaningful
    ? (step.kind === 'agent' ? `Delegating to ${step.label}` : `Using ${step.label}`)
    : `${active?.name || 'Agent'} is working`
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white [background-image:var(--grad-brand)]">
        {cleanIcon(active?.icon, initials(active?.name))}
      </div>
      <div className="flex min-w-0 flex-col items-start">
        <div className="mb-1 text-xs font-semibold text-slate-500">{active?.name || 'Agent'}</div>
        <div className="inline-flex items-center gap-2 py-1">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--accent)]" />
          <span className="shimmer-text text-sm font-medium">{label}</span>
        </div>
      </div>
    </motion.div>
  )
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-2 py-0.5 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--accent)]" />
      <span className="text-sm">Thinking...</span>
    </span>
  )
}

// ---- Live execution status (shown inline in the chat while a run is in flight) ----
// Turns the raw run stream into a clean, structured view: which agent is working,
// which tool / skill / plugin fired. Raw payloads stay tucked behind a toggle.
const STEP_META = {
  agent: { Icon: Bot, word: 'Agent', tint: 'text-[color:var(--accent-strong)]' },
  tool: { Icon: Terminal, word: 'Tool', tint: 'text-[color:var(--info)]' },
  skill: { Icon: Sparkles, word: 'Skill', tint: 'text-[color:var(--accent)]' },
  plugin: { Icon: Zap, word: 'Plugin', tint: 'text-[color:var(--warning)]' },
  operation: { Icon: Terminal, word: 'Operation', tint: 'text-[color:var(--text-muted)]' },
  error: { Icon: Terminal, word: 'Error', tint: 'text-[color:var(--danger)]' },
}

function classifyStep(t) {
  if (t.kind === 'sub') {
    return {
      id: t.id, kind: 'agent', label: t.title || t.key || 'Agent',
      status: t.badge === 'done' ? 'done' : t.badge === 'error' ? 'error' : 'running',
      stream: t.stream, result: t.result, detail: '',
    }
  }
  const opStep = nodeStep(t)
  if (opStep) return opStep
  if (opStep === null) return null
  const head = String(t.head || '')
  const m = head.match(/^\s*(Tool|Operation)\s*\/\s*(.+)$/i)
  const label = (m ? m[2] : head).trim()
  const hay = (label + ' ' + (t.sub || '')).toLowerCase()
  let kind = m && /operation/i.test(m[1]) ? 'operation' : 'tool'
  if (/\bplugin\b/.test(hay)) kind = 'plugin'
  else if (/\bskill\b/.test(hay)) kind = 'skill'
  if (t.cls === 'error') kind = 'error'
  return { id: t.id, kind, label: label || 'step', status: t.cls === 'error' ? 'error' : 'done', detail: t.sub || '', stream: '', result: '' }
}

function isGenericActivityLabel(label) {
  return /^(startup|start|started|update|updating|agent activity|activity|operation|tool|tools|tool activity|command|commands|step|task|run|running|thinking|reasoning|working|processing|executing|using tool)$/i.test(String(label || '').trim())
}

function isUsefulActivityStep(step) {
  if (!step) return false
  if (step.kind === 'error') return true
  if (step.kind === 'agent') return !isGenericActivityLabel(step.label)
  if (step.kind === 'tool' || step.kind === 'skill' || step.kind === 'plugin') return !isGenericActivityLabel(step.label)
  // Drop generic "operation / Update" steps — that text is the agent's streaming
  // reasoning/answer (it belongs in the chat bubble), not a discrete activity step.
  return false
}

function isNoisyLegacyNode(t) {
  if (!t || t.kind !== 'node' || t.cls === 'error') return false
  const head = String(t.head || '').replace(/^\s*(Tool|Operation)\s*\/\s*/i, '').trim()
  return isGenericActivityLabel(head)
}

function parseJson(value) {
  if (!value || typeof value !== 'string') return null
  const text = value.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try { return JSON.parse(text) } catch { return null }
}

function wordLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function cleanOpText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(cleanOpText).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (typeof value.progressText === 'string') return value.progressText.trim()
    if (typeof value.message === 'string') return value.message.trim()
    if (typeof value.text === 'string') return value.text.trim()
    if (typeof value.content === 'string') return value.content.trim()
    if (typeof value.query === 'string') return value.query.trim()
    if (typeof value.url === 'string') return value.url.trim()
    if (typeof value.path === 'string') return value.path.trim()
    if (typeof value.command === 'string') return value.command.trim()
    if (typeof value.prompt === 'string') return value.prompt.trim()
    if (typeof value.title === 'string' && value.title.toLowerCase() !== 'preamble') return value.title.trim()
  }
  return ''
}

function findPublicOpDetail(value, depth = 0) {
  if (!value || depth > 4) return ''
  if (typeof value !== 'object') return ''
  const direct = cleanOpText(value)
  if (direct) return direct
  const keys = ['query', 'q', 'url', 'href', 'path', 'file', 'command', 'prompt', 'message', 'text', 'input', 'args', 'parameters']
  for (const key of keys) {
    const found = cleanOpText(value[key])
    if (found) return found
  }
  for (const key of Object.keys(value)) {
    const child = value[key]
    if (!child || typeof child !== 'object') continue
    const found = findPublicOpDetail(child, depth + 1)
    if (found) return found
  }
  return ''
}

function publicOpDetailFromPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  return (
    cleanOpText(data.progressText) ||
    cleanOpText(data.deltaText) ||
    cleanOpText(data.message) ||
    cleanOpText(data.text) ||
    cleanOpText(data.title && data.title.toLowerCase() !== 'preamble' ? data.title : '') ||
    cleanOpText(payload?.message) ||
    findPublicOpDetail(data.args || data.input || data.parameters || payload?.args || payload?.input || payload?.parameters || payload)
  )
}

function opFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const stream = String(payload.stream || payload.event || payload.type || '').trim()
  const phase = String(data.phase || payload.phase || payload.status || '').trim()
  const rawKind = String(data.kind || payload.kind || payload.type || payload.operation || '').trim()
  const detail = publicOpDetailFromPayload(payload)
  const noisy = new Set(['thread_ready', 'turn_starting', 'startup', 'start', 'started', 'completed', 'end', 'done'])
  if (payload.isHeartbeat) return null
  if (!detail && /lifecycle/i.test(stream) && noisy.has(phase.toLowerCase())) return null
  if (!detail && !data.tool && !data.toolName && noisy.has(phase.toLowerCase())) return null

  let kind = 'operation'
  const hay = [stream, rawKind, phase, detail].join(' ')
  if (detail && !data.tool && !data.toolName && /hook|lifecycle|userMessage/i.test(stream + ' ' + rawKind)) kind = 'agent'
  else if (/skill/i.test(hay)) kind = 'skill'
  else if (/plugin/i.test(hay)) kind = 'plugin'
  else if (/tool|pretool|posttool|command|shell/i.test(hay)) kind = 'tool'
  if (!detail && kind !== 'tool' && kind !== 'skill' && kind !== 'plugin' && !payload.name) return null

  return {
    kind,
    label:
      cleanOpText(data.tool || data.toolName || payload.tool || payload.name) ||
      (phase && !noisy.has(phase.toLowerCase()) ? wordLabel(phase) : '') ||
      cleanOpText(data.title && data.title.toLowerCase() !== 'preamble' ? data.title : '') ||
      (kind === 'tool' ? 'Tool activity' : 'Agent activity'),
    detail,
    status: /error|failed|aborted/i.test(phase) ? 'error' : /complete|done|end/i.test(phase) ? 'done' : 'running',
    sessionKey: data.sessionKey || payload.sessionKey || payload.brokerSessionKey || '',
    phase,
    stream,
  }
}

function nodeStep(t) {
  if (!t || t.kind !== 'node') return false
  const raw = parseJson(t.sub)
  const op = t.op || (raw ? opFromPayload(raw) : null)
  const wasRawOperation = /^Operation\s*\/\s*operation$/i.test(String(t.head || '').trim()) || (!!raw && /operation/i.test(String(t.head || '')))
  if (wasRawOperation && !op) return null
  if (!op) return false
  const kind = t.cls === 'error' ? 'error' : op.kind || 'operation'
  return {
    id: t.id,
    kind,
    label: op.label || t.head || 'Activity',
    status: t.cls === 'error' ? 'error' : op.status || 'running',
    detail: op.detail || (!raw ? t.sub || '' : ''),
    stream: '',
    result: '',
    sessionKey: op.sessionKey,
  }
}

function ChatExecution({ timeline, active }) {
  const steps = currentRunSlice(timeline, true)
    .filter((t) => t.kind === 'sub' || t.kind === 'node')
    .map(classifyStep)
    .filter(Boolean)
  const agentCount = steps.filter((s) => s.kind === 'agent').length

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white [background-image:var(--grad-brand)]">
        {cleanIcon(active?.icon, initials(active?.name))}
      </div>
      <div className="min-w-0 max-w-[85%] flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--accent)]" />
          {active?.name || 'Main'} is working{agentCount ? ` · ${agentCount} agent${agentCount === 1 ? '' : 's'} engaged` : ''}
        </div>
        <div className="rounded-2xl border border-[color:var(--border-accent)] bg-[color:var(--surface)] p-2 shadow-sm">
          {steps.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--accent)]" />
              Planning the run…
            </div>
          ) : (
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {steps.map((s) => <ExecStep key={s.id} step={s} />)}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function ExecStep({ step }) {
  const [open, setOpen] = useState(false)
  const meta = STEP_META[step.kind] || STEP_META.tool
  const Icon = meta.Icon
  const hasDetail = !!(step.detail || step.stream || step.result)
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      className="rounded-xl border-2 bg-[color:var(--surface-muted)] px-2.5 py-2"
      style={{ borderColor: runColor(step.status) }}
    >
      <button type="button" onClick={() => hasDetail && setOpen((o) => !o)} className={cn('flex w-full items-center gap-2 text-left', !hasDetail && 'cursor-default')}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ color: runColor(step.status), backgroundColor: runSoft(step.status) }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-strong">{step.label}</span>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-quiet">{meta.word}</span>
        </span>
        <StatusBadge status={step.status} />
        {hasDetail && <ChevronDown className={cn('h-3.5 w-3.5 text-quiet transition-transform', open && 'rotate-180')} />}
      </button>
      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 space-y-1.5">
              {step.stream && (
                <div className="max-h-72 overflow-y-auto rounded-lg bg-[color:var(--surface)] px-2.5 py-2 text-[12px] leading-relaxed text-strong scrollbar-thin">
                  <Markdown content={step.stream} />
                </div>
              )}
              {step.result && (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-[color:var(--border-accent)] bg-[color:var(--success-soft)] px-2.5 py-2 text-[12px] leading-relaxed text-[color:var(--success)] scrollbar-thin">
                  <Markdown content={step.result} />
                </div>
              )}
              {step.detail && <div className="rounded-lg bg-[color:var(--surface)] px-2 py-1.5 text-[11px] leading-relaxed text-muted">{step.detail}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function EmptyState({ active, onPick }) {
  const isMain = active?.id === ORCH_ID
  const sugg = isMain
    ? ['Plan a launch with research and content', 'Compare competitors and brief the team', 'Create an SEO content sprint']
    : [active?.role ? 'Help with ' + active.role : 'What can you do, ' + (active?.name || 'agent') + '?', 'Give me a useful example']
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="mb-4 grid h-16 w-16 place-items-center rounded-3xl [background-image:var(--grad-brand)] text-lg font-bold text-white shadow-lg"
      >
        {cleanIcon(active?.icon, initials(active?.name))}
      </motion.div>
      <h2 className="text-lg font-semibold text-strong">{isMain ? 'Main ready' : active?.name + ' ready'}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {isMain ? 'Start with a goal. Main can coordinate every team and agent from here.' : 'Start a direct thread with this agent.'}
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

function currentRunSlice(timeline, running) {
  if (!running) return []
  const lastStart = timeline.reduce((idx, item, i) => (
    item.kind === 'divider' && !/^run (complete|failed)$/i.test(String(item.text || '').trim()) ? i : idx
  ), -1)
  return lastStart < 0 ? timeline : timeline.slice(lastStart + 1)
}

function agentWords(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function scoreAgentMention(agent, text) {
  if (!agent || agent.id === ORCH_ID || !text) return 0
  const hay = agentWords(text)
  const compactHay = hay.replace(/\s+/g, '')
  const id = String(agent.id || '').toLowerCase()
  const name = agentWords(agent.name)
  const compactName = name.replace(/\s+/g, '')
  const team = agentWords(agent.team)
  const role = agentWords(agent.role)
  let score = 0

  if (id && text.toLowerCase().includes(id)) score += 140
  if (compactName && compactHay.includes(compactName)) score += 120
  if (name && hay.includes(name)) score += 90
  if (team && team.length > 2 && hay.includes(team)) score += agent.kind === 'orchestrator' ? 58 : 34

  const generic = new Set(['agent', 'ai', 'seo', 'team', 'lead', 'specialist', 'orchestrator', 'the', 'and', 'for'])
  for (const word of name.split(/\s+/).filter((w) => w.length > 2 && !generic.has(w))) {
    if (hay.includes(word)) score += 28
  }
  for (const word of role.split(/\s+/).filter((w) => w.length > 4 && !generic.has(w)).slice(0, 6)) {
    if (hay.includes(word)) score += 8
  }
  if (agent.kind === 'orchestrator' && /\b(team|director|orchestrator|lead|coordinate|marketing agent)\b/.test(hay)) score += 18
  if (agent.kind !== 'orchestrator' && /\b(specialist|subagent|sub agent)\b/.test(hay)) score += 8
  return score
}

function bestAgentForText(agents, text) {
  let best = null
  let bestScore = 0
  for (const agent of agents || []) {
    const score = scoreAgentMention(agent, text)
    if (score > bestScore) {
      best = agent
      bestScore = score
    }
  }
  return bestScore >= 34 ? best : null
}

function timelineText(item) {
  return [
    item.key, item.title, item.head, item.sub, item.stream, item.result, item.pre, item.tag, item.status,
    item.op?.label, item.op?.detail, item.op?.sessionKey,
  ].filter(Boolean).join(' ')
}

function agentIdFromSessionKey(key) {
  const parts = String(key || '').split(':')
  return parts[0] === 'agent' && parts[1] && parts[1] !== ORCH_ID ? parts[1] : ''
}

function inferActiveAgentCallsFromTimeline(timeline, agents, running) {
  return inferCallsFromItems(currentRunSlice(timeline, running), agents)
}

function inferCallsFromItems(items, agents) {
  const calls = new Map()
  for (const item of items) {
    if (item.kind === 'sub') {
      const agent = bestAgentForText(agents, timelineText(item))
      if (agent) {
        calls.set(agent.id, {
          agent,
          event: { ...item, key: item.key || 'sub_' + agent.id, badge: item.badge || 'running' },
        })
      }
      continue
    }
    if (item.kind !== 'node') continue
    const sessionAgentId = agentIdFromSessionKey(item.op?.sessionKey || item.sessionKey)
    const sessionAgent = sessionAgentId ? agents.find((a) => a.id === sessionAgentId) : null
    if (sessionAgent) {
      calls.set(sessionAgent.id, {
        agent: sessionAgent,
        event: {
          ...item,
          key: 'op_' + sessionAgent.id,
          title: sessionAgent.name,
          badge: item.op?.status || 'running',
          sub: item.op?.detail || item.sub || 'Agent activity',
        },
      })
      continue
    }
    const text = timelineText(item)
    const looksLikeDelegation = /\b(delegate|delegated|subagent|sub agent|registered agent|agent id|work from|director|orchestrator|specialist)\b/i.test(text)
    const agent = bestAgentForText(agents, text)
    if (!agent || (!looksLikeDelegation && scoreAgentMention(agent, text) < 70)) continue
    calls.set(agent.id, {
      agent,
      event: {
        ...item,
        key: 'op_' + agent.id,
        title: agent.name,
        badge: 'running',
        sub: item.sub?.includes('progressText') ? 'Delegated run in progress' : item.sub || 'Delegated run',
      },
    })
  }
  return Array.from(calls.values())
}

// Flatten orchestrator + roster + team members into a unique agent list.
function buildAllAgents(orchestrator, agents = [], teams = []) {
  const list = [orchestrator, ...agents]
  for (const team of teams || []) {
    if (team?.orchestrator) list.push(team.orchestrator)
    for (const member of team?.members || []) if (member) list.push(member)
  }
  const seen = new Set()
  return list.filter((agent) => {
    if (!agent?.id || seen.has(agent.id)) return false
    seen.add(agent.id)
    return true
  })
}

// --- Delegated-agent name resolution -------------------------------------------
// Broker session keys arrive as `webchat:g-agent-deep-seo-agent-subagent-0`,
// `subagent:<uuid>`, `dashboard:<uuid>`, etc. Match them back to a known agent by
// fuzzy slug containment (tolerates hyphen/underscore/camelCase differences) and
// fall back to a human-friendly label when the key is just a uuid.
function slugify(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function matchAgentByKey(allAgents, ...candidates) {
  const hay = candidates.map(slugify).filter(Boolean)
  if (!hay.length) return null
  for (const a of allAgents || []) {
    if (!a || !a.id) continue
    const idSlug = slugify(a.id)
    const nameSlug = slugify(a.name)
    const sessSlug = slugify(a.sessionKey)
    for (const h of hay) {
      if (idSlug.length > 2 && h.includes(idSlug)) return a
      if (nameSlug.length > 2 && h.includes(nameSlug)) return a
      if (sessSlug.length > 4 && h.includes(sessSlug)) return a
    }
  }
  return null
}

function prettyAgentName(rawKey, rawTitle) {
  const title = String(rawTitle || '').trim()
  if (title && !title.includes(':') && !UUID_RE.test(title) && !/^[0-9a-f]{12,}$/i.test(title.replace(/-/g, ''))) return title
  const s = String(rawKey || rawTitle || '').trim()
  const m = s.match(/^([a-z][a-z0-9]*):(.*)$/i)
  const channel = m ? m[1].toLowerCase() : ''
  let rest = (m ? m[2] : s).trim()
  const hex = rest.replace(/[^0-9a-f]/gi, '')
  const compact = rest.replace(/-/g, '')
  if (UUID_RE.test(rest) || (hex.length >= 12 && compact.length > 0 && hex.length / compact.length > 0.8)) {
    const short = hex.slice(0, 6)
    const base = channel === 'subagent' ? 'Subagent' : 'Agent'
    return short ? `${base} · ${short}` : base
  }
  rest = rest.replace(/^g-agent[-_]/i, '').replace(/^agent[-_]/i, '').replace(/[-_]subagent[-_]?\d*$/i, '')
  const out = rest.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim()
  if (!out) return channel ? channel.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Agent'
  return out.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Resolve a delegated timeline item to a known agent, or a friendly placeholder.
function resolveDelegate(allAgents, item) {
  return (
    matchAgentByKey(allAgents, item.key, item.title) ||
    { id: item.key || item.id, name: prettyAgentName(item.key, item.title), icon: item.icon || 'AI', role: item.sub || 'Delegated task' }
  )
}

// Which agents are actually being called in the current run (delegated subs + agents
// inferred from the run's plan/tool text). Shared by the graph, the chat status, and
// the artifact activity list so all three always agree on "which agent is working".
function callsFromItems(allAgents, items) {
  const lookup = new Map()
  for (const agent of allAgents) {
    if (agent.id) lookup.set(String(agent.id).toLowerCase(), agent)
    if (agent.name) lookup.set(String(agent.name).toLowerCase(), agent)
    if (agent.sessionKey) lookup.set(String(agent.sessionKey).toLowerCase(), agent)
  }
  const byKey = new Map()
  for (const item of items.filter((t) => t.kind === 'sub')) {
    const key = String(item.key || item.title || item.id).toLowerCase()
    const agent = lookup.get(key) || resolveDelegate(allAgents, item)
    byKey.set(key, { event: item, agent })
  }
  for (const call of inferCallsFromItems(items, allAgents)) {
    if (!Array.from(byKey.values()).some((entry) => entry.agent?.id === call.agent.id)) {
      byKey.set('op_' + call.agent.id, call)
    }
  }
  return Array.from(byKey.values())
}

function computeActiveCalls(allAgents, timeline, running) {
  return callsFromItems(allAgents, currentRunSlice(timeline, running))
}

// Build the activity steps (agent calls + tool/skill/plugin nodes) for a run's items.
function stepsFromItems(allAgents, items, excludeId) {
  const agentSteps = activeCallsToSteps(callsFromItems(allAgents, items), excludeId)
  const toolSteps = items.filter((t) => t.kind === 'node').map(classifyStep).filter(isUsefulActivityStep)
  return [...agentSteps, ...toolSteps]
}

// Split the global timeline into per-query runs (one per run.start divider). Each run
// keeps its items, status, query, agent, and the session it ran in. When a sessionKey is
// given, only that chat session's runs are returned (so a "New chat" starts a clean slate).
function groupRuns(timeline, sessionKey) {
  const isEnd = (t) => /^run (complete|failed|stopped)$/i.test(String(t || '').trim())
  const starts = []
  timeline.forEach((it, i) => { if (it.kind === 'divider' && !isEnd(it.text)) starts.push(i) })
  const runs = starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : timeline.length
    const head = timeline[start]
    const slice = timeline.slice(start + 1, end)
    let closeKind = null
    for (const it of slice) {
      if (it.kind !== 'divider') continue
      const t = String(it.text || '').trim()
      if (/failed/i.test(t)) closeKind = 'error'
      else if (/stopped/i.test(t)) closeKind = 'stopped'
      else if (/complete/i.test(t)) closeKind = 'done'
    }
    return { id: head.runId || head.id, query: (head.query || head.text || '').trim(), agent: head.agent, sessionKey: head.sessionKey, startTs: head.ts || 0, items: slice.filter((it) => it.kind !== 'divider'), closeKind }
  })
  runs.forEach((r) => {
    // A run is "running" while a delegated sub is ACTIVELY running (not merely queued), OR
    // it has no close divider yet (run.end hasn't fired). A closed run uses its close status.
    const hasRunning = r.items.some((it) => it.kind === 'sub' && it.badge === 'running')
    r.status = hasRunning ? 'running' : (r.closeKind || 'running')
  })
  // Order by start time so server-merged history interleaves correctly with live runs.
  runs.sort((x, y) => (x.startTs || 0) - (y.startTs || 0))
  return sessionKey ? runs.filter((r) => r.sessionKey === sessionKey) : runs
}

// Turn detected agent calls into clickable activity steps (excludes the source agent).
function activeCallsToSteps(calls, excludeId) {
  return calls
    .filter(({ agent }) => agent.id !== excludeId)
    .map(({ agent, event }) => ({
      id: 'agent_' + agent.id,
      kind: 'agent',
      label: agent.name || event.title || 'Agent',
      status: event.badge === 'error' ? 'error' : event.badge === 'done' ? 'done' : event.badge === 'queued' ? 'queued' : event.badge === 'stopped' ? 'stopped' : 'running',
      stream: event.stream || '',
      result: event.result || '',
      detail: event.sub || '',
    }))
}

// Status palette for runs / agent calls — adapts to light & dark via CSS vars:
// queued = yellow, running = blue, done = green, error = red, stopped = muted.
const RUN_COLOR = { queued: 'var(--warning)', running: 'var(--info)', done: 'var(--success)', error: 'var(--danger)', stopped: 'var(--text-quiet)' }
const RUN_SOFT = { queued: 'var(--warning-soft)', running: 'var(--info-soft)', done: 'var(--success-soft)', error: 'var(--danger-soft)', stopped: 'var(--surface-muted)' }
const runColor = (s) => RUN_COLOR[s] || RUN_COLOR.running
const runSoft = (s) => RUN_SOFT[s] || RUN_SOFT.running
const callStatus = (ev) => (ev?.badge === 'done' ? 'done' : ev?.badge === 'error' ? 'error' : ev?.badge === 'queued' ? 'queued' : ev?.badge === 'stopped' ? 'stopped' : 'running')

function StatusBadge({ status }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: runColor(status), backgroundColor: runSoft(status) }}
    >
      {status || 'queued'}
    </span>
  )
}

function StatusPip({ status, pulse, className }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 rounded-full', pulse && status === 'running' && 'animate-pulse-ring', className)}
      style={{ backgroundColor: runColor(status) }}
    />
  )
}

// On-demand "artifact" drawer: a per-query accordion. Each query is a collapsible row;
// expanding it reveals that query's coordination map + agent activity (output as markdown),
// and collapsing hides all of it under the query. Runs persist so any query is revisitable.
function RunArtifact({ open, onClose, orchestrator, agents, teams, active, sessionKey, timeline, conn, onSelectNode }) {
  const allAgents = useMemo(() => buildAllAgents(orchestrator, agents, teams), [orchestrator, agents, teams])
  const runs = useMemo(() => groupRuns(timeline, sessionKey), [timeline, sessionKey])
  const activeRunId = (runs.find((r) => r.status === 'running') || runs[runs.length - 1])?.id || null
  const anyLive = runs.some((r) => r.status === 'running')
  const source = active || orchestrator
  const [expanded, setExpanded] = useState(() => new Set())
  // Auto-expand the newest/active query when it changes (others stay as the user left them).
  useEffect(() => {
    if (activeRunId) setExpanded((s) => (s.has(activeRunId) ? s : new Set(s).add(activeRunId)))
  }, [activeRunId])
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ordered = runs.map((r, i) => ({ r, n: i + 1 })).reverse() // newest first

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-20 bg-[#04140f]/30 backdrop-blur-[1px] lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '102%' }} animate={{ x: 0 }} exit={{ x: '102%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36 }}
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cn('grid h-7 w-7 place-items-center rounded-lg', anyLive ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]')}>
                  {anyLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                </span>
                <div>
                  <div className="font-heading text-sm font-semibold text-strong">Run artifact</div>
                  <div className="text-[11px] text-muted">{anyLive ? `${source?.name || 'Main'} is working` : runs.length ? `${runs.length} quer${runs.length === 1 ? 'y' : 'ies'} this chat` : 'No runs yet'}</div>
                </div>
              </div>
              <button onClick={onClose} title="Close" aria-label="Close artifact" className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-strong">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {ordered.length === 0 ? (
                <div className="m-4 rounded-xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-3 py-8 text-center text-xs text-muted">
                  No runs yet. Send a message to start one.
                </div>
              ) : (
                ordered.map(({ r, n }) => (
                  <RunSection
                    key={r.id} run={r} n={n} allAgents={allAgents} active={active} source={source}
                    conn={conn} onSelectNode={onSelectNode} expanded={expanded.has(r.id)} onToggle={() => toggle(r.id)}
                  />
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

// One query's collapsible section: header row (number + query + status) → its map + activity.
function RunSection({ run, n, allAgents, active, source, conn, onSelectNode, expanded, onToggle }) {
  const live = run.status === 'running'
  const steps = useMemo(() => stepsFromItems(allAgents, run.items, active?.id), [allAgents, run.items, active?.id])
  return (
    <div className="border-b border-[color:var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        className={cn('flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-[color:var(--surface-muted)]', expanded && 'bg-[color:var(--surface-muted)]')}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[color:var(--surface-muted)] text-[10px] font-bold text-muted">{n}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-strong">{run.query || `Run ${n}`}</span>
        <StatusBadge status={run.status} />
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-quiet transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <RunGraph source={source} allAgents={allAgents} active={active} items={run.items} live={live} conn={conn} onSelect={onSelectNode} />
          <div className="space-y-1.5 px-4 py-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-quiet">Activity · tap a step for its output</div>
            {steps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-3 py-5 text-center text-xs text-muted">
                {live ? 'Waiting for the agent to plan, call tools, or delegate…' : 'No activity captured for this run.'}
              </div>
            ) : (
              steps.map((s) => <ExecStep key={s.id} step={s} />)
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Centered detail card for a clicked Coordination-Map node. Re-derives the node's
// live data from the timeline each render, so status + output update as the run goes.
function RunNodeDetail({ node, timeline, agentsById, onClose }) {
  const live = useMemo(() => {
    if (!node) return null
    const key = node.event?.key
    const id = node.event?.id
    const found = (timeline || []).find((t) => t.kind === 'sub' && ((key && t.key === key) || (id && t.id === id)))
    return found || node.event || {}
  }, [node, timeline])

  const agent = node?.agent || {}
  const ev = live || {}
  const badge = ev.badge || 'running'
  const status = badge === 'error' ? 'error' : badge === 'done' ? 'done' : badge === 'queued' ? 'queued' : 'running'
  const output = ev.stream || ev.result || ''
  const task = ev.sub || agent.role || 'Delegated task'
  const sessionKey = ev.key || node?.event?.key || ''
  const parentName = ev.parent && agentsById?.[ev.parent]?.name

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-[#04140f]/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="relative z-10 flex max-h-[82%] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] px-4 py-3">
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-white [background-image:var(--grad-brand)]', status === 'running' && 'animate-pulse-ring')}>
                {cleanIcon(agent.icon, initials(agent.name))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-sm font-semibold text-strong">{agent.name || 'Agent'}</div>
                <div className="truncate text-[11px] text-muted">{task}</div>
              </div>
              <SubBadge badge={status} />
              <button onClick={onClose} title="Close" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-muted)] hover:text-strong">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-muted">
                  {status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-[color:var(--accent)]" /> : <StatusDot status={status} />}
                  {status === 'running' ? 'Working' : status === 'queued' ? 'Queued' : status === 'done' ? 'Completed' : 'Error'}
                </span>
                {parentName && <span className="rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-muted">via {parentName}</span>}
                {agent.id && <span className="max-w-full truncate rounded-md bg-[color:var(--surface-muted)] px-2 py-1 font-mono text-quiet">{agent.id}</span>}
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-quiet">Live output</div>
                {output ? (
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 text-[12px] leading-relaxed text-strong scrollbar-thin">
                    <Markdown content={output} />
                    {status === 'running' && <span className="stream-caret align-middle" />}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-3 py-6 text-center text-xs text-muted">
                    {status === 'queued' ? 'Queued — waiting to start…' : status === 'running' ? 'Working… output will stream here as it arrives.' : 'No output was captured for this step.'}
                  </div>
                )}
              </div>

              {sessionKey && sessionKey !== agent.id && (
                <div className="truncate text-[10px] text-quiet">session: <span className="font-mono">{sessionKey}</span></div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function RunGraph({ source, allAgents = [], active, items = [], live, conn, onSelect }) {
  const activeCalls = useMemo(() => callsFromItems(allAgents, items), [allAgents, items])

  const directAgentRunning = live && active?.id && active.id !== ORCH_ID && activeCalls.length === 0
  const nodes = activeCalls
  const isTerminal = (nd) => nd.event?.badge === 'done' || nd.event?.badge === 'error'
  const runningCount = nodes.filter((nd) => !isTerminal(nd)).length
  const liveCount = directAgentRunning ? 1 : runningCount
  // Source = the agent the run belongs to (the chat agent), so the flow starts there
  // and branches to its subagents.
  const sourceAgent = source || { name: 'Main', icon: 'CG' }

  return (
    <div className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-heading text-sm font-semibold text-strong">Coordination Map</div>
          <div className="text-xs text-muted">
            {live
              ? liveCount
                ? `${liveCount} live agent call${liveCount === 1 ? '' : 's'}`
                : nodes.length
                  ? `${nodes.length} agent call${nodes.length === 1 ? '' : 's'} · finishing up`
                  : `${sourceAgent.name || 'Main'} is working — waiting for delegated agent calls`
              : nodes.length
                ? `${nodes.length} agent call${nodes.length === 1 ? '' : 's'}`
                : 'No agent calls in this run'}
          </div>
        </div>
        <Badge variant={conn === 'live' || conn === 'demo' ? 'success' : 'outline'}>{conn}</Badge>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 shadow-sm">
        {/* faint grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />
        <div className="relative">
          {nodes.length > 0 ? (
            <NodeGraph source={sourceAgent} nodes={nodes} active={active} running={live} onSelect={onSelect} />
          ) : (
            <>
              <GraphNode
                agent={sourceAgent}
                label={directAgentRunning ? 'Direct agent run' : live ? 'Working — waiting for delegated calls' : 'Ready'}
                status={live ? 'running' : 'idle'}
                primary
              />
              {!directAgentRunning && (
                <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-muted)] px-3 py-5 text-center">
                  <div className="text-xs font-semibold text-strong">{live ? 'No delegated agent yet' : 'No agents called'}</div>
                  <div className="mt-1 text-xs text-muted">
                    {live ? 'When the current run calls a team agent, it appears here with a live connection.' : 'This run did not call any team agents.'}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GraphNode({ agent, label, status, primary, active }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-2xl border px-3 py-3',
      primary || active ? 'border-[color:var(--border-accent)] bg-[color:var(--accent-soft)]' : 'border-[color:var(--border)] bg-[color:var(--surface)]',
    )}>
      <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-white [background-image:var(--grad-brand)]', status === 'running' && 'animate-pulse-ring')}>
        {cleanIcon(agent?.icon, initials(agent?.name))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-strong">{agent?.name || 'Agent'}</div>
        <div className="truncate text-[11px] text-muted">{label}</div>
      </div>
      <StatusDot status={status} pulse={status === 'running'} />
    </div>
  )
}

// Coordination graph: a source node on top, a connector, then ALL delegated agents in a
// wrapping grid below. Each box is colour-coded by status (queued=yellow, running=blue,
// done=green, error=red). Tap any node to open its detail card.
function NodeGraph({ source, nodes, active, running, onSelect }) {
  return (
    <div className="flex flex-col items-center">
      <SourceChip
        agent={source}
        running={running}
        onClick={() => onSelect?.({ agent: source, event: { sub: running ? 'Coordinating the run' : 'Ready', badge: running ? 'running' : 'done' } })}
      />
      {nodes.length > 0 && <div className="my-1.5 h-4 w-px bg-[color:var(--border-strong)]" />}
      <div className="flex w-full flex-wrap items-start justify-center gap-2">
        {nodes.map((node) => (
          <AgentNode
            key={node.event?.key || node.event?.id || node.agent.id}
            agent={node.agent}
            status={callStatus(node.event)}
            active={active?.id === node.agent.id}
            task={node.event?.sub || node.event?.stream || node.event?.result}
            onClick={() => onSelect?.(node)}
          />
        ))}
      </div>
    </div>
  )
}

function SourceChip({ agent, running, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="View coordinator status"
      className="flex items-center gap-2 rounded-2xl border border-[color:var(--border-accent)] bg-[color:var(--accent-soft)] px-3 py-2 text-left shadow-sm transition hover:shadow-md"
    >
      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-bold text-white [background-image:var(--grad-brand)]', running && 'animate-pulse-ring')}>
        {cleanIcon(agent?.icon, initials(agent?.name) || 'CG')}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-strong">{agent?.name || 'Main'}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent-strong)]">{running ? 'Coordinating' : 'Ready'}</div>
      </div>
    </button>
  )
}

function AgentNode({ agent, status, active, task, onClick }) {
  const color = runColor(status)
  return (
    <button
      type="button"
      onClick={onClick}
      title={task || agent.role || 'Agent — tap for output'}
      className={cn(
        'flex w-[80px] flex-col items-center gap-1 rounded-xl border-2 px-1.5 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        active && 'ring-2 ring-offset-1 ring-offset-[color:var(--surface)] ring-[color:var(--accent)]',
      )}
      style={{ borderColor: color, backgroundColor: runSoft(status) }}
    >
      <div className={cn('grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold text-white [background-image:var(--grad-brand)]', status === 'running' && 'animate-pulse-ring')}>
        {cleanIcon(agent.icon, initials(agent.name))}
      </div>
      <div className="w-full truncate text-[10px] font-semibold text-strong">{agent.name}</div>
      <StatusPip status={status} pulse />
    </button>
  )
}

function ActivityNodeItem({ step }) {
  const meta = STEP_META[step.kind] || STEP_META.operation
  const Icon = meta.Icon
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'rounded-xl border px-3 py-2.5 shadow-sm',
        step.status === 'error'
          ? 'border-rose-200 bg-rose-50'
          : step.kind === 'skill'
            ? 'border-[color:var(--border-accent)] bg-[color:var(--accent-soft)]'
            : step.kind === 'plugin'
              ? 'border-amber-200 bg-amber-50'
              : 'border-[color:var(--border)] bg-[color:var(--surface)]',
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/80', meta.tint)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-xs font-semibold text-strong">{step.label}</div>
            <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">{meta.word}</span>
          </div>
          {step.detail && <div className="mt-1 line-clamp-3 break-words text-[11px] leading-5 text-muted">{step.detail}</div>}
        </div>
        <StatusDot status={step.status} pulse={step.status === 'running'} />
      </div>
    </motion.div>
  )
}

function TimelineItem({ t, agentsById }) {
  if (t.kind === 'divider') {
    if (/^run started$/i.test(String(t.text || '').trim())) return null
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
  const step = nodeStep(t)
  if (step === null) return null
  if (step && !isUsefulActivityStep(step)) return null
  if (step) return <ActivityNodeItem step={step} />
  if (isNoisyLegacyNode(t)) return null
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
