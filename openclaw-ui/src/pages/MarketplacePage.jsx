import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Store, Plus, FileText, Plug, FolderOpen } from 'lucide-react'
import { Api, useApi } from '../lib/api.js'
import { cn } from '../lib/utils.js'
import { PageLayout, EmptyPanel } from '../components/layout/PageLayout.jsx'
import { SourceBadge } from '../components/atoms/SourceBadge.jsx'
import { AddSkillDialog } from '../components/skills/AddSkillDialog.jsx'
import { CapabilityFilesDialog } from '../components/skills/CapabilityFilesDialog.jsx'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { Badge } from '../components/ui/badge.jsx'

const KIND_META = {
  skill: {
    title: 'Skills',
    singular: 'skill',
    kicker: 'Marketplace',
    description: 'Installed skills from the live workspace. Open a readable skill to inspect SKILL.md and related files.',
    Icon: Store,
    loader: () => Api.skills(),
  },
  plugin: {
    title: 'Plugins',
    singular: 'plugin',
    kicker: 'Marketplace',
    description: 'Read-only plugin inventory from the live workspace. Enabled plugins are available to the runtime.',
    Icon: Plug,
    loader: () => Api.plugins(),
  },
}

function itemName(item) {
  return item?.name || item?.title || item?.id || 'Untitled'
}

function itemSummary(item) {
  return item?.summary || item?.description || item?.role || item?.path || 'Installed in this workspace.'
}

function itemTags(item) {
  return [
    item?.category,
    item?.type,
    item?.status,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].filter(Boolean)
}

function isInstalledSkill(item) {
  return String(item?.status || '').toLowerCase() === 'installed'
}

function isEnabledPlugin(item) {
  return item?.enabled === true || String(item?.enabled || '').toLowerCase() === 'true'
}

export function CapabilityListPage({ kind = 'skill' }) {
  const meta = KIND_META[kind] || KIND_META.skill
  const { data, source, loading, reload } = useApi(meta.loader, [kind])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [scope, setScope] = useState(kind === 'plugin' ? 'enabled' : 'installed')
  const [selected, setSelected] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const Icon = meta.Icon
  const items = data || []

  const categories = useMemo(() => ['All', ...Array.from(new Set(items.flatMap(itemTags).filter(Boolean)))], [items])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((item) => {
      if (kind === 'skill' && scope === 'installed' && !isInstalledSkill(item)) return false
      if (kind === 'plugin' && scope === 'enabled' && !isEnabledPlugin(item)) return false
      if (cat !== 'All' && !itemTags(item).includes(cat)) return false
      if (!needle) return true
      return [itemName(item), itemSummary(item), item?.author, item?.path, ...itemTags(item)].join(' ').toLowerCase().includes(needle)
    })
  }, [items, q, cat, kind, scope])

  const installedCount = kind === 'skill' ? items.filter(isInstalledSkill).length : items.filter(isEnabledPlugin).length

  return (
    <PageLayout
      kicker={meta.kicker}
      title={meta.title}
      description={meta.description}
      actions={
        <>
          <SourceBadge source={source} />
          {kind === 'skill' && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add skill</Button>}
        </>
      }
      wide
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={'Search installed ' + meta.title.toLowerCase() + '...'} className="pl-10" />
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <button
            onClick={() => setScope(kind === 'plugin' ? 'enabled' : 'installed')}
            className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
              scope !== 'all' ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
          >
            {kind === 'plugin' ? 'Enabled' : 'Installed'} {installedCount}
          </button>
          <button
            onClick={() => setScope('all')}
            className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
              scope === 'all' ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
          >
            All {items.length}
          </button>
          {categories.slice(0, 12).map((c) => (
            <button
              key={c} onClick={() => setCat(c)}
              className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                cat === c ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}
            >{c}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyPanel
          icon={Icon}
          title={'No installed ' + meta.title.toLowerCase()}
          hint={'The broker did not return ' + meta.title.toLowerCase() + '. Verify the VPS broker endpoint for /' + (kind === 'plugin' ? 'plugins' : 'skills') + '.'}
        >
          {kind === 'skill' && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add skill</Button>}
        </EmptyPanel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, i) => (
            <CapabilityCard key={item.id || itemName(item)} item={item} kind={kind} Icon={Icon} index={i} onOpen={() => setSelected(item)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/60 py-16 text-center text-sm text-slate-500">
              No {meta.title.toLowerCase()} match "{q}".
            </div>
          )}
        </div>
      )}

      {selected && <CapabilityFilesDialog kind={kind} item={selected} onClose={() => setSelected(null)} />}
      {addOpen && kind === 'skill' && <AddSkillDialog kind="skill" onClose={() => setAddOpen(false)} onAdded={reload} />}
    </PageLayout>
  )
}

export default function MarketplacePage() {
  return <CapabilityListPage kind="skill" />
}

function CapabilityCard({ item, kind, Icon, index, onOpen }) {
  const tags = itemTags(item)
  const fileCount = Array.isArray(item.files) ? item.files.length : null
  const installed = kind === 'skill' ? isInstalledSkill(item) : isEnabledPlugin(item)
  const readable = kind !== 'skill' || item.readable !== false
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -3 }}
    >
      <Card
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }}
        className="flex h-full cursor-pointer flex-col p-5 transition hover:border-[color:var(--accent)] hover:shadow-[var(--shadow-panel)]"
      >
          <div className="flex items-start justify-between gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-strong)] text-white shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <Badge variant={installed ? 'success' : 'outline'}>{kind === 'plugin' ? (installed ? 'enabled' : 'disabled') : item.status || 'available'}</Badge>
          </div>
          <h3 className="mt-3 truncate text-base font-semibold text-strong">{itemName(item)}</h3>
          <p className="mt-1 flex-1 text-sm text-muted line-clamp-3">{itemSummary(item)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{t}</span>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {kind === 'plugin'
                  ? (item.origin || item.startup || 'Plugin details')
                  : readable
                    ? (fileCount == null ? 'Files available' : fileCount + ' files')
                    : 'Bundled metadata only'}
              </span>
            </span>
            <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 font-semibold text-[color:var(--accent-strong)]">{kind}</span>
          </div>
          <Button type="button" size="sm" className="mt-4 w-full" variant="secondary" onClick={(event) => { event.stopPropagation(); onOpen() }}>
            <FolderOpen className="h-4 w-4" /> {kind === 'plugin' ? 'View details' : 'Open files'}
          </Button>
      </Card>
    </motion.div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ))}
    </div>
  )
}
