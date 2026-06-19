import { useState } from 'react'
import { Link2, FileCode, Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { Api } from '../../lib/api.js'
import { cn } from '../../lib/utils.js'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog.jsx'
import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'
import { Textarea } from '../ui/textarea.jsx'

const MODES = [
  { key: 'source', label: 'From source', icon: Link2, hint: 'Install from a Git repo or URL.' },
  { key: 'file', label: 'From file', icon: FileCode, hint: 'Paste a markdown/config file and the broker writes it into the workspace.' },
  { key: 'describe', label: 'Describe', icon: Sparkles, hint: 'Describe what you want and the broker generates it.' },
]

export function AddSkillDialog({ kind = 'skill', onClose, onAdded }) {
  const [mode, setMode] = useState('source')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const valid =
    (mode === 'source' && url.trim()) ||
    (mode === 'file' && name.trim() && content.trim()) ||
    (mode === 'describe' && prompt.trim())

  const submit = async () => {
    setBusy(true); setError(''); setOk('')
    const payload =
      mode === 'source' ? { type: 'source', url: url.trim() }
      : mode === 'file' ? { type: 'file', name: name.trim(), content }
      : { type: 'describe', prompt: prompt.trim() }
    try {
      const res = await Api.addSkill(payload)
      if (res && res.ok === false) {
        setError(res.error || 'The broker could not add the ' + kind + '.')
      } else {
        setOk(res?.message || titleCase(kind) + ' submitted.')
        onAdded?.()
        setTimeout(() => onClose(), 900)
      }
    } catch (e) {
      setError(e.message || 'Add ' + kind + ' failed. The broker may not expose the add endpoint yet.')
    } finally {
      setBusy(false)
    }
  }

  const activeHint = MODES.find((m) => m.key === mode)?.hint
  const title = titleCase(kind)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a {kind}</DialogTitle>
          <DialogDescription>Add a {kind} from a source, a file, or a description. {activeHint}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key} onClick={() => { setMode(m.key); setError(''); setOk('') }}
              className={cn('flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-semibold transition',
                mode === m.key ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
            >
              <m.icon className="h-4 w-4" /> {m.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {mode === 'source' && (
            <Field label="Source URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === 'plugin' ? 'https://github.com/owner/plugin-repo' : 'https://github.com/owner/skills/tree/main/my-skill'} />
            </Field>
          )}
          {mode === 'file' && (
            <>
              <Field label={title + ' name'}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'plugin' ? 'my-plugin' : 'my-skill'} /></Field>
              <Field label={title + ' file content'}>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} placeholder={kind === 'plugin' ? '{\n  "name": "my-plugin"\n}' : '---\nname: my-skill\ndescription: ...\n---\n\nInstructions...'} className="font-mono text-xs" />
              </Field>
            </>
          )}
          {mode === 'describe' && (
            <Field label={'Describe the ' + kind}>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder={kind === 'plugin' ? 'A plugin that connects agents to our CRM.' : "A skill that audits a website's on-page SEO and returns prioritized fixes."} />
            </Field>
          )}

          {error && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</div>}
          {ok && <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {ok}</div>}
        </div>

        <DialogFooter className="mt-5">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding...</> : 'Add ' + kind}
          </Button>
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

function titleCase(value) {
  return String(value || '').slice(0, 1).toUpperCase() + String(value || '').slice(1)
}
