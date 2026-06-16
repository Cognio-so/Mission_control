import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Star, Download, Store, Check, ExternalLink, Code2, Plus } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { DEMO_GATEWAYS } from '../lib/demoData.js'
import { cn } from '../lib/utils.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { AddSkillDialog } from '../components/skills/AddSkillDialog.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Badge } from '../components/ui/badge.jsx'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog.jsx'

export default function MarketplacePage() {
  const { data: skills, source, loading, reload } = useApi(() => Api.skills(), [])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [selected, setSelected] = useState(null)
  const [addOpen, setAddOpen] = useState(false)

  const categories = useMemo(() => ['All', ...Array.from(new Set((skills || []).map((s) => s.category).filter(Boolean)))], [skills])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (skills || []).filter((s) => {
      if (cat !== 'All' && s.category !== cat) return false
      if (!needle) return true
      return [s.name, s.summary, ...(s.tags || [])].join(' ').toLowerCase().includes(needle)
    })
  }, [skills, q, cat])

  return (
    <PageLayout
      kicker="Skills"
      title="Marketplace"
      description="Browse and install skills onto your gateways. Each skill is a reusable capability your agents can call."
      actions={
        <>
          <SourceBadge source={source} />
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add skill</Button>
        </>
      }
      wide
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c} onClick={() => setCat(c)}
              className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                cat === c ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
            >{c}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkillGridSkeleton />
      ) : (skills || []).length === 0 ? (
        <EmptyPanel
          icon={Store}
          title="Marketplace not connected"
          hint="Add the GET /skills/marketplace endpoint to your broker (see BROKER_CHANGES.md §1) and installable skills will show here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s, i) => (
            <SkillCard key={s.id} skill={s} index={i} onInstall={() => setSelected(s)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 py-16 text-center text-sm text-slate-500">
              No skills match “{q}”.
            </div>
          )}
        </div>
      )}

      <InstallDialog skill={selected} onClose={() => setSelected(null)} />
      {addOpen && <AddSkillDialog onClose={() => setAddOpen(false)} onAdded={reload} />}
    </PageLayout>
  )
}

function SkillCard({ skill, index, onInstall }) {
  const installed = skill.status === 'installed'
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -3 }}
    >
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm">
            <Store className="h-5 w-5" />
          </div>
          <Badge variant={installed ? 'success' : 'outline'}>{installed ? 'installed' : 'available'}</Badge>
        </div>
        <h3 className="mt-3 text-base font-semibold text-strong">{skill.name}</h3>
        <p className="mt-1 flex-1 text-sm text-muted line-clamp-3">{skill.summary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(skill.tags || []).slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">#{t}</span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="font-medium">{skill.author || skill.category}</span>
          <div className="flex items-center gap-3">
            {skill.rating > 0 && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-400" /> {skill.rating}</span>}
            {skill.installs > 0 && <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> {skill.installs.toLocaleString()}</span>}
            {skill.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{skill.category}</span>}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" variant={installed ? 'secondary' : 'primary'} onClick={onInstall}>
            {installed ? <><Check className="h-4 w-4" /> Manage</> : <><Download className="h-4 w-4" /> Install</>}
          </Button>
          {skill.sourceUrl && (
            <a href={skill.sourceUrl} target="_blank" rel="noreferrer"
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700">
              <Code2 className="h-4 w-4" />
            </a>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

function InstallDialog({ skill, onClose }) {
  const { data: gateways } = useApi(() => Api.gateways(), [])
  const list = gateways || DEMO_GATEWAYS
  const [installing, setInstalling] = useState(null)
  const [done, setDone] = useState({})
  const [errors, setErrors] = useState({})

  const toggle = async (gw) => {
    setInstalling(gw.id)
    setErrors((e) => ({ ...e, [gw.id]: '' }))
    try {
      const res = await Api.installSkill(skill.id, gw.id)
      if (res && res.ok === false) {
        setErrors((e) => ({ ...e, [gw.id]: res.error || 'Install failed' }))
      } else {
        setDone((d) => ({ ...d, [gw.id]: !d[gw.id] }))
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [gw.id]: err.message || 'Install failed' }))
    }
    setInstalling(null)
  }

  return (
    <Dialog open={Boolean(skill)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{skill?.name || 'Install skill'}</DialogTitle>
          <DialogDescription>Choose one or more gateways where this skill should be installed.</DialogDescription>
        </DialogHeader>
        <div className="mt-3 space-y-3">
          {list.map((gw) => {
            const isInstalled = done[gw.id]
            const err = errors[gw.id]
            return (
              <div key={gw.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{gw.name}</p>
                    <p className="font-mono text-xs text-slate-400">{gw.url}</p>
                  </div>
                  <Button size="sm" variant={isInstalled ? 'outline' : 'primary'} disabled={installing === gw.id} onClick={() => toggle(gw)}>
                    {installing === gw.id ? '…' : isInstalled ? 'Uninstall' : 'Install'}
                  </Button>
                </div>
                {err && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">{err}</p>}
              </div>
            )
          })}
          {skill?.sourceUrl && (
            <a href={skill.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--accent)]">
              <ExternalLink className="h-3.5 w-3.5" /> View source
            </a>
          )}
        </div>
        <DialogFooter className="mt-6 border-t border-slate-200 pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SkillGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ))}
    </div>
  )
}
