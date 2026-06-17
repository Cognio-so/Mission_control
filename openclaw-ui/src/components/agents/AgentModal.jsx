import { useState } from 'react'
import { Trash2, Sparkles, Loader2, Search, Check, X, Wrench } from 'lucide-react'
import { ORCH_ID, slugAgentId } from '../../agents.js'
import { initials } from '../../lib/utils.js'
import { Api, useApi } from '../../lib/api.js'
import { cn } from '../../lib/utils.js'
import { useMission } from '../../store/mission.jsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.jsx'
import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'
import { Textarea } from '../ui/textarea.jsx'

export function AgentModal({ entry, onSave, onDelete, onClose, saving }) {
  const isOrch = entry.agent.id === ORCH_ID
  const [f, setF] = useState({ skills: [], tools: [], ...entry.agent })
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const valid = (f.name || '').trim().length > 0
  const backendId = entry.mode === 'new' ? slugAgentId(f.name) : f.id

  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState('')
  const [toolInput, setToolInput] = useState('')
  const [skillQuery, setSkillQuery] = useState('')
  const { data: allSkills } = useApi(() => Api.skills(), [])

  // team / hierarchy: where this agent reports. '__new__' = make it a new orchestrator/team.
  const mission = useMission()
  const orchestrators = (mission?.agents || []).filter((a) => a.kind === 'orchestrator')
  const [reportsTo, setReportsTo] = useState(
    entry.agent.kind === 'orchestrator' ? '__new__' : entry.agent.parentId || ORCH_ID,
  )

  const draft = async () => {
    setDrafting(true); setDraftErr('')
    try {
      const res = await Api.draftInstructions({ name: f.name, role: f.role, brief: f.instructions || f.role || f.name })
      if (res?.instructions) setF((s) => ({ ...s, instructions: res.instructions }))
      else setDraftErr('No draft returned.')
    } catch (e) {
      setDraftErr(e.message || 'Needs broker POST /agents/draft-instructions.')
    } finally {
      setDrafting(false)
    }
  }

  const toggleSkill = (id) => setF((s) => ({ ...s, skills: s.skills.includes(id) ? s.skills.filter((x) => x !== id) : [...s.skills, id] }))
  const addTool = () => {
    const v = toolInput.trim()
    if (!v || f.tools.includes(v)) { setToolInput(''); return }
    setF((s) => ({ ...s, tools: [...s.tools, v] }))
    setToolInput('')
  }
  const removeTool = (t) => setF((s) => ({ ...s, tools: s.tools.filter((x) => x !== t) }))

  const skillList = (allSkills || []).filter((sk) => !skillQuery || (sk.name + ' ' + (sk.tags || []).join(' ')).toLowerCase().includes(skillQuery.toLowerCase()))

  const save = () => {
    if (!valid) return
    const isNewOrch = reportsTo === '__new__'
    const parent = orchestrators.find((o) => o.id === reportsTo)
    const kind = isOrch || isNewOrch ? 'orchestrator' : 'specialist'
    const team = isOrch ? (f.team || f.name.trim()) : isNewOrch ? f.name.trim() : parent?.team || parent?.name || ''
    const parentId = kind === 'orchestrator' ? null : reportsTo
    onSave(
      {
        ...f,
        name: f.name.trim(),
        role: (f.role || '').trim(),
        instructions: (f.instructions || '').trim(),
        icon: initials(f.name.trim()),
        skills: f.skills, tools: f.tools,
        kind, team, parentId,
        managedByOrchestrator: kind === 'specialist',
        sessionKey: isOrch ? '' : (f.sessionKey || '').trim() || 'agent_' + f.id,
      },
      entry.mode,
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-sm font-bold text-white shadow-sm">
              {initials(f.name || 'Agent')}
            </div>
            <div>
              <DialogTitle>{entry.mode === 'new' ? 'New agent' : 'Edit agent'}</DialogTitle>
              <DialogDescription>{isOrch ? 'Main coordinator' : 'Define the agent, then add skills & tools.'}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input autoFocus value={f.name} onChange={up('name')} placeholder="Web Designer" /></Field>
            <Field label="Role"><Input value={f.role || ''} onChange={up('role')} placeholder="layouts, UI/UX, landing pages" /></Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructions</span>
              <button
                onClick={draft} disabled={drafting || !(f.role || f.name)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--accent)] bg-[color:var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--accent-strong)] transition hover:bg-[color:var(--accent)] hover:text-white disabled:opacity-50"
              >
                {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {drafting ? 'Writing…' : 'Write with AI'}
              </button>
            </div>
            <Textarea value={f.instructions || ''} onChange={up('instructions')} rows={4} placeholder="What is this agent responsible for? Or click ‘Write with AI’." />
            {draftErr && <p className="mt-1 text-[11px] text-amber-600">{draftErr}</p>}
          </div>

          {!isOrch && (
            <>
              {/* Team / reports to */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Team</span>
                <select
                  value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[color:var(--border)] bg-white px-3 text-sm text-strong focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                >
                  {orchestrators.map((o) => (
                    <option key={o.id} value={o.id}>↳ Specialist under “{o.team || o.name}” team</option>
                  ))}
                  <option value="__new__">⭐ New team — make this an Orchestrator</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  {reportsTo === '__new__'
                    ? 'This agent heads a new team; add specialists under it later.'
                    : 'This agent reports to the selected orchestrator and appears under its tree.'}
                </p>
              </div>

              {/* Skills */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Skills <span className="text-slate-400">({f.skills.length})</span></span>
                {f.skills.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {f.skills.map((id) => {
                      const sk = (allSkills || []).find((s) => s.id === id)
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--accent-strong)]">
                          {sk?.name || id}
                          <button onClick={() => toggleSkill(id)}><X className="h-3 w-3" /></button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="rounded-xl border border-slate-200">
                  <div className="relative border-b border-slate-100">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)} placeholder="Search skills…" className="h-9 w-full rounded-t-xl bg-transparent pl-9 pr-3 text-sm focus:outline-none" />
                  </div>
                  <div className="max-h-40 overflow-y-auto p-1 scrollbar-thin">
                    {skillList.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">No skills available (marketplace not connected).</div>}
                    {skillList.slice(0, 60).map((sk) => {
                      const on = f.skills.includes(sk.id)
                      return (
                        <button
                          key={sk.id} onClick={() => toggleSkill(sk.id)}
                          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition', on ? 'bg-[color:var(--accent-soft)]' : 'hover:bg-slate-50')}
                        >
                          <span className={cn('grid h-4 w-4 place-items-center rounded border', on ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white' : 'border-slate-300')}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{sk.name}</span>
                          {sk.category && <span className="text-[10px] text-slate-400">{sk.category}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Tools */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tools</span>
                {f.tools.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {f.tools.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        <Wrench className="h-3 w-3" /> {t}
                        <button onClick={() => removeTool(t)}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  value={toolInput} onChange={(e) => setToolInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool() } }}
                  placeholder="Type a tool and press Enter (e.g. browser, web_search)"
                />
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Backend id <span className="font-mono text-slate-700">{backendId}</span> · Session <span className="font-mono text-slate-700">{f.sessionKey || 'agent_' + backendId}</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-6 justify-between">
          <div>{onDelete && <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={onDelete} disabled={saving}><Trash2 className="h-4 w-4" /> Delete</Button>}</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={!valid || saving}>{saving ? 'Saving…' : entry.mode === 'new' ? 'Create agent' : 'Save changes'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}
