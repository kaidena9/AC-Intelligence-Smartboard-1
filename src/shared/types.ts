import { z } from 'zod'

/**
 * Project status pipeline. Mirrors how a site moves from idea to live.
 */
export const PROJECT_STATUSES = ['planning', 'building', 'review', 'shipped'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/**
 * What kind of thing a project is. Drives the Hub filters. A repo is
 * auto-categorized on import; the user can override (which locks it).
 */
export const PROJECT_CATEGORIES = [
  'website',
  'automation',
  'dashboard',
  'skill',
  'assistant',
  'other'
] as const
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  website: 'Website',
  automation: 'Automation',
  dashboard: 'Dashboard',
  skill: 'Claude Skill',
  assistant: 'Assistant',
  other: 'Other'
}

/** A github-sourced project is 'orphaned' once its repo vanishes from a sync — never auto-deleted. */
export const SYNC_STATES = ['active', 'orphaned'] as const
export type SyncState = (typeof SYNC_STATES)[number]

export const TOTAL_LEVELS = 7

/** Persisted store schema version. Bumped to 2 when categories were added. */
export const CURRENT_SCHEMA_VERSION = 2

/**
 * A single tracked website. Persisted to JSON in Electron's userData.
 * Validated with Zod on every read so a corrupt file can't brick the app.
 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  currentLevel: z.number().int().min(1).max(TOTAL_LEVELS).default(1),
  status: z.enum(PROJECT_STATUSES).default('planning'),
  liveUrl: z.string().default(''),
  repoUrl: z.string().default(''),
  localPath: z.string().default(''),
  notes: z.string().default(''),
  /** Per-level checklist progress: level number -> array of checked skill ids. */
  levelProgress: z.record(z.string(), z.array(z.string())).default({}),
  /** Where this project came from. GitHub-synced projects dedupe on repoId/repoFullName. */
  source: z.enum(['manual', 'github']).default('manual'),
  repoFullName: z.string().default(''),
  /** Stable GitHub repo id; survives renames/transfers. '' for manual projects. */
  repoId: z.string().default(''),
  language: z.string().default(''),
  /** GitHub repo topics, refreshed on sync; feeds auto-categorization. */
  topics: z.array(z.string()).default([]),
  /** Bucket the Hub filters on. Defaults to 'website' so legacy records (all live sites) migrate cleanly. */
  category: z.enum(PROJECT_CATEGORIES).default('website'),
  /** True once the user picks a category by hand — freezes it from sync re-categorization. */
  categoryLocked: z.boolean().default(false),
  /** 'orphaned' = was github-sourced but no longer in the fetched repo set. Never auto-deleted. */
  syncState: z.enum(SYNC_STATES).default('active'),
  lastSyncedAt: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Distinct from updatedAt so the UI can sort by "most recently opened". */
  lastOpenedAt: z.number()
})
export type Project = z.infer<typeof ProjectSchema>

/** The whole persisted document. Versioned so we can migrate later. */
export const StoreSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  projects: z.array(ProjectSchema).default([])
})
export type Store = z.infer<typeof StoreSchema>

export const EMPTY_STORE: Store = { schemaVersion: CURRENT_SCHEMA_VERSION, projects: [] }

/** GitHub integration shapes (shared between main, preload, and renderer). */
export interface GithubStatus {
  connected: boolean
  login?: string
  reason?: 'gh-not-found' | 'not-authenticated' | 'error'
  message?: string
  additionalAccounts?: { login: string }[]
}

export interface GithubRepo {
  name: string
  fullName: string
  /** Stable GitHub repo id as a string. */
  repoId: string
  description: string
  repoUrl: string
  liveUrl: string
  language: string
  topics: string[]
  isPrivate: boolean
  isFork: boolean
  isArchived: boolean
  pushedAt: string
  /** Repo file paths (from the git tree) used by the content-aware classifier. */
  paths: string[]
}

/** Embedded terminal + studio shapes (shared between main, preload, renderer). */
export interface TerminalCreateOpts {
  cwd?: string
  runClaude?: boolean
  cols?: number
  rows?: number
}

export interface PrepareResult {
  localPath?: string
  error?: string
  cloned?: boolean
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  building: 'Building',
  review: 'Review',
  shipped: 'Shipped'
}

/**
 * The combined "AC Intelligence — Master Leads" Google Sheet the Leads tab
 * reads from. Stored in settings so it can be re-pointed without a rebuild.
 */
export const DEFAULT_LEADS_SHEET_ID = '1kktwD9VVaRj7FaBRxzkos3XZsTzHJ0YoyJHP8hwCvyI'

/** One outreach lead, mapped 1:1 from the Prospect-CRM-format sheet columns. */
export interface Lead {
  business: string
  phone: string
  rating: string
  reviewCount: string
  location: string
  websiteStatus: string
  niche: string
  dateAdded: string
  called: string
  outcome: string
  followUp: string
  notes: string
}

/** Result of a live read of the leads sheet (main process → renderer). */
export interface LeadsResult {
  leads: Lead[]
  sheetId: string
  /** Present when the sheet couldn't be read — e.g. 'not-accessible' (not link-shared). */
  error?: string
}
