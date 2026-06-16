import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2, MessageSquare, Bot, Brain } from 'lucide-react'
import { ORCH_ID, newAgentTemplate, sessionKeyFor } from '../agents.js'
import { cleanIcon, initials } from '../lib/utils.js'
import { useMission } from '../store/mission.jsx'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { AgentModal } from '../components/agents/AgentModal.jsx'
import { AgentFilesDialog } from '../components/agents/AgentFilesDialog.jsx'
import { StatusDot } from '../components/atoms/StatusDot.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function AgentsPage() {
  const m = useMission()
  const { agents, settings, setActiveId, saveAgent, deleteAgent, agentSaving, getThread } = m
  const [modal, setModal] = useState(null)
  const [filesAgent, setFilesAgent] = useState(null)
  const nav = useNavigate()

  const openChat = (id) => { setActiveId(id); nav('/mission') }
  const onSave = async (agent, mode) => { try { await saveAgent(agent, mode); setModal(null) } catch { /* store shows status */ } }

  return (
    <PageLayout
      kicker="Operations"
      title="Agents"
      description="Your orchestrator and specialist agents. Create, edit, and jump into a live thread with any of them."
      actions={<Button onClick={() => setModal({ mode: 'new', agent: newAgentTemplate() })}><Plus className="h-4 w-4" /> New agent</Button>}
      wide
    >
      {agents.length <= 1 ? (
        <EmptyPanel icon={Bot} title="Only the Orchestrator so far" hint="Create a specialist agent to start delegating work.">
          <Button onClick={() => setModal({ mode: 'new', agent: newAgentTemplate() })}><Plus className="h-4 w-4" /> New agent</Button>
        </EmptyPanel>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-slate-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid-cols-[2fr_1.4fr_1fr_auto]">
            <span>Agent</span>
            <span className="hidden sm:block">Role</span>
            <span className="hidden sm:block">Session</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-slate-100">
            {agents.map((a, i) => {
              const t = getThread(a.id)
              const dot = a.status || (t.running ? 'running' : t.messages.length ? 'ready' : 'idle')
              return (
                <motion.div
                  key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50 sm:grid-cols-[2fr_1.4fr_1fr_auto]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-bold text-white">
                      {cleanIcon(a.icon, initials(a.name))}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-strong">{a.name}</span>
                        {a.id === ORCH_ID ? <Badge variant="accent">orchestrator</Badge> : a.managedByOrchestrator ? <Badge variant="outline">managed</Badge> : null}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted"><StatusDot status={dot} pulse={t.running} /> {dot}</div>
                    </div>
                  </div>
                  <div className="hidden truncate text-sm text-muted sm:block">{a.role || '—'}</div>
                  <div className="hidden truncate font-mono text-xs text-slate-500 sm:block">{sessionKeyFor(a, settings.session)}</div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="icon" title="Open chat" onClick={() => openChat(a.id)}><MessageSquare className="h-4 w-4" /></Button>
                    {a.id !== ORCH_ID && (
                      <Button variant="ghost" size="icon" title="Memory & files" onClick={() => setFilesAgent({ id: a.id, name: a.name })}><Brain className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setModal({ mode: 'edit', agent: a })}><Pencil className="h-4 w-4" /></Button>
                    {a.id !== ORCH_ID && (
                      <Button variant="ghost" size="icon" title="Delete" className="text-rose-600 hover:bg-rose-50" onClick={() => deleteAgent(a.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </Card>
      )}

      {modal && (
        <AgentModal
          entry={modal} onSave={onSave} saving={agentSaving}
          onDelete={modal.mode === 'edit' && modal.agent.id !== ORCH_ID ? async () => { if (await deleteAgent(modal.agent.id)) setModal(null) } : null}
          onClose={() => setModal(null)}
        />
      )}

      {filesAgent && (
        <AgentFilesDialog agentId={filesAgent.id} agentName={filesAgent.name} onClose={() => setFilesAgent(null)} />
      )}
    </PageLayout>
  )
}
