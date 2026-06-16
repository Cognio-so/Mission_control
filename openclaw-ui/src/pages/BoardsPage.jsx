import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutGrid, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { BOARD_COLUMNS } from '../lib/demoData.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Textarea } from '../components/ui/textarea.jsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog.jsx'

export default function BoardsPage() {
  const { data: boards, source, loading, reload } = useApi(() => Api.boards(), [])
  const [addOpen, setAddOpen] = useState(false)

  const deleteBoard = async (e, id) => {
    e.preventDefault(); e.stopPropagation()
    if (!window.confirm('Delete this board and its tasks?')) return
    try { await Api.deleteBoard(id) } catch { /* surfaced by reload */ }
    reload()
  }

  return (
    <PageLayout
      kicker="Boards"
      title="Boards"
      description="Each board is a workspace where agents pick up, work, and hand off tasks. Open one to see the live kanban."
      actions={
        <>
          <SourceBadge source={source} />
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New board</Button>
        </>
      }
      wide
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : (boards || []).length === 0 ? (
        <EmptyPanel icon={LayoutGrid} title="No boards yet" hint="Create your first board to start tracking agent work.">
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New board</Button>
        </EmptyPanel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(boards || []).map((b, i) => {
            const total = Object.values(b.counts || {}).reduce((a, c) => a + c, 0)
            return (
              <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
                <Link to={'/boards/' + b.id}>
                  <Card className="group relative flex h-full flex-col p-5">
                    <button
                      onClick={(e) => deleteBoard(e, b.id)} title="Delete board"
                      className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="flex items-start justify-between">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                        <LayoutGrid className="h-5 w-5" />
                      </div>
                      <Badge variant="outline">{b.group || 'board'}</Badge>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-strong">{b.name}</h3>
                    <p className="mt-1 flex-1 text-sm text-muted line-clamp-2">{b.description}</p>
                    <div className="mt-4 flex items-center gap-2">
                      {BOARD_COLUMNS.map((col) => (
                        <div key={col.key} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                          {b.counts?.[col.key] ?? 0}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-500">{total} tasks</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--accent)] transition group-hover:gap-2">
                        Open board <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

      {addOpen && <NewBoardDialog onClose={() => setAddOpen(false)} onCreated={reload} />}
    </PageLayout>
  )
}

function NewBoardDialog({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true); setErr('')
    try {
      await Api.createBoard({ name: name.trim(), group: group.trim() || 'General', description: description.trim() })
      onCreated?.()
      onClose()
    } catch (e) {
      setErr(e.message || 'Could not create board — the broker may not expose POST /boards yet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
          <DialogDescription>A workspace where agents pick up and hand off tasks.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="AlgoHype Growth" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Group</span>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Marketing" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What this board is for…" />
          </label>
          {err && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{err}</div>}
        </div>
        <DialogFooter className="mt-5">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create board'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
