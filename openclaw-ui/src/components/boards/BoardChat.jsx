import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Paperclip, Send, X } from 'lucide-react'
import { Button } from '../ui/button.jsx'
import { Markdown } from '../atoms/Markdown.jsx'

// Right-panel "Board chat" — talk to the lead agent.
export function BoardChat({ messages, onSend, sending }) {
  const [text, setText] = useState('')
  const [effort, setEffort] = useState('medium')
  const [files, setFiles] = useState([])
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])

  const submit = () => {
    const t = text.trim()
    if (!t && !files.length) return
    const picked = files
    setText('')
    setFiles([])
    if (fileRef.current) fileRef.current.value = ''
    onSend(t, effort, picked)
  }
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }
  const addFiles = (list) => setFiles((prev) => [...prev, ...Array.from(list || []).filter(Boolean)].slice(0, 10))
  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Board chat</p>
        <p className="mt-1 text-sm font-medium text-slate-900">Talk to the lead agent. Tag others with @name.</p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((m, i) => (
          <motion.div
            key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2) }}
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {m.source}
                {m.role && <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.role}</span>}
              </p>
              {m.created_at && <span className="text-xs text-slate-400">{m.created_at}</span>}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-900">
              <Markdown content={m.content} />
              {m.streaming && <span className="stream-caret align-middle" />}
            </div>
          </motion.div>
        ))}
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">No messages yet. Message the board lead below.</p>
        )}
      </div>

      <div className="border-t border-slate-200 p-3">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <span
                key={file.name + '_' + index}
                className="inline-flex min-w-0 max-w-[180px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
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
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-[color:var(--accent)]">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} title="Attach files">
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
            placeholder="Message the board lead. Tag agents with @name."
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-strong placeholder:text-slate-400 focus:outline-none"
          />
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            title="Reasoning effort"
            className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none transition hover:border-[color:var(--accent)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          >
            {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <Button size="sm" onClick={submit} disabled={sending || (!text.trim() && !files.length)}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
