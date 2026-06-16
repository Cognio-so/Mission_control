import { useEffect, useState } from 'react'
import { FileText, Brain, Save, RefreshCw } from 'lucide-react'
import { Api } from '../../lib/api.js'
import { cn } from '../../lib/utils.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog.jsx'
import { Button } from '../ui/button.jsx'

const ICON_FOR = (name) => (name === 'memory.md' ? Brain : FileText)

export function AgentFilesDialog({ agentId, agentName, onClose }) {
  const [files, setFiles] = useState([])
  const [active, setActive] = useState(null)
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // load the file list, then auto-open memory.md (or the first file)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    Api.agentFiles.list(agentId)
      .then((list) => {
        if (!alive) return
        setFiles(list)
        const first = list.find((f) => f.name === 'memory.md') || list[0]
        if (first) openFile(first.name)
        else setLoading(false)
      })
      .catch((e) => { if (alive) { setError(e.message || 'Could not load files'); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  const openFile = async (name) => {
    setActive(name); setLoading(true); setError('')
    try {
      const text = await Api.agentFiles.get(agentId, name)
      setContent(text); setOriginal(text)
    } catch (e) {
      setError(e.message || 'Could not read file')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      await Api.agentFiles.put(agentId, active, content)
      setOriginal(content)
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const dirty = content !== original

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{agentName} · memory &amp; files</DialogTitle>
          <DialogDescription>The agent’s broker‑local files. Editing <span className="font-mono">memory.md</span> changes what it remembers; <span className="font-mono">AGENT.md</span> is its persona.</DialogDescription>
        </DialogHeader>

        {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>}

        <div className="mt-4 grid grid-cols-[180px_1fr] gap-4">
          <div className="space-y-1">
            {files.length === 0 && !loading && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">No files.</div>}
            {files.map((f) => {
              const Icon = ICON_FOR(f.name)
              return (
                <button
                  key={f.name} onClick={() => openFile(f.name)}
                  className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                    active === f.name ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]' : 'border-slate-200 hover:bg-slate-50')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                </button>
              )
            })}
            <Button variant="ghost" size="xs" className="mt-1 w-full" onClick={() => active && openFile(active)} disabled={!active || loading}>
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Reload
            </Button>
          </div>

          <div className="min-w-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading || !active}
              spellCheck={false}
              placeholder={loading ? 'Loading…' : 'Select a file'}
              className="h-72 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-strong focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] scrollbar-thin"
            />
            <div className="mt-1 text-[11px] text-slate-400">{active ? `${content.length} chars${dirty ? ' · unsaved' : ''}` : ''}</div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
          <Button onClick={save} disabled={!active || !dirty || saving}>
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
