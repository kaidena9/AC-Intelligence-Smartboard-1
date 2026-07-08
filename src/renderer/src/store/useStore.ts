import { create } from 'zustand'
import type { GithubStatus, Project, ProjectCategory, ProjectStatus, Store } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '@shared/types'
import { reconcileProjects, idKey, nameKey } from '@shared/reconcile'

// Repos the user deleted are tombstoned in localStorage so a GitHub sync won't re-add
// them. Kept out of the zod store doc to avoid a schema migration.
const DISMISSED_KEY = 'wc-dismissed-repos'
function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[] } catch { return [] }
}
function addDismissed(keys: string[]): void {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...readDismissed(), ...keys])])) } catch { /* */ }
}

type View =
  | 'hub'
  | 'dashboard'
  | 'inbox'
  | 'leads'
  | 'whiteboard'
  | 'wizard'
  | 'projects'
  | 'resources'
  | 'settings'
  | 'terminal'
  | 'studio'
  | 'ops'
  | 'brain'
  | 'sessions'
  | 'athena'
  | 'odin'

export interface NewProjectInput {
  name: string
  status?: ProjectStatus
  currentLevel?: number
  liveUrl?: string
  repoUrl?: string
  localPath?: string
  notes?: string
  category?: ProjectCategory
}

export interface SyncResult {
  added: number
  updated: number
  orphaned: number
}

export type HubTab = 'all' | ProjectCategory | 'orphaned'

interface AppState {
  // navigation
  view: View
  selectedProjectId: string | null
  studioProjectId: string | null
  setView: (v: View) => void
  openProject: (id: string) => void
  openStudio: (id: string) => void

  // shared UI state (top bar search + hub filter)
  topQuery: string
  setTopQuery: (q: string) => void
  hubTab: HubTab
  setHubTab: (t: HubTab) => void

  // data
  hydrated: boolean
  projects: Project[]
  hydrate: () => Promise<void>
  addProject: (input: NewProjectInput) => Project
  updateProject: (id: string, patch: Partial<Project>) => void
  removeProject: (id: string) => void
  setCategory: (id: string, category: ProjectCategory) => void
  removeOrphaned: () => number
  toggleSkill: (id: string, level: number, skillId: string) => void
  touchOpened: (id: string) => void

  // github
  githubStatus: GithubStatus | null
  githubSyncing: boolean
  lastSync: SyncResult | null
  checkGithub: () => Promise<void>
  syncFromGitHub: () => Promise<SyncResult>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced write of the whole projects array to disk via the main process. */
function schedulePersist(projects: Project[]): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const payload: Store = { schemaVersion: CURRENT_SCHEMA_VERSION, projects }
    void window.api.store.set(payload)
  }, 400)
}

const now = (): number => Date.now()

export const useStore = create<AppState>((set, get) => ({
  view: 'ops',
  selectedProjectId: null,
  studioProjectId: null,
  setView: (v) => set({ view: v }),
  openProject: (id) => {
    get().touchOpened(id)
    set({ view: 'projects', selectedProjectId: id })
  },
  openStudio: (id) => {
    get().touchOpened(id)
    set({ view: 'studio', studioProjectId: id })
  },

  topQuery: '',
  setTopQuery: (q) => set({ topQuery: q }),
  hubTab: 'all',
  setHubTab: (t) => set({ hubTab: t }),

  hydrated: false,
  projects: [],
  hydrate: async () => {
    const data = await window.api.store.get()
    set({ projects: data.projects, hydrated: true })
  },

  addProject: (input) => {
    const ts = now()
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      currentLevel: input.currentLevel ?? 1,
      status: input.status ?? 'planning',
      liveUrl: input.liveUrl ?? '',
      repoUrl: input.repoUrl ?? '',
      localPath: input.localPath ?? '',
      notes: input.notes ?? '',
      levelProgress: {},
      source: 'manual',
      repoFullName: '',
      repoId: '',
      language: '',
      topics: [],
      // A category chosen in the form is a deliberate choice → lock it.
      category: input.category ?? 'website',
      categoryLocked: input.category != null,
      syncState: 'active',
      lastSyncedAt: 0,
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts
    }
    const projects = [project, ...get().projects]
    set({ projects })
    schedulePersist(projects)
    return project
  },

  updateProject: (id, patch) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: now() } : p
    )
    set({ projects })
    schedulePersist(projects)
  },

  removeProject: (id) => {
    // Tombstone github-sourced repos so the next sync won't re-import them.
    const proj = get().projects.find((p) => p.id === id)
    if (proj?.source === 'github') {
      const keys: string[] = []
      if (proj.repoId) keys.push(idKey(proj.repoId))
      if (proj.repoFullName) keys.push(nameKey(proj.repoFullName))
      if (keys.length) addDismissed(keys)
    }
    const projects = get().projects.filter((p) => p.id !== id)
    const selectedProjectId = get().selectedProjectId === id ? null : get().selectedProjectId
    set({ projects, selectedProjectId })
    schedulePersist(projects)
  },

  setCategory: (id, category) => {
    // A manual pick locks the category so the next sync won't re-infer it.
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, category, categoryLocked: true, updatedAt: now() } : p
    )
    set({ projects })
    schedulePersist(projects)
  },

  removeOrphaned: () => {
    const before = get().projects.length
    const projects = get().projects.filter((p) => p.syncState !== 'orphaned')
    const removed = before - projects.length
    if (removed > 0) {
      set({ projects })
      schedulePersist(projects)
    }
    return removed
  },

  toggleSkill: (id, level, skillId) => {
    const key = String(level)
    const projects = get().projects.map((p) => {
      if (p.id !== id) return p
      const current = p.levelProgress[key] ?? []
      const next = current.includes(skillId)
        ? current.filter((s) => s !== skillId)
        : [...current, skillId]
      return { ...p, levelProgress: { ...p.levelProgress, [key]: next }, updatedAt: now() }
    })
    set({ projects })
    schedulePersist(projects)
  },

  touchOpened: (id) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, lastOpenedAt: now() } : p
    )
    set({ projects })
    schedulePersist(projects)
  },

  githubStatus: null,
  githubSyncing: false,
  lastSync: null,
  checkGithub: async () => {
    try {
      const status = await window.api.github.status()
      set({ githubStatus: status })
    } catch {
      set({ githubStatus: { connected: false, reason: 'error' } })
    }
  },

  syncFromGitHub: async () => {
    set({ githubSyncing: true })
    try {
      // Import ALL owned repos (forks are filtered inside reconcileProjects),
      // auto-categorize, and merge with existing projects.
      const repos = await window.api.github.listRepos()

      // Guard: a transient gh failure / empty response must NOT orphan everything.
      if (!repos || repos.length === 0) {
        const result: SyncResult = { added: 0, updated: 0, orphaned: 0 }
        set({ lastSync: result })
        return result
      }

      const ts = now()
      const { projects, added, updated, orphaned } = reconcileProjects(
        repos,
        get().projects,
        ts,
        () => crypto.randomUUID(),
        new Set(readDismissed())
      )
      const result: SyncResult = { added, updated, orphaned }
      set({ projects, lastSync: result })
      schedulePersist(projects)
      return result
    } finally {
      set({ githubSyncing: false })
    }
  }
}))
