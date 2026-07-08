import { useMemo, useState } from 'react'
import { useStore, type HubTab } from '../store/useStore'
import { ProjectForm } from './Projects'
import { Button, CategorySelect, CATEGORY_COLOR } from '../components/ui'
import {
  CATEGORY_LABELS,
  PROJECT_CATEGORIES,
  type Project
} from '@shared/types'
import { openExternal, revealPath, relativeTime, cn } from '../lib/util'
import { SitePreview } from '../components/SitePreview'
import { IconGit, IconExternal, IconCode, IconFolder, IconRefresh, IconPlus, IconTrash } from '../components/icons'

type SortKey = 'name' | 'category' | 'updated'

/* ------------------------------ small icon button ------------------------------ */

function IconBtn({
  onClick, title, danger, children
}: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-bg transition',
        danger ? 'text-muted hover:border-red hover:text-red' : 'text-muted hover:border-accent hover:text-accent'
      )}
    >
      {children}
    </button>
  )
}

/* --------------------------------- table row --------------------------------- */

function RepoRow({ project }: { project: Project }): React.JSX.Element {
  const openProject = useStore((s) => s.openProject)
  const openStudio = useStore((s) => s.openStudio)
  const setCategory = useStore((s) => s.setCategory)
  const removeProject = useStore((s) => s.removeProject)
  const canEdit = Boolean(project.repoFullName || project.localPath)
  const orphaned = project.syncState === 'orphaned'

  function del(): void {
    const msg = orphaned
      ? `Remove "${project.name}"? Its repo is already gone from GitHub.`
      : `Delete "${project.name}" from the board?\n\nIt won't be re-added on the next GitHub sync.`
    if (confirm(msg)) removeProject(project.id)
  }

  return (
    <tr className={cn('border-b border-border/60 transition hover:bg-surface/60', orphaned && 'opacity-70')}>
      {/* name */}
      <td className="py-2 pl-3 pr-2">
        <button onClick={() => openProject(project.id)} className="flex w-full items-center gap-2.5 text-left">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[project.category] }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold tracking-tight text-text">{project.name}</span>
            <span className="block truncate text-[10.5px] text-subtle">{project.repoFullName || project.localPath || '—'}</span>
          </span>
          {orphaned && (
            <span className="shrink-0 rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber">off GitHub</span>
          )}
        </button>
      </td>
      {/* category — editable on EVERY row */}
      <td className="px-2">
        <CategorySelect value={project.category} onChange={(c) => setCategory(project.id, c)} />
      </td>
      {/* language */}
      <td className="whitespace-nowrap px-2 text-[11.5px] text-muted">{project.language || '—'}</td>
      {/* updated */}
      <td className="whitespace-nowrap px-2 text-[11.5px] text-subtle">{relativeTime(project.updatedAt)}</td>
      {/* actions */}
      <td className="py-2 pl-2 pr-3">
        <div className="flex items-center justify-end gap-1">
          {project.liveUrl && (
            <IconBtn onClick={() => openExternal(project.liveUrl)} title="Open live"><IconExternal className="h-3.5 w-3.5" /></IconBtn>
          )}
          {project.repoUrl && (
            <IconBtn onClick={() => openExternal(project.repoUrl)} title="GitHub repo"><IconGit className="h-3.5 w-3.5" /></IconBtn>
          )}
          {canEdit && (
            <IconBtn onClick={() => openStudio(project.id)} title="Edit in Studio"><IconCode className="h-3.5 w-3.5" /></IconBtn>
          )}
          {project.localPath && (
            <IconBtn onClick={() => revealPath(project.localPath)} title="Reveal folder"><IconFolder className="h-3.5 w-3.5" /></IconBtn>
          )}
          <IconBtn onClick={del} title="Delete from board" danger><IconTrash className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </td>
    </tr>
  )
}

/* ------------------------------- website card -------------------------------- */

