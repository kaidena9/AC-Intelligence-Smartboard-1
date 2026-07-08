import type { GithubRepo, Project, ProjectStatus } from './types'
import { classifyRepo } from './categorize'

/**
 * Pure GitHub-sync reconciliation. Kept free of React/Zustand/Electron so it
 * can be reasoned about (and unit-tested) in isolation.
 *
 * Rules (per council review — all aimed at never losing user data):
 *  - Every repo is included (owned, collaborator, org, forks).
 *  - Match an incoming repo to an existing project by stable repoId first,
 *    then by lowercased repoFullName (survives renames; case-insensitive).
 *  - A matched MANUAL project is merged in place (its source flips to github)
 *    so we never create a duplicate of a repo the user added by hand.
 *  - User edits are preserved: a non-empty liveUrl is kept, and the category
 *    is only re-inferred when it isn't locked.
 *  - Repos that disappear are SOFT-deleted: github projects get syncState
 *    'orphaned' (never removed, never touched if manual). Returning repos flip
 *    back to 'active'.
 *  - Callers must guard against empty/failed fetches BEFORE calling this, so a
 *    transient gh failure can't orphan everything.
 */

export interface ReconcileResult {
  projects: Project[]
  added: number
  updated: number
  orphaned: number
}

export const idKey = (repoId: string): string => `id:${repoId}`
export const nameKey = (fullName: string): string => `fn:${fullName.toLowerCase()}`

export function reconcileProjects(
  repos: GithubRepo[],
  existing: Project[],
  ts: number,
  newId: () => string,
  // Repos the user explicitly deleted — reconcile must NOT re-import them on sync.
  dismissed: Set<string> = new Set()
): ReconcileResult {
  const result: Project[] = existing.map((p) => ({ ...p }))

  // Index existing projects for O(1) lookup by either key.
  const index = new Map<string, number>()
  result.forEach((p, i) => {
    if (p.repoId) index.set(idKey(p.repoId), i)
    if (p.repoFullName) index.set(nameKey(p.repoFullName), i)
  })

  // Include every repo — owned, collaborator, org, and forks.
  const fetched = repos
  const fetchedKeys = new Set<string>()
  const newcomers: Project[] = []
  let added = 0
  let updated = 0

  for (const r of fetched) {
    // Skip repos the user deleted — never resurrect them on sync.
    if ((r.repoId && dismissed.has(idKey(r.repoId))) || dismissed.has(nameKey(r.fullName))) continue

    if (r.repoId) fetchedKeys.add(idKey(r.repoId))
    fetchedKeys.add(nameKey(r.fullName))

    const at = (r.repoId ? index.get(idKey(r.repoId)) : undefined) ?? index.get(nameKey(r.fullName))
    if (at !== undefined) {
      const ex = result[at]
      result[at] = {
        ...ex,
        repoId: r.repoId || ex.repoId,
        repoFullName: r.fullName,
        repoUrl: r.repoUrl,
        liveUrl: ex.liveUrl || r.liveUrl,
        language: r.language,
        topics: r.topics,
        source: 'github',
        syncState: 'active',
        category: ex.categoryLocked ? ex.category : classifyRepo(r),
        lastSyncedAt: ts,
        updatedAt: ts
      }
      updated++
    } else {
      const isTest = /test|staging|sandbox|demo/i.test(r.name)
      const status: ProjectStatus = isTest ? 'review' : 'shipped'
      newcomers.push({
        id: newId(),
        name: r.name,
        currentLevel: isTest ? 4 : 7,
        status,
        liveUrl: r.liveUrl,
        repoUrl: r.repoUrl,
        localPath: '',
        notes: r.description,
        levelProgress: {},
        source: 'github',
        repoFullName: r.fullName,
        repoId: r.repoId,
        language: r.language,
        topics: r.topics,
        category: classifyRepo(r),
        categoryLocked: false,
        syncState: 'active',
        lastSyncedAt: ts,
        createdAt: ts,
        updatedAt: ts,
        lastOpenedAt: ts
      })
      added++
    }
  }

  // Newly-imported repos surface at the top, like the old behavior.
  const merged = [...newcomers, ...result]

  // Soft-delete pass: orphan github projects that vanished; revive ones that returned.
  let orphaned = 0
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i]
    if (p.source !== 'github') continue
    const present =
      (p.repoId ? fetchedKeys.has(idKey(p.repoId)) : false) || fetchedKeys.has(nameKey(p.repoFullName))
    if (!present && p.syncState !== 'orphaned') {
      merged[i] = { ...p, syncState: 'orphaned', updatedAt: ts }
      orphaned++
    } else if (present && p.syncState === 'orphaned') {
      merged[i] = { ...p, syncState: 'active' }
    }
  }

  return { projects: merged, added, updated, orphaned }
}
