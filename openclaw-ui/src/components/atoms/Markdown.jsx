import { useState, Children } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils.js'

// Pull the raw text out of a react-markdown code node (string | array | element).
function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.props) return textOf(node.props.children)
  return ''
}

function CodeBlock({ children }) {
  const codeEl = Children.toArray(children)[0]
  let raw = textOf(codeEl)
  // pretty-print JSON code blocks when possible
  try {
    const t = raw.trim()
    if ((t.startsWith('{') || t.startsWith('[')) ) raw = JSON.stringify(JSON.parse(t), null, 2)
  } catch { /* leave as-is */ }
  const [copied, setCopied] = useState(false)
  const copy = () => {
    try { navigator.clipboard?.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="group relative my-2 max-w-full">
      <button
        onClick={copy}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 transition hover:bg-white/20 group-hover:opacity-100"
      >
        {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
      </button>
      <pre className="max-w-full overflow-x-auto rounded-xl bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-100 scrollbar-thin">
        <code className="font-mono">{raw}</code>
      </pre>
    </div>
  )
}

// Chat-friendly markdown: headings, lists, bold, links, code + fenced code blocks, tables.
export function Markdown({ content, className }) {
  return (
    <div className={cn('min-w-0 max-w-full break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: (p) => <h1 className="mb-1.5 mt-3 text-base font-bold first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-1.5 mt-3 text-[15px] font-bold first:mt-0" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-2.5 text-sm font-semibold first:mt-0" {...p} />,
          p: (p) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-1.5 list-disc space-y-0.5 pl-5" {...p} />,
          ol: (p) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          a: (p) => <a className="font-medium text-[color:var(--accent)] underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          blockquote: (p) => <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-500" {...p} />,
          hr: () => <hr className="my-3 border-slate-200" />,
          code: ({ inline, children, ...p }) =>
            inline ? (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-rose-600" {...p}>{children}</code>
            ) : (
              <code {...p}>{children}</code>
            ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: (p) => <div className="my-2 max-w-full overflow-x-auto scrollbar-thin"><table className="w-full border-collapse text-[13px]" {...p} /></div>,
          th: (p) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold" {...p} />,
          td: (p) => <td className="border border-slate-200 px-2 py-1 align-top" {...p} />,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}
