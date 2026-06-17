import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Pencil, Trash2, Eraser, Send, Terminal, Sparkles, MessageSquarePlus, ChevronDown, History } from 'lucide-react'
import { ORCH_ID, newAgentTemplate } from '../agents.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { cleanChatText } from '../lib/chatText.js'
import { dedupeMessages } from '../store/reducer.js'
import { useMission } from '../store/mission.jsx'
import { AgentModal } from '../components/agents/AgentModal.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'
import { Markdown } from '../components/atoms/Markdown.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'

export default function MissionPage() {
  const m = useMission()
  const {
    settings, agents, agentsById, orchestrator, roster, managed, teams,
    activeId, setActiveId, state, anyRunning, agentsLoading, agentsError, agentStatus,
    sendText, clearThread, saveAgent, deleteAgent, agentSaving, getThread, newChat,
    savedChats, resumeChat, deleteConversation,
  } = m

  const selectedId = agentsById[activeId] ? activeId : ORCH_ID
  const active = agentsById[selectedId] || orchestrator
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

  const [composer, setComposer] = useState('')
  const [agentModal, setAgentModal] = useState(null)
  const [rawOpen, setRawOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const isMain = active?.id === ORCH_ID
  const toggleTeam = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))
  const chatRef = useRef(null)
  const tlRef = useRef(null)
  const rawRef = useRef(null)
  const taRef = useRef(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [thread.messages, selectedId])
  useEffect(() => { if (tlRef.current) tlRef.current.scrollTop = tlRef.current.scrollHeight }, [state.timeline])
  useEffect(() => { if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight }, [state.raw])
  useEffect(() => {
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }
  }, [composer, selectedId])

  const send = () => {
    const t = composer.trim()
    if (!t) return
    setComposer('')
    sendText(t, selectedId)
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  const insertMention = (id) => { setComposer((c) => (c ? c.replace(/\s*$/, ' ') : '') + '@' + id + ' '); taRef.current?.focus() }

  const onSave = async (agent, mode) => {
    try { await saveAgent(agent, mode); setAgentModal(null) } catch { /* status shown in store */ }
  }

  return (
    <div className="grid h-[calc(100vh-61px)] grid-cols-1 lg:grid-cols-[280px_1fr_360px]">
      {/* ---- Roster ---- */}
      <aside className="hidden flex-col border-r border-slate-200 bg-white lg:flex">
        {/* fixed top */}
        <div className="space-y-3 p-4 pb-2">
          <Button className="w-full" onClick={() => setAgentModal({ mode: 'new', agent: newAgentTemplate() })}>
            <Plus className="h-4 w-4" /> New agent
          </Button>
          <div className="grid grid-cols-2 gap-3">
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3 scrollbar-thin">
        <div>
          <SectionLabel>Central</SectionLabel>
          <button
            onClick={() => setActiveId(ORCH_ID)}
            className={cn(
              'mt-1.5 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition',
              selectedId === ORCH_ID
                ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] shadow-[0_14px_34px_rgba(64,163,148,0.18)]'
                : 'border-[color:var(--border)] bg-white hover:border-[color:var(--accent)] hover:bg-[#f8f2e7]',
            )}
          >
            <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-[11px] font-bold text-white', mainThread.running && 'animate-pulse-ring')}>
              {cleanIcon(orchestrator?.icon, 'CG')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-strong">Main</span>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">Global</span>
              </div>
              <div className="truncate text-[11px] text-muted">Chat with the central controller</div>
            </div>
            <StatusDot status={mainThread.running ? 'running' : mainThread.messages.length ? 'ready' : 'idle'} pulse={mainThread.running} />
          </button>
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
          <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[#fffaf0]/70 px-3 py-4 text-center text-xs text-muted">
            No teams yet. Create a team lead to start building the tree.
          </div>
        )}
        {teams.map((team) => {
          const o = team.orchestrator
          const oT = getThread(o.id)
          const oDot = oT.running ? 'running' : oT.messages.length ? 'ready' : o.status || 'idle'
          const isCollapsed = collapsed[team.id]
          return (
            <div key={team.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* team header */}
              <button
                onClick={() => toggleTeam(team.id)}
                className="flex w-full items-center gap-2 bg-gradient-to-r from-slate-50 to-white px-3 py-2 text-left"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{team.name} team</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 py-px text-[10px] font-semibold text-slate-500">{team.members.length}</span>
                <ChevronDown className={cn('ml-auto h-4 w-4 text-slate-400 transition-transform', isCollapsed && '-rotate-90')} />
              </button>

              {/* team lead */}
              <div className={cn('group flex items-center gap-2.5 border-t border-slate-100 px-2.5 py-2.5 transition',
                selectedId === o.id ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-slate-50')}>
                <button onClick={() => setActiveId(o.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-[11px] font-bold text-white', oT.running && 'animate-pulse-ring')}>
                    {cleanIcon(o.icon, initials(o.name))}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-strong">{o.name}</span>
                      <span className="shrink-0 rounded bg-[color:var(--accent-soft)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[color:var(--accent-strong)]">Team lead</span>
                    </div>
                    <div className="truncate text-[11px] text-muted">{o.role || 'team lead'}</div>
                  </div>
                </button>
                <StatusDot status={oDot} pulse={oT.running} />
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <IconBtn onClick={(e) => { e.stopPropagation(); setAgentModal({ mode: 'edit', agent: o }) }}><Pencil className="h-3 w-3" /></IconBtn>
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
                    const dot = t.running ? 'running' : t.messages.length ? 'ready' : m.status || 'idle'
                    return (
                      <div key={m.id} className="relative">
                        <span className="absolute -left-[6px] top-1/2 h-px w-2.5 bg-slate-200" />
                        <div className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 transition',
                          selectedId === m.id ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-slate-50')}>
                          <button onClick={() => setActiveId(m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[9px] font-bold text-white">
                              {cleanIcon(m.icon, initials(m.name))}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium text-strong">{m.name}</div>
                              <div className="truncate text-[11px] text-muted">{m.role || 'specialist'}</div>
                            </div>
                          </button>
                          <StatusDot status={dot} pulse={t.running} />
                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <IconBtn onClick={(e) => { e.stopPropagation(); setAgentModal({ mode: 'edit', agent: m }) }}><Pencil className="h-3 w-3" /></IconBtn>
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
      <section className="flex min-h-0 min-w-0 flex-col bg-slate-50">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-xs font-bold text-white">
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
          <Button variant="secondary" size="sm" onClick={() => newChat(selectedId)} title="Start a new chat (fresh session)"><MessageSquarePlus className="h-4 w-4" /> New chat</Button>
          <Button variant="ghost" size="sm" onClick={() => clearThread(selectedId)} title="Clear thread"><Eraser className="h-4 w-4" /></Button>
          {!isMain && <Button variant="ghost" size="sm" onClick={() => setAgentModal({ mode: 'edit', agent: active })} title="Edit"><Pencil className="h-4 w-4" /></Button>}
          {!isMain && (
            <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => deleteAgent(active.id)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
          )}
        </header>

        <div ref={chatRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-6 scrollbar-thin">
          {thread.messages.length === 0 ? (
            <EmptyState active={active} onPick={sendText} />
          ) : (
            dedupeMessages(thread.messages).map((msg) => <ChatBubble key={msg.id} m={msg} active={active} />)
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-3">
          {isMain && roster.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delegate</span>
              {roster.map((a) => (
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
              placeholder={isMain ? 'Ask Main to coordinate your teams and agents' : 'Message ' + (active?.name || 'agent')}
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-strong placeholder:text-slate-400 focus:outline-none"
            />
            <Button onClick={send} disabled={thread.running} className="shrink-0">
              <Send className="h-4 w-4" /> Run
            </Button>
          </div>
          {settings.demo && <div className="mt-2 text-[11px] text-slate-400">Demo mode</div>}
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

        <RunGraph orchestrator={orchestrator} teams={teams} active={active} activeRunning={thread.running} timeline={state.timeline} running={anyRunning} conn={state.conn} />

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
  const text = cleanChatText(m.text, m.role)
  const empty = !text || !text.trim()
  if (isUser && empty) return null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white',
        isUser ? 'bg-slate-400' : 'bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)]')}>
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

function Thinking() {
  return (
    <span className="inline-flex items-center gap-2 py-0.5 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[color:var(--accent)]" />
      <span className="text-sm">Thinking...</span>
    </span>
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
        className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-lg font-bold text-white shadow-lg"
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

function RunGraph({ orchestrator, teams = [], active, activeRunning, timeline, running, conn }) {
  const allAgents = useMemo(() => {
    const list = [orchestrator]
    for (const team of teams || []) {
      if (team?.orchestrator) list.push(team.orchestrator)
      for (const member of team?.members || []) if (member) list.push(member)
    }
    return list.filter(Boolean)
  }, [orchestrator, teams])

  const agentLookup = useMemo(() => {
    const m = new Map()
    for (const agent of allAgents) {
      if (agent.id) m.set(String(agent.id).toLowerCase(), agent)
      if (agent.name) m.set(String(agent.name).toLowerCase(), agent)
      if (agent.sessionKey) m.set(String(agent.sessionKey).toLowerCase(), agent)
    }
    return m
  }, [allAgents])

  const currentSlice = useMemo(() => {
    if (!running) return []
    const lastStart = timeline.reduce((idx, item, i) => (
      item.kind === 'divider' && !/^run (complete|failed)$/i.test(String(item.text || '').trim()) ? i : idx
    ), -1)
    if (lastStart < 0) return timeline
    return timeline.slice(lastStart + 1)
  }, [timeline, running])

  const delegated = currentSlice.filter((t) => t.kind === 'sub')
  const activeCalls = useMemo(() => {
    const byKey = new Map()
    for (const item of delegated) {
      const key = String(item.key || item.title || item.id).toLowerCase()
      const candidates = [item.key, item.title].map((v) => String(v || '').toLowerCase()).filter(Boolean)
      const agent =
        candidates.map((c) => agentLookup.get(c)).find(Boolean) ||
        allAgents.find((a) => {
          const id = String(a.id || '').toLowerCase()
          const name = String(a.name || '').toLowerCase()
          const session = String(a.sessionKey || '').toLowerCase()
          return candidates.some((c) => (id && c.includes(id)) || (name && c.includes(name)) || (session && c.includes(session)))
        }) ||
        { id: item.key || item.id, name: item.title || item.key || 'Agent', icon: item.icon || 'AI', role: item.sub || 'Delegated task' }
      byKey.set(key, { event: item, agent })
    }
    return Array.from(byKey.values())
  }, [delegated, agentLookup, allAgents])

  const directAgentRunning = activeRunning && active?.id && active.id !== ORCH_ID && activeCalls.length === 0
  const nodes = activeCalls
  const liveCount = directAgentRunning ? 1 : nodes.length
  const sourceAgent = directAgentRunning ? active : (orchestrator || { name: 'Main', icon: 'CG' })

  return (
    <div className="border-b border-[color:var(--border)] bg-[#fffaf0] px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-strong">Coordination Map</div>
          <div className="text-xs text-muted">
            {running
              ? liveCount
                ? `${liveCount} live agent call${liveCount === 1 ? '' : 's'}`
                : 'Main is working - waiting for delegated agent calls'
              : 'No active agent calls'}
          </div>
        </div>
        <Badge variant={conn === 'live' || conn === 'demo' ? 'success' : 'outline'}>{conn}</Badge>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-white/75 p-3 shadow-sm">
        <GraphNode
          agent={sourceAgent}
          label={directAgentRunning ? 'Direct agent run' : running ? 'Current run source' : 'Ready'}
          status={running ? 'running' : 'idle'}
          primary
        />

        {nodes.length > 0 ? (
          <>
            <div className="mx-auto h-5 w-px bg-[color:var(--border)]" />
            <div className="relative mb-3">
              <div className="absolute left-6 right-6 top-0 h-px bg-[color:var(--border)]" />
              <div className="mx-auto h-4 w-px bg-[color:var(--border)]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {nodes.map(({ agent, event }) => (
                <MiniGraphNode
                  key={event.key || event.id || agent.id}
                  agent={agent}
                  status={event.badge === 'error' ? 'error' : event.badge === 'done' ? 'done' : 'running'}
                  active={active?.id === agent.id}
                  task={event.sub || event.stream || event.result || (directAgentRunning ? 'Direct run' : 'Delegated task')}
                />
              ))}
            </div>
          </>
        ) : directAgentRunning ? null : (
          <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)] bg-[#fbf7ee] px-3 py-5 text-center">
            <div className="text-xs font-semibold text-strong">{running ? 'No delegated agent yet' : 'Map is idle'}</div>
            <div className="mt-1 text-xs text-muted">
              {running ? 'When the current run calls a team agent, it will appear here with a live connection.' : 'Start a run to see only the agents that are actually called.'}
            </div>
          </div>
        )}
      </div>

      {running && delegated.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {delegated.slice(-4).reverse().map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white/70 px-2.5 py-2">
              <StatusDot status={item.badge === 'error' ? 'error' : item.badge === 'done' ? 'done' : 'running'} pulse={item.badge !== 'done' && item.badge !== 'error'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-strong">{item.title}</div>
                <div className="truncate text-[11px] text-muted">{item.sub || item.result || 'Delegated task'}</div>
              </div>
              <SubBadge badge={item.badge} />
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

function GraphNode({ agent, label, status, primary, active }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-2xl border px-3 py-3',
      primary || active ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-[color:var(--border)] bg-white',
    )}>
      <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-[11px] font-bold text-white', status === 'running' && 'animate-pulse-ring')}>
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

function MiniGraphNode({ agent, status, active, task }) {
  return (
    <div className={cn(
      'min-w-0 rounded-xl border px-2.5 py-2',
      active ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]' : 'border-[color:var(--border)] bg-white',
      status === 'running' && 'shadow-[0_12px_24px_rgba(64,163,148,0.14)]',
      status === 'error' && 'border-rose-200 bg-rose-50',
      status === 'done' && 'border-emerald-200 bg-emerald-50',
    )}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white text-[9px] font-bold text-slate-600">{cleanIcon(agent.icon, initials(agent.name))}</span>
        <StatusDot status={status} pulse={status === 'running'} />
      </div>
      <div className="truncate text-xs font-semibold text-strong">{agent.name}</div>
      <div className="truncate text-[10px] text-muted">{task || agent.role || 'Agent call'}</div>
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
