import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, History, MessageSquareText, Search, Trash2 } from 'lucide-react'
import { ORCH_ID } from '../agents.js'
import { cn, cleanIcon, initials } from '../lib/utils.js'
import { useMission } from '../store/mission.jsx'
import { PageLayout } from '../components/layout/PageLayout.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'

export default function ConversationsPage() {
  const {
    agents, agentsById, teams, activeId, setActiveId, state, savedChats, resumeChat, deleteConversation, getThread,
  } = useMission()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

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
          agentId: chat.agentId,
          name: agent?.name || (chat.agentId === ORCH_ID ? 'Main' : chat.name || chat.agentId),
          icon: agent?.icon || chat.icon,
          teamLabel: meta.label || 'Saved conversation',
          text: chat.messages?.[chat.messages.length - 1]?.text || '',
          ts: chat.ts || 0,
          saved: chat,
        }
      })

    return [...active, ...saved].sort((a, b) => b.ts - a.ts)
  }, [agents, agentsById, savedChats, teamMeta, state.threads, getThread])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) =>
      [c.name, c.teamLabel, c.text].some((part) => String(part || '').toLowerCase().includes(q)),
    )
  }, [conversations, query])

  const openConversation = (entry) => {
    if (entry.kind === 'saved') resumeChat(entry.saved)
    else setActiveId(entry.agentId)
    navigate('/mission')
  }

  return (
    <PageLayout
      kicker="Operations"
      title="Conversations"
      description="Recent active and saved chats across Main, team leads, and specialists."
      actions={
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-quiet)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-white/80 pl-9 pr-3 text-sm text-strong outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          />
        </div>
      }
    >
      {filtered.length === 0 ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center border-dashed bg-white/60 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold text-strong">No conversations found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Start a chat in Mission Control and it will appear here.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((entry) => (
            <ConversationCard
              key={entry.cid}
              entry={entry}
              active={entry.kind === 'active' && activeId === entry.agentId}
              onOpen={() => openConversation(entry)}
              onDelete={() => deleteConversation(entry)}
            />
          ))}
        </div>
      )}
    </PageLayout>
  )
}

function ConversationCard({ entry, active, onOpen, onDelete }) {
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
            {entry.kind === 'saved' && <History className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-quiet)]" />}
            <h3 className="truncate text-sm font-semibold text-strong">{entry.name}</h3>
            <span className="ml-auto shrink-0 text-xs text-[color:var(--text-quiet)]">{timeAgo(entry.ts)}</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent-strong)]">
            {entry.teamLabel}
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{entry.text || 'No messages yet'}</p>
        </button>
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
