import { motion } from 'framer-motion'
import { Boxes, Code2, Package } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import { Badge } from '../components/ui/badge.jsx'

export default function PacksPage() {
  const { data: packs, source, loading } = useApi(() => Api.packs(), [])

  return (
    <PageLayout
      kicker="Skills"
      title="Skill Packs"
      description="A pack is a repository of skills. Install a whole pack to give every agent its capabilities at once."
      actions={<SourceBadge source={source} />}
      wide
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
        </div>
      ) : (packs || []).length === 0 ? (
        <EmptyPanel
          icon={Boxes}
          title="No skill packs"
          hint="Add the GET /skills/packs endpoint to your broker (see BROKER_CHANGES.md §2) to list installable packs here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(packs || []).map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <Badge variant={p.status === 'published' ? 'success' : 'warning'}>{p.status}</Badge>
                </div>
                <h3 className="mt-3 text-base font-semibold text-strong">{p.name}</h3>
                <p className="mt-1 flex-1 text-sm text-muted line-clamp-2">{p.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> {p.skillCount} skills</span>
                  <span className="font-mono">{p.packLabel}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1"><Boxes className="h-4 w-4" /> Install pack</Button>
                  {p.sourceUrl && (
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer"
                      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700">
                      <Code2 className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
