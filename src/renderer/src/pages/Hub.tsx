import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { ProjectForm } from './Projects'
import { Button, CategorySelect, CATEGORY_COLOR } from '../components/ui'
import {
  CATEGORY_LABELS,
  type Project,
  type ProjectCategory
} from '@shared/types'
import { openExternal, relativeTime, cn } from '../lib/util'
import { SitePreview } from '../components/SitePreview'
import { IconGit, IconExternal, IconRefresh, IconPlus, IconTrash } from '../components/icons'

// Non-website categories, in the order their sections appear below the website grid.
const NONWEB_ORDER: ProjectCategory[] = ['automation', 'dashboard', 'skill', 'assistant', 'other']

function delMessage(p: Project): string {
  return p.syncState === 'orphaned'
    ? `Remove "${p.name}"? Its repo is already gone from GitHub.`
    : `Delete "${p.name}" from the board?\n\nIt won't be re-added on the next GitHub sync.`
}

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

function GroupLabel({ label, count }: { label: string; count: number }): React.JSX.Element {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">{label}</span>
      <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-muted">{count}</span>
    </div>
  )
}

/* ------------------------- website card (always-open) ------------------------- */

function WebsiteCard({ project }: { project: Project }): React.JSX.Element {
  const openProject = useStore((s) => s.openProject)
  const setCategory = useStore((s) => s.setCategory)
  const removeProject = useStore((s) => s.removeProject)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR.website }} />
        <button onClick={() => openProject(project.id)}
          className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold tracking-tight text-text hover:text-accent">
          {project.name}
        </button>
      </div>

      {/* live preview — always visible */}
      <div className="relative bg-surface-2" style={{ aspectRatio: '16/10' }}>
        <SitePreview url={project.liveUrl} height={260} />
        {project.liveUrl && (
          <button onClick={() => openExternal(project.liveUrl)} className="absolute inset-0" aria-label={`Open ${project.name}`} />
        )}
      </div>

      {/* actions: reclassify · open website · open repo · delete */}
      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
        <CategorySelect value={project.category} onChange={(c) => setCategory(project.id, c)} className="mr-auto" />
        {project.liveUrl && (
          <IconBtn onClick={() => openExternal(project.liveUrl)} title="Open website"><IconExternal className="h-3.5 w-3.5" /></IconBtn>
        )}
        {project.repoUrl && (
          <IconBtn onClick={() => openExternal(project.repoUrl)} title="Open repo"><IconGit className="h-3.5 w-3.5" /></IconBtn>
        )}
        <IconBtn onClick={() => { if (confirm(delMessage(project))) removeProject(project.id) }} title="Delete from board" danger>
          <IconTrash className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
      <div className="px-3 pb-2 text-[10.5px] text-subtle">
        {[project.language, `updated ${relativeTime(project.updatedAt)}`].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

/* --------------------------- non-website repo bar ---------------------------- */

function RepoBar({ project }: { project: Project }): React.JSX.Element {
  const openProject = useStore((s) => s.openProject)
  const setCategory = useStore((s) => s.setCategory)
  const removeProject = useStore((s) => s.removeProject)
  const orphaned = project.syncState === 'orphaned'

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong',
      orphaned && 'opacity-70'
    )}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[project.category] }} />
      <button onClick={() => openProject(project.id)} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13px] font-semibold tracking-tight text-text">{project.name}</div>
        <div className="truncate text-[10.5px] text-subtle">
          {[project.language, project.repoFullName].filter(Boolean).join(' · ') || '—'}
        </div>
      </button>
      {orphaned && (
        <span className="shrink-0 rounded-full bg-amber/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber">off GitHub</span>
      )}
      <span className="hidden shrink-0 text-[10.5px] text-subtle sm:block">{relativeTime(project.updatedAt)}</span>
      <CategorySelect value={project.category} onChange={(c) => setCategory(project.id, c)} />
      <div className="flex shrink-0 items-center gap-1">
        {project.liveUrl && (
          <IconBtn onClick={() => openExternal(project.liveUrl)} title="Open website"><IconExternal className="h-3.5 w-3.5" /></IconBtn>
        )}
        {project.repoUrl && (
          <IconBtn onClick={() => openExternal(project.repoUrl)} title="Open repo"><IconGit className="h-3.5 w-3.5" /></IconBtn>
        )}
        <IconBtn onClick={() => { if (confirm(delMessage(project))) removeProject(project.id) }} title="Delete from board" danger>
          <IconTrash className="h-3.5 w-3.5" />
        </IconBtn>
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
  const [adding, setAdding] = useState(false)
  const connected = githubStatus?.connected

  const { websites, groups, orphans } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (p: Project): boolean =>
      !q || p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q) ||
      p.repoFullName.toLowerCase().includes(q) || p.topics.some((t) => t.toLowerCase().includes(q))
    const byRecent = (a: Project, b: Project): number => b.updatedAt - a.updatedAt

    const active = projects.filter((p) => p.syncState !== 'orphaned' && match(p))
    const websites = active.filter((p) => p.category === 'website').sort(byRecent)
    const groups = NONWEB_ORDER
      .map((cat) => ({ cat, items: active.filter((p) => p.category === cat).sort(byRecent) }))
      .filter((g) => g.items.length > 0)
    const orphans = projects.filter((p) => p.syncState === 'orphaned' && match(p)).sort(byRecent)
    return { websites, groups, orphans }
  }, [projects, query])

  const empty = websites.length === 0 && groups.length === 0 && orphans.length === 0

  return (
    <div className="space-y-6">
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

      {empty ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center">
          <h2 className="text-lg font-bold text-text">Nothing here yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{connected ? 'Sync to pull in your repos.' : 'Connect GitHub and sync.'}</p>
        </div>
      ) : (
        <>
          {/* WEBSITES — live previews, always open, at the top */}
          {websites.length > 0 && (
            <section>
              <GroupLabel label="Websites" count={websites.length} />
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))' }}>
                {websites.map((p) => <WebsiteCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {/* EVERY OTHER REPO — sectioned by category */}
          {groups.map((g) => (
            <section key={g.cat}>
              <GroupLabel label={CATEGORY_LABELS[g.cat]} count={g.items.length} />
              <div className="space-y-2">{g.items.map((p) => <RepoBar key={p.id} project={p} />)}</div>
            </section>
          ))}

          {/* Orphaned — gone from GitHub */}
          {orphans.length > 0 && (
            <section>
              <GroupLabel label="Not on GitHub" count={orphans.length} />
              <div className="space-y-2">{orphans.map((p) => <RepoBar key={p.id} project={p} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
