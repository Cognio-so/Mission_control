import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Api } from '../../lib/api.js'
import { cn } from '../../lib/utils.js'
import { Markdown } from '../atoms/Markdown.jsx'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog.jsx'
import { Badge } from '../ui/badge.jsx'

function fileName(file) {
  if (typeof file === 'string') return file
  return file?.name || file?.path?.split('/').pop() || file?.id || 'file'
}

function filePath(file) {
  if (typeof file === 'string') return file
  return file?.path || file?.name || file?.id || 'file'
}

function fileContent(file) {
  if (typeof file === 'string') return ''
  return file?.content || file?.markdown || file?.body || ''
}

function fallbackContent(item) {
  return item?.markdown || item?.readme || item?.content || item?.instructions || item?.description || item?.summary || ''
}

function preferredFile(files) {
  const paths = files.map((f) => ({ path: filePath(f), name: fileName(f) }))
  return (
    paths.find((f) => /^skill\.md$/i.test(f.name))?.path ||
    paths.find((f) => /^readme\.md$/i.test(f.name))?.path ||
    paths.find((f) => /\.md$/i.test(f.name))?.path ||
    paths[0]?.path ||
    ''
  )
}

export function CapabilityFilesDialog({ kind, item, onClose }) {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const title = kind === 'plugin' ? 'Plugin' : 'Skill'
  const fallback = useMemo(() => fallbackContent(item), [item])

  useEffect(() => {
    let cancelled = false
    async function loadFiles() {
      setLoading(true); setError('')
      try {
        if (kind !== 'skill') {
          if (!cancelled) {
            setFiles([])
            setSelected('')
            setContent('```json\n' + JSON.stringify(item, null, 2) + '\n```')
          }
          return
        }
        const data = await Api.skillFiles(item.id)
        const list = Array.isArray(data?.files) ? data.files : []
        if (cancelled) return
        setFiles(list)
        if (data?.readable === false || item?.readable === false) {
          setSelected('')
          setContent(fallback)
          setError(fallback ? 'Bundled skill: file content lives inside the OpenClaw image, so the broker can only show metadata.' : 'Bundled skill: content is not readable from the data volume.')
          return
        }
        const first = preferredFile(list)
        setSelected(first)
        const inline = fileContent(list.find((f) => filePath(f) === first))
        if (inline) {
          setContent(inline)
        } else if (first) {
          const file = await Api.skillFile(item.id, first)
          setContent(typeof file?.content === 'string' ? file.content : '')
        } else {
          setContent(fallback)
        }
      } catch (e) {
        if (!cancelled) {
          setFiles([])
          setSelected('')
          setContent(fallback)
          setError(fallback ? '' : (e.message || 'File endpoint is not available.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (item?.id) loadFiles()
    return () => { cancelled = true }
  }, [kind, item, fallback])

  const selectFile = async (name) => {
    setSelected(name); setLoading(true); setError('')
    try {
      const inline = fileContent(files.find((f) => filePath(f) === name))
      if (inline) setContent(inline)
      else {
        const file = await Api.skillFile(item.id, name)
        setContent(typeof file?.content === 'string' ? file.content : '')
      }
    } catch (e) {
      setContent('')
      setError(e.message || 'Failed to load file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="border-b border-[color:var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>{item?.name || title}</DialogTitle>
              <DialogDescription>{title} files and metadata from the broker.</DialogDescription>
            </div>
            <Badge variant="outline">{title.toLowerCase()}</Badge>
          </div>
        </DialogHeader>

        <div className="grid min-h-[520px] md:grid-cols-[230px_1fr]">
          <aside className="border-r border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-quiet)]">Files</div>
            {files.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-4 text-xs text-muted">
                {fallback ? 'No file list endpoint. Showing metadata from the list response.' : 'No markdown files returned.'}
              </div>
            ) : (
              <div className="space-y-1">
                {files.map((file) => {
                  const name = filePath(file)
                  return (
                    <button
                      key={name}
                      onClick={() => selectFile(name)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition',
                        selected === name ? 'bg-[color:var(--accent-soft)] font-semibold text-[color:var(--accent-strong)]' : 'text-muted hover:bg-[color:var(--surface)]',
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={name}>{fileName(file)}</span>
                      {file?.size != null && <span className="ml-auto shrink-0 text-[10px] text-slate-400">{formatBytes(file.size)}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </aside>

          <section className="min-w-0 bg-[color:var(--surface)]">
            {loading ? (
              <div className="grid h-full min-h-[520px] place-items-center text-sm text-muted">
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading file...</span>
              </div>
            ) : error && !content ? (
              <div className="m-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>
            ) : content ? (
              <div className="h-[70vh] overflow-y-auto px-6 py-5 text-sm scrollbar-thin">
                {error && <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}
                <Markdown content={content} />
              </div>
            ) : (
              <div className="grid h-full min-h-[520px] place-items-center text-sm text-muted">No content available.</div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(size) {
  const n = Number(size)
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 102.4) / 10 + ' KB'
  return Math.round(n / 1024 / 102.4) / 10 + ' MB'
}