function WebsiteCard({ project }: { project: Project }): React.JSX.Element {
  const openProject = useStore((s) => s.openProject)
  const openStudio = useStore((s) => s.openStudio)
  const canEdit = Boolean(project.repoFullName || project.localPath)

  return (
    <div className="group flex flex-col border-b border-r border-border">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR.website }} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{project.name}</span>
      </div>
      <div className="relative overflow-hidden bg-surface-2" style={{ aspectRatio: '4/3' }}>
        <SitePreview url={project.liveUrl} height={320} />
        <div className="absolute inset-0 flex flex-col justify-between p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => openProject(project.id)} className="absolute inset-0" aria-label={`Open ${project.name}`} />
          <div className="relative ml-auto flex items-center gap-1.5">
            {project.liveUrl && (
              <button onClick={(e) => { e.stopPropagation(); openExternal(project.liveUrl) }}
                className="rounded bg-bg/90 px-2.5 py-1 text-[11px] font-medium text-text backdrop-blur-sm transition hover:bg-bg">Visit ↗</button>
            )}
            {canEdit && (
              <button onClick={(e) => { e.stopPropagation(); openStudio(project.id) }}
                className="bg-ink rounded px-2.5 py-1 text-[11px] font-medium text-[var(--ink-fg)] transition hover:opacity-90">Edit</button>
            )}
          </div>
        </div>
      </div>
      <div className="px-4 py-2 text-[11px] text-muted">
        {[project.language, `updated ${relativeTime(project.updatedAt)}`].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

/* ------------------------------------ page ----------------------------------- */

export function Hub(): React.JSX.Element {
  const projects = useStore((s) => s.projects)
  const githubStatus = useStore((s) => s.githubStatus)
  const githubSyncing = useStore((s) => s.githubSyncing)
  const lastSync = useStore((s) => s.lastSync)
  const syncFromGitHub = useStore((s) => s.syncFromGitHub)
  const addProject = useStore((s) => s.addProject)
  const query = useStore((s) => s.topQuery)
  const hubTab = useStore((s) => s.hubTab)
  const setHubTab = useStore((s) => s.setHubTab)
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'updated', dir: -1 })
  const [galleryOpen, setGalleryOpen] = useState(false)
  const connected = githubStatus?.connected

  const q = query.trim().toLowerCase()
  const match = useMemo(() => (p: Project): boolean =>
    !q || p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q) ||
    p.repoFullName.toLowerCase().includes(q) || p.topics.some((t) => t.toLowerCase().includes(q)),
  [q])

  // Per-filter counts for the chip row.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, orphaned: 0 }
    for (const cat of PROJECT_CATEGORIES) c[cat] = 0
    for (const p of projects) {
      if (!match(p)) continue
      if (p.syncState === 'orphaned') { c.orphaned++; continue }
      c.all++; c[p.category]++
    }
    return c
  }, [projects, match])

  // Rows for the current filter + sort.
  const rows = useMemo(() => {
    let list = projects.filter(match)
    if (hubTab === 'orphaned') list = list.filter((p) => p.syncState === 'orphaned')
    else {
      list = list.filter((p) => p.syncState !== 'orphaned')
      if (hubTab !== 'all') list = list.filter((p) => p.category === hubTab)
    }
    const cmp = (a: Project, b: Project): number => {
      const r = sort.key === 'name' ? a.name.localeCompare(b.name)
        : sort.key === 'category' ? a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        : a.updatedAt - b.updatedAt
      return r * sort.dir
    }
    return [...list].sort(cmp)
  }, [projects, match, hubTab, sort])

  const websites = useMemo(
    () => projects.filter((p) => p.syncState !== 'orphaned' && p.category === 'website' && match(p)),
    [projects, match]
  )

  const filters: { id: HubTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    ...PROJECT_CATEGORIES.map((c) => ({ id: c as HubTab, label: CATEGORY_LABELS[c], count: counts[c] })),
    { id: 'orphaned' as HubTab, label: 'Not on GitHub', count: counts.orphaned }
  ]

  function toggleSort(k: SortKey): void {
    setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: k === 'updated' ? -1 : 1 }))
  }
  const arrow = (k: SortKey): string => (sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : '')

  const noRepos = projects.length === 0

  return (
    <div className="space-y-4">
      {/* GitHub connection */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', connected ? 'bg-emerald/15 text-emerald' : 'bg-bg text-subtle')}>
            <IconGit className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold tracking-tight text-text">
              {connected ? `Connected as ${githubStatus?.login}` : 'GitHub not connected'}
            </div>
            <div className="text-xs text-muted">
              {connected
                ? lastSync
                  ? `Last sync: +${lastSync.added} new · ${lastSync.updated} updated${lastSync.orphaned ? ` · ${lastSync.orphaned} orphaned` : ''}`
                  : 'Reads each repo to sort it into the right category.'
                : 'Run `gh auth login`, then sync.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <Button variant="subtle" onClick={() => void syncFromGitHub()} disabled={githubSyncing}>
              <IconRefresh className={cn('h-4 w-4', githubSyncing && 'animate-spin')} />
              {githubSyncing ? 'Syncing…' : 'Sync GitHub'}
            </Button>
          )}
          <Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Add manually</Button>
        </div>
      </div>

      {adding && (
        <ProjectForm onClose={() => setAdding(false)} onSave={(data) => { addProject(data); setAdding(false) }} />
      )}

      {noRepos ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-text">Nothing here yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{connected ? 'Sync to pull in your repos.' : 'Connect GitHub and sync.'}</p>
        </div>
      ) : (
        <>
          {/* filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.filter((f) => f.id === 'all' || f.count > 0).map((f) => (
              <button key={f.id} onClick={() => setHubTab(f.id)}
                className={cn('rounded-full border px-3 py-1 text-[12px] font-medium transition',
                  hubTab === f.id ? 'border-accent/60 bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-text')}>
                {f.label} <span className="text-[10px] opacity-70">{f.count}</span>
              </button>
            ))}
          </div>

          {/* dense table */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-subtle">
                  <th className="py-2 pl-3 pr-2"><button onClick={() => toggleSort('name')} className="hover:text-text">Repo{arrow('name')}</button></th>
                  <th className="px-2"><button onClick={() => toggleSort('category')} className="hover:text-text">Category{arrow('category')}</button></th>
                  <th className="px-2">Lang</th>
                  <th className="px-2"><button onClick={() => toggleSort('updated')} className="hover:text-text">Updated{arrow('updated')}</button></th>
                  <th className="py-2 pl-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => <RepoRow key={p.id} project={p} />)}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted">No repos in this filter.</div>
            )}
          </div>

          {/* collapsible live website gallery */}
          {websites.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface">
              <button onClick={() => setGalleryOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface/60">
                <span className="text-[12.5px] font-semibold text-text">
                  {galleryOpen ? '▾' : '▸'} Website gallery <span className="font-normal text-subtle">— {websites.length} live preview{websites.length > 1 ? 's' : ''}</span>
                </span>
                <span className="text-[11px] text-subtle">{galleryOpen ? 'hide' : 'show'}</span>
              </button>
              {galleryOpen && (
                <div className="grid border-t border-border" style={{ gridTemplateColumns: `repeat(${Math.min(websites.length, 3)}, minmax(0, 1fr))` }}>
                  {websites.map((p) => <WebsiteCard key={p.id} project={p} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
