import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, History, MessageSquareText, Search, Trash2, ChevronDown, Users, X } from 'lucide-react'
import { ORCH_ID } from '../agents.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { Api } from '../lib/api.js'
import { useMission } from '../store/mission.jsx'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import { Markdown } from '../components/atoms/Markdown.jsx'

// A delegated subagent session is not a standalone conversation — it belongs under the
// query that spawned it, so we keep it out of the top-level list and nest it instead.
function isSubagentSession(s) {
  if (!s) return false
  if (s.spawnedBy || s.parentSessionKey || s.parentKey || s.isSubagent) return true
  if (typeof s.spawnDepth === 'number' && s.spawnDepth > 0) return true
  const t = String(s.title || '').trim()
  const lm = String(s.lastMessage || '')
  const key = String(s.sessionKey || '')
  if (/^\[subagent context\]/i.test(t) || /running as a subagent/i.test(t + ' ' + lm) || /\(depth\s*\d+\s*\//i.test(t)) return true
  if (/(^|:)subagent[:-]/i.test(key)) return true
  return false
}

const SUB_COLOR = { queued: 'var(--warning)', running: 'var(--info)', done: 'var(--success)', error: 'var(--danger)', stopped: 'var(--text-quiet)' }
const subColor = (s) => SUB_COLOR[s] || SUB_COLOR.done

export default function ConversationsPage() {
  const {
    agents, agentsById, teams, activeId, setActiveId, state, savedChats, resumeChat, deleteConversation,
    openBackendSession, deleteBackendSession, currentSessionKey, getThread,
  } = useMission()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [dateValue, setDateValue] = useState('') // '' = all dates, else 'YYYY-MM-DD' (calendar)
  const [agentFilter, setAgentFilter] = useState('all') // 'all' | agentId
  const [backendSessions, setBackendSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')

  useEffect(() => {
    let alive = true
    async function loadSessions() {
      setSessionsLoading(true)
      setSessionsError('')
      try {
        const sessions = await Api.chatSessions()
        if (alive) setBackendSessions(Array.isArray(sessions) ? sessions : [])
      } catch (err) {
        if (alive) setSessionsError(err.message || 'Could not load conversations')
      } finally {
        if (alive) setSessionsLoading(false)
      }
    }
    loadSessions()
    window.addEventListener('focus', loadSessions)
    return () => {
      alive = false
      window.removeEventListener('focus', loadSessions)
    }
  }, [])

  const teamMeta = useMemo(() => {
    const map = new Map([[ORCH_ID, { label: 'Central', team: 'Central', role: 'Main' }]])
    for (const team of teams || []) {
      const name = team.name || team.team || 'Team'
      if (team.orchestrator?.id) map.set(team.orchestrator.id, { label: name + ' / Lead', team: name, role: 'Lead' })
      for (const member of team.members || []) {
        if (member?.id) map.set(member.id, { label: name + ' / Specialist', team: name, role: 'Specialist' })
      }
    }
    return map
  }, [teams])

  const conversations = useMemo(() => {
    const active = agents
      .map((agent) => ({ agent, thread: getThread(agent.id) }))
      .filter((entry) => entry.thread.messages.length > 0)
      .map((entry) => {
        const last = entry.thread.messages[entry.thread.messages.length - 1]
        const meta = teamMeta.get(entry.agent.id) || {}
        return {
          kind: 'active',
          cid: 'active_' + entry.agent.id,
          sessionKey: currentSessionKey(entry.agent.id),
          agentId: entry.agent.id,
          name: entry.agent.name,
          icon: entry.agent.icon,
          teamLabel: meta.label || 'Direct agent',
          text: last?.text || '',
          ts: last?.ts || 0,
        }
      })

    const saved = (savedChats || [])
      .map((chat) => ({ ...chat, agentId: chat.agentId === 'orchestrator' ? ORCH_ID : chat.agentId }))
      .map((chat) => {
        const agent = agentsById[chat.agentId]
        const meta = teamMeta.get(chat.agentId) || {}
        return {
          kind: 'saved',
          cid: chat.cid,
          sessionKey: chat.sessionKey,
          agentId: chat.agentId,
          name: agent?.name || (chat.agentId === ORCH_ID ? 'Main' : chat.name || chat.agentId),
          icon: agent?.icon || chat.icon,
          teamLabel: meta.label || 'Saved conversation',
          text: chat.messages?.[chat.messages.length - 1]?.text || '',
          ts: chat.ts || 0,
          saved: chat,
        }
      })

    const backend = (backendSessions || []).map((session, index) => {
      const sessionKey = String(session?.sessionKey || '')
      const agentId = normalizeSessionAgent(sessionKey, session?.agentId)
      const agent = agentsById[agentId]
      const meta = teamMeta.get(agentId) || {}
      const title = String(session?.title || '').trim()
      const lastMessage = String(session?.lastMessage || '').trim()
      return {
        kind: 'backend',
        cid: 'backend_' + (sessionKey || index),
        sessionKey,
        agentId,
        name: agent?.name || (agentId === ORCH_ID ? 'Main' : session?.agentName || agentId),
        icon: agent?.icon || (agentId === ORCH_ID ? 'CG' : null),
        teamLabel: meta.label || (agentId === ORCH_ID ? 'Central' : 'Saved session'),
        title,
        text: lastMessage || title || '',
        ts: toMs(session?.updatedAt),
        count: typeof session?.messageCount === 'number' ? session.messageCount : null,
        server: session,
      }
    }).filter((entry) => entry.sessionKey && !isSubagentSession(entry.server))

    const merged = new Map()
    for (const entry of backend) merged.set(entry.sessionKey, entry)
    for (const entry of [...active, ...saved]) {
      const key = entry.sessionKey || entry.cid
      if (key && merged.has(key)) continue
      merged.set(key || entry.cid, entry)
    }
    return Array.from(merged.values()).sort((a, b) => b.ts - a.ts)
  }, [agents, agentsById, backendSessions, savedChats, teamMeta, state.threads, getThread, currentSessionKey])

  // Agents that actually appear in the conversation list (for the agent filter).
  const agentOptions = useMemo(() => {
    const seen = new Map()
    for (const c of conversations) if (c.agentId && !seen.has(c.agentId)) seen.set(c.agentId, c.name || c.agentId)
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [conversations])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // A chosen calendar day → that day's local [start, end) window.
    let dayStart = 0, dayEnd = 0
    if (dateValue) {
      const [y, m, d] = dateValue.split('-').map(Number)
      if (y && m && d) { dayStart = new Date(y, m - 1, d).getTime(); dayEnd = dayStart + 86400000 }
    }
    return conversations.filter((c) => {
      if (dayStart && !((c.ts || 0) >= dayStart && (c.ts || 0) < dayEnd)) return false
      if (agentFilter !== 'all' && c.agentId !== agentFilter) return false
      if (q && ![c.name, c.title, c.teamLabel, c.text, c.sessionKey].some((part) => String(part || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [conversations, query, dateValue, agentFilter])

  const hasFilters = query.trim() !== '' || dateValue !== '' || agentFilter !== 'all'

  const openConversation = async (entry) => {
    if (entry.kind === 'backend') {
      const ok = await openBackendSession(entry.server)
      if (!ok) return
    } else if (entry.kind === 'saved') resumeChat(entry.saved)
    else setActiveId(entry.agentId)
    navigate('/mission')
  }

  const removeConversation = async (entry) => {
    if (entry.kind === 'backend') {
      const ok = await deleteBackendSession(entry.sessionKey)
      if (ok) setBackendSessions((prev) => prev.filter((s) => s.sessionKey !== entry.sessionKey))
      return
    }
    deleteConversation(entry)
  }

  return (
    <PageLayout
      kicker="Operations"
      title="Conversations"
      description="Recent active and saved chats across Main, team leads, and specialists."
      actions={
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <div className="relative min-w-[200px] flex-1 lg:w-60 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-quiet)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-white/80 pl-9 pr-3 text-sm text-strong outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            />
          </div>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            title="Filter by agent"
            className="h-10 max-w-[180px] rounded-xl border border-[color:var(--border)] bg-white/80 px-3 text-sm font-medium text-strong outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          >
            <option value="all">All agents</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div className="relative">
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              title="Filter by date"
              className="h-10 rounded-xl border border-[color:var(--border)] bg-white/80 px-3 pr-8 text-sm font-medium text-strong outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            />
            {dateValue && (
              <button
                type="button"
                onClick={() => setDateValue('')}
                title="Clear date"
                aria-label="Clear date"
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[color:var(--text-quiet)] transition hover:bg-[color:var(--surface-muted)] hover:text-strong"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      }
    >
      {sessionsError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Backend conversations could not be loaded: {sessionsError}. Local drafts are still shown.
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center border-dashed bg-white/60 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-strong">
            {sessionsLoading ? 'Loading conversations...' : hasFilters ? 'No conversations match your filters' : 'No conversations found'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {sessionsLoading ? 'Pulling saved sessions from the broker.' : hasFilters ? 'Try a different agent, date range, or search term.' : 'Start a chat in Mission Control and it will appear here.'}
          </p>
          {!sessionsLoading && hasFilters && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setQuery(''); setDateValue(''); setAgentFilter('all') }}>
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((entry) => (
            <ConversationCard
              key={entry.cid}
              entry={entry}
              active={entry.kind === 'backend' ? currentSessionKey(entry.agentId) === entry.sessionKey : entry.kind === 'active' && activeId === entry.agentId}
              onOpen={() => openConversation(entry)}
              onDelete={() => removeConversation(entry)}
            />
          ))}
        </div>
      )}
    </PageLayout>
  )
}

function ConversationCard({ entry, active, onOpen, onDelete }) {
  const heading = entry.title || entry.name
  const meta = entry.title ? [entry.name, entry.teamLabel].filter(Boolean).join(' / ') : entry.teamLabel
  const [agentsOpen, setAgentsOpen] = useState(false)
  const [subs, setSubs] = useState(null) // null = not loaded yet

  // Lazy-load the agents that ran under this conversation (grouped from its runs).
  useEffect(() => {
    if (!agentsOpen || subs !== null || !entry.sessionKey) return
    let alive = true
    Api.chatRuns(entry.sessionKey).then((runs) => {
      if (!alive) return
      const out = []
      const seen = new Set()
      for (const r of runs || []) {
        for (const c of r.calls || []) {
          const k = String(c.name || c.key || '').toLowerCase()
          if (!k || seen.has(k)) continue
          seen.add(k)
          out.push(c)
        }
      }
      setSubs(out)
    }).catch(() => { if (alive) setSubs([]) })
    return () => { alive = false }
  }, [agentsOpen, subs, entry.sessionKey])

  return (
    <Card className={cn(
      'group p-0 transition hover:border-[color:var(--accent)] hover:shadow-[0_18px_48px_rgba(25,88,80,0.12)]',
      active && 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]',
    )}>
      <div className="flex items-start gap-4 p-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-xs font-bold text-white">
          {cleanIcon(entry.icon, initials(entry.name))}
        </div>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            {(entry.kind === 'saved' || entry.kind === 'backend') && <History className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-quiet)]" />}
            <h3 className="truncate text-sm font-semibold text-strong">{heading}</h3>
            <span className="ml-auto shrink-0 text-xs text-[color:var(--text-quiet)]">{timeAgo(entry.ts)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent-strong)]">
            <span className="truncate">{meta}</span>
            {entry.count != null && <span className="shrink-0 rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 tracking-normal">{entry.count} msgs</span>}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{entry.text || 'No messages yet'}</p>
        </button>
      </div>

      {/* Agents that ran under this conversation — grouped here instead of as separate cards. */}
      <div className="border-t border-[color:var(--border)] px-4 py-2">
        <button
          type="button"
          onClick={() => setAgentsOpen((o) => !o)}
          className="flex w-full items-center gap-2 text-left text-xs font-medium text-[color:var(--text-muted)] transition hover:text-[color:var(--accent-strong)]"
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>Agents in this conversation</span>
          {subs && subs.length > 0 && (
            <span className="rounded-full bg-[color:var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent-strong)]">{subs.length}</span>
          )}
          <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', agentsOpen && 'rotate-180')} />
        </button>
        {agentsOpen && (
          <div className="mt-2 space-y-1.5">
            {subs === null ? (
              <div className="px-1 py-1 text-xs text-muted">Loading…</div>
            ) : subs.length === 0 ? (
              <div className="px-1 py-1 text-xs text-muted">No delegated agents recorded for this conversation.</div>
            ) : (
              subs.map((c, i) => <SubAgentRow key={(c.key || c.name || i) + ''} call={c} />)
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[color:var(--border)] px-4 py-3">
        <Button variant="secondary" size="sm" onClick={onOpen}>
          Open <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          onClick={onDelete}
          title="Delete conversation"
          className="grid h-9 w-9 place-items-center rounded-lg text-[color:var(--text-quiet)] transition hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

// One delegated agent under a conversation — name + status, expands to its markdown output.
function SubAgentRow({ call }) {
  const [open, setOpen] = useState(false)
  const status = call.status || 'done'
  const hasOut = !!(call.output && String(call.output).trim())
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)]">
      <button
        type="button"
        onClick={() => hasOut && setOpen((o) => !o)}
        className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left', !hasOut && 'cursor-default')}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: subColor(status) }} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-strong">{call.name || call.key || 'Agent'}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide" style={{ color: subColor(status) }}>{status}</span>
        {hasOut && <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-quiet transition-transform', open && 'rotate-180')} />}
      </button>
      {open && hasOut && (
        <div className="max-h-72 overflow-y-auto border-t border-[color:var(--border)] px-2.5 py-2 text-[12px] leading-relaxed text-strong scrollbar-thin">
          <Markdown content={call.output} />
        </div>
      )}
    </div>
  )
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

function toMs(value) {
  if (typeof value === 'number') return value
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSessionAgent(sessionKey, fallback) {
  const parts = String(sessionKey || '').split(':')
  if (parts[0] === 'agent' && parts[1]) return parts[1] === 'orchestrator' ? ORCH_ID : parts[1]
  return fallback === 'orchestrator' ? ORCH_ID : (fallback || ORCH_ID)
}
