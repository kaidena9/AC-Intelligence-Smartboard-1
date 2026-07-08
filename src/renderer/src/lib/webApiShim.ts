/**
 * Web API shim — provides the same window.api surface as the Electron preload,
 * implemented with browser-native APIs (localStorage, WebSocket, fetch).
 * Injected in main.tsx when window.api is absent (browser context).
 *
 * Shared-board mode: when a backend URL is configured (baked VITE_BACKEND_URL or
 * localStorage 'wc-backend-url'), GitHub accounts + repos + the project store are
 * read from / written to the shared server so every visitor sees the same board.
 * When no backend is configured, everything falls back to per-browser localStorage.
 */

import type { Store, GithubStatus, GithubRepo, TerminalCreateOpts, PrepareResult, Lead, LeadsResult } from '@shared/types'
import { CURRENT_SCHEMA_VERSION, EMPTY_STORE, StoreSchema, DEFAULT_LEADS_SHEET_ID } from '@shared/types'

// ── Storage keys ───────────────────────────────────────────────────────────

const K_STORE = 'wc-store'
const K_WHITEBOARD = 'wc-whiteboard'
const K_THEME = 'wc-theme'
const K_OPENROUTER = 'wc-openrouter-key'
const K_ACCOUNTS = 'wc-github-accounts'
const K_BACKEND = 'wc-backend-url'
const K_SECRET = 'wc-board-secret'
const K_LEADS_SHEET = 'wc-leads-sheet-id'

// ── Shared-backend config + client ─────────────────────────────────────────

// Vite inlines VITE_-prefixed env at build time; the deploy workflow bakes these
// in so neither user has to configure anything. localStorage overrides for dev.
const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}

function backendUrl(): string {
  return ((localStorage.getItem(K_BACKEND) || ENV.VITE_BACKEND_URL || '') as string).replace(/\/$/, '')
}

function boardSecret(): string {
  return (localStorage.getItem(K_SECRET) || ENV.VITE_BOARD_SECRET || '') as string
}

const K_TOKEN = 'wc-auth-token'
function authToken(): string {
  return localStorage.getItem(K_TOKEN) || sessionStorage.getItem(K_TOKEN) || ''
}

/** Fetch against the shared backend, or return null if none is configured. */
async function boardFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const base = backendUrl()
  if (!base) return null
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {})
  }
  // Prefer the login-gate session token; keep the shared secret as a fallback
  // for servers configured without user login.
  const token = authToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const secret = boardSecret()
  if (secret) headers['X-Board-Secret'] = secret
  if (init?.body) headers['Content-Type'] = 'application/json'
  return fetch(base + path, { ...init, headers })
}

// ── Leads helpers (ported from src/main/leads.ts) ─────────────────────────

function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return (m ? m[1] : input).trim()
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else { field += c }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function rowToLead(r: string[]): Lead {
  const g = (i: number): string => (r[i] ?? '').trim()
  return {
    business: g(0), phone: g(1), rating: g(2), reviewCount: g(3),
    location: g(4), websiteStatus: g(5), niche: g(6), dateAdded: g(7),
    called: g(8), outcome: g(9), followUp: g(10), notes: g(11)
  }
}

async function fetchLeadsFromSheet(sheetId: string): Promise<LeadsResult> {
  const id = extractSheetId(sheetId || DEFAULT_LEADS_SHEET_ID)
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    const body = await res.text()
    const ct = res.headers.get('content-type') || ''
    if (!res.ok || ct.includes('text/html') || body.trimStart().startsWith('<')) {
      return { leads: [], sheetId: id, error: 'not-accessible' }
    }
    const rows = parseCsv(body).filter(r => r.some(c => c.trim() !== ''))
    if (rows.length <= 1) return { leads: [], sheetId: id }
    const leads = rows.slice(1).map(rowToLead).filter(l => l.business !== '')
    return { leads, sheetId: id }
  } catch (e) {
    return { leads: [], sheetId: id, error: e instanceof Error ? e.message : 'fetch-failed' }
  }
}

type ThemePref = 'light' | 'dark' | 'system'

interface GithubAccount { login: string; token: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(K_STORE)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      return StoreSchema.parse(parsed)
    }
  } catch { /* corrupt — fall through */ }
  return structuredClone(EMPTY_STORE)
}

function saveLocalStore(store: Store): Store {
  const validated = StoreSchema.parse(store)
  localStorage.setItem(K_STORE, JSON.stringify(validated))
  return validated
}

function getAccounts(): GithubAccount[] {
  try {
    const raw = localStorage.getItem(K_ACCOUNTS)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown[]
    return arr.filter(
      (a): a is GithubAccount =>
        !!a && typeof (a as GithubAccount).login === 'string' && typeof (a as GithubAccount).token === 'string'
    )
  } catch { return [] }
}

function setAccounts(accounts: GithubAccount[]): void {
  localStorage.setItem(K_ACCOUNTS, JSON.stringify(accounts))
}

// ── GitHub REST helpers (local-fallback path only) ─────────────────────────

const GH_HEADERS = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
})

interface RawRepo {
  id: number; name: string; full_name: string; description: string | null
  html_url: string; homepage: string | null; has_pages: boolean
  language: string | null; topics?: string[]; private: boolean; fork: boolean
  archived: boolean; pushed_at: string; default_branch: string
  owner: { login: string }
}

async function fetchReposForToken(token: string): Promise<GithubRepo[]> {
  const headers = GH_HEADERS(token)
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
    { headers }
  )
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const repos = (await res.json()) as RawRepo[]
  const result: GithubRepo[] = []
  for (const r of repos) {
    const paths = await fetchRepoPaths(r.full_name, r.default_branch, token)
    const pagesUrl = r.has_pages ? `https://${r.owner.login}.github.io/${r.name}/` : ''
    result.push({
      name: r.name, fullName: r.full_name, repoId: String(r.id),
      description: r.description ?? '', repoUrl: r.html_url,
      liveUrl: (r.homepage ?? '').trim() || pagesUrl,
      language: r.language ?? '', topics: r.topics ?? [],
      isPrivate: r.private, isFork: r.fork, isArchived: r.archived, pushedAt: r.pushed_at, paths
    })
  }
  return result
}

async function fetchRepoPaths(fullName: string, branch: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/git/trees/${branch || 'main'}?recursive=1`,
      { headers: GH_HEADERS(token) }
    )
    if (!res.ok) return []
    const data = (await res.json()) as { tree?: { path: string }[] }
    return (data.tree ?? []).map(n => n.path).slice(0, 500)
  } catch { return [] }
}

// ── Terminal WebSocket pool ────────────────────────────────────────────────

const termSockets = new Map<string, WebSocket>()
const termDataListeners = new Map<string, Set<(d: string) => void>>()
const termExitListeners = new Map<string, Set<() => void>>()
const termPendingData = new Map<string, string[]>()

function getBackendUrl(): string {
  return backendUrl()
}

// ── The shim object ────────────────────────────────────────────────────────

export function createWebApi(): typeof window.api {
  return {
    platform: 'web' as NodeJS.Platform,

    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {}
    },

    store: {
      get: async () => {
        // Shared board first; fall back to local on any failure.
        try {
          const res = await boardFetch('/state')
          if (res && res.ok) {
            const data = (await res.json()) as { store?: unknown }
            const parsed = StoreSchema.safeParse(data.store)
            if (parsed.success) {
              localStorage.setItem(K_STORE, JSON.stringify(parsed.data)) // warm local cache
              return parsed.data
            }
          }
        } catch { /* offline / backend down — use local */ }
        return loadStore()
      },
      set: async (store: Store) => {
        const validated = saveLocalStore(store) // always keep a local copy
        try {
          await boardFetch('/state', { method: 'POST', body: JSON.stringify({ store: validated }) })
        } catch { /* offline — local copy already saved */ }
        return validated
      }
    },

    settings: {
      get: async () => ({
        theme: (localStorage.getItem(K_THEME) ?? 'system') as ThemePref,
        leadsSheetId: localStorage.getItem(K_LEADS_SHEET) || DEFAULT_LEADS_SHEET_ID
      }),
      setTheme: async (theme: ThemePref) => {
        localStorage.setItem(K_THEME, theme)
        return { theme, leadsSheetId: localStorage.getItem(K_LEADS_SHEET) || DEFAULT_LEADS_SHEET_ID }
      },
      shouldUseDark: async () => {
        const t = localStorage.getItem(K_THEME) ?? 'system'
        return t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      },
      hasApiKey: async () => Boolean(localStorage.getItem(K_OPENROUTER)),
      setApiKey: async (key: string) => {
        if (key.trim()) localStorage.setItem(K_OPENROUTER, key.trim())
        else localStorage.removeItem(K_OPENROUTER)
        return Boolean(key.trim())
      }
    },

    image: {
      generate: async (prompt: string) => {
        const key = localStorage.getItem(K_OPENROUTER)
        if (!key) return { error: 'No OpenRouter API key. Add one in Settings.' }
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-3.1-flash-image-preview',
              messages: [{ role: 'user', content: prompt }],
              modalities: ['image', 'text']
            })
          })
          if (!res.ok) return { error: `OpenRouter ${res.status}: ${(await res.text()).slice(0, 160)}` }
          const data = (await res.json()) as {
            choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]
          }
          const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url
          if (!url) return { error: 'No image returned by the model.' }
          return { dataUrl: url }
        } catch (e) {
          return { error: (e as Error).message }
        }
      },
      save: async (dataUrl: string, name: string) => {
        try {
          const a = document.createElement('a')
          a.href = dataUrl
          const safe = (name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40) || 'image').toLowerCase()
          a.download = `${safe}.png`
          a.click()
          return { path: name }
        } catch (e) {
          return { error: (e as Error).message }
        }
      }
    },

    whiteboard: {
      get: async () => {
        try {
          return JSON.parse(localStorage.getItem(K_WHITEBOARD) ?? '{"items":[]}') as { items: unknown[] }
        } catch { return { items: [] } }
      },
      set: async (data: unknown) => {
        localStorage.setItem(K_WHITEBOARD, JSON.stringify(data))
      }
    },

    shell: {
      openExternal: async (url: string) => {
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      },
      openPath: async (_path: string) => '',
      showItemInFolder: async (_path: string) => {}
    },

    github: {
      status: async (): Promise<GithubStatus> => {
        // Shared board: read the server's account list.
        try {
          const res = await boardFetch('/github/status')
          if (res && res.ok) return (await res.json()) as GithubStatus
        } catch { /* fall through to local */ }
        const accounts = getAccounts()
        if (!accounts.length) return { connected: false, reason: 'not-authenticated' }
        return {
          connected: true,
          login: accounts[0].login,
          additionalAccounts: accounts.slice(1).map(a => ({ login: a.login }))
        }
      },
      listRepos: async (): Promise<GithubRepo[]> => {
        // Local bridge first (desktop app): gh CLI = full keyring auth, so it sees every
        // private collaborator/org repo the board's token can't. Absent in plain web → skip.
        try {
          const res = await fetch('http://localhost:5177/api/github/repos', { signal: AbortSignal.timeout(60000) })
          if (res.ok) {
            const repos = (await res.json()) as GithubRepo[]
            if (Array.isArray(repos) && repos.length) return repos
          }
        } catch { /* no bridge — fall through */ }
        // Shared board: server keeps a merged, always-current repo list.
        try {
          const res = await boardFetch('/github/repos?refresh=1')
          if (res && res.ok) return (await res.json()) as GithubRepo[]
        } catch { /* fall through to local */ }
        const accounts = getAccounts()
        if (!accounts.length) return []
        const seen = new Set<string>()
        const all: GithubRepo[] = []
        for (const acc of accounts) {
          try {
            const repos = await fetchReposForToken(acc.token)
            for (const r of repos) {
              if (!seen.has(r.repoId)) { seen.add(r.repoId); all.push(r) }
            }
          } catch { /* one bad token shouldn't break everything */ }
        }
        return all
      },
      addAccount: async (token: string) => {
        if (!token.trim()) return { error: 'Invalid token' }
        // Shared board: hand the token to the server (encrypted at rest, shared by all).
        try {
          const res = await boardFetch('/github/accounts', {
            method: 'POST',
            body: JSON.stringify({ token: token.trim() })
          })
          if (res) {
            const data = (await res.json()) as { login?: string; error?: string }
            if (res.ok && data.login) return { login: data.login }
            return { error: data.error || 'Could not connect account' }
          }
        } catch { /* fall through to local */ }
        // Local fallback (no backend configured)
        try {
          const res = await fetch('https://api.github.com/user', { headers: GH_HEADERS(token.trim()) })
          if (!res.ok) return { error: 'Token is invalid or GitHub is unreachable' }
          const user = (await res.json()) as { login: string }
          const accounts = getAccounts()
          if (accounts.some(a => a.login === user.login)) return { error: `@${user.login} is already connected` }
          setAccounts([...accounts, { login: user.login, token: token.trim() }])
          return { login: user.login }
        } catch {
          return { error: 'Token is invalid or GitHub is unreachable' }
        }
      },
      removeAccount: async (login: string) => {
        try {
          const res = await boardFetch(`/github/accounts/${encodeURIComponent(login)}`, { method: 'DELETE' })
          if (res && res.ok) return
        } catch { /* fall through to local */ }
        setAccounts(getAccounts().filter(a => a.login !== login))
      }
    },

    terminal: {
      create: async (opts: TerminalCreateOpts): Promise<string> => {
        const backend = getBackendUrl()
        if (!backend) throw new Error('NO_BACKEND_URL')
        const token = authToken()
        const wsUrl =
          backend.replace(/^https/, 'wss').replace(/^http/, 'ws') +
          '/terminal' +
          (token ? `?token=${encodeURIComponent(token)}` : '')
        const ws = new WebSocket(wsUrl)

        return new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => { ws.close(); reject(new Error('Connection timeout')) }, 8000)
          let termId: string | null = null

          ws.onopen = () => { ws.send(JSON.stringify({ type: 'create', ...opts })) }

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string) as { type: string; id?: string; data?: string }

              if (msg.type === 'created' && !termId) {
                clearTimeout(timeout)
                termId = msg.id!
                termSockets.set(termId, ws)
                termDataListeners.set(termId, new Set())
                termExitListeners.set(termId, new Set())
                termPendingData.set(termId, [])

                ws.onmessage = (e) => {
                  try {
                    const m = JSON.parse(e.data as string) as { type: string; data?: string }
                    const id = termId!
                    if (m.type === 'data') {
                      const listeners = termDataListeners.get(id)
                      if (listeners && listeners.size > 0) {
                        listeners.forEach(cb => cb(m.data!))
                      } else {
                        termPendingData.get(id)?.push(m.data!)
                      }
                    } else if (m.type === 'exit') {
                      termExitListeners.get(id)?.forEach(cb => cb())
                    }
                  } catch { /* ignore */ }
                }

                resolve(termId)
              }
            } catch { /* ignore */ }
          }

          ws.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to connect to terminal server')) }
        })
      },

      onData: (id: string, cb: (data: string) => void) => {
        const listeners = termDataListeners.get(id)
        if (!listeners) return () => {}
        listeners.add(cb)
        const pending = termPendingData.get(id)
        if (pending && pending.length > 0) {
          const flushed = [...pending]
          termPendingData.set(id, [])
          flushed.forEach(d => cb(d))
        }
        return () => { listeners.delete(cb) }
      },

      onExit: (id: string, cb: () => void) => {
        const listeners = termExitListeners.get(id)
        if (!listeners) return () => {}
        listeners.add(cb)
        return () => { listeners.delete(cb) }
      },

      write: (id: string, data: string) => {
        termSockets.get(id)?.send(JSON.stringify({ type: 'input', id, data }))
      },

      resize: (id: string, cols: number, rows: number) => {
        termSockets.get(id)?.send(JSON.stringify({ type: 'resize', id, cols, rows }))
      },

      kill: (id: string) => {
        termSockets.get(id)?.send(JSON.stringify({ type: 'kill', id }))
        termSockets.get(id)?.close()
        termSockets.delete(id)
        termDataListeners.delete(id)
        termExitListeners.delete(id)
        termPendingData.delete(id)
      }
    },

    studio: {
      prepareRepo: async (_repoFullName: string): Promise<PrepareResult> => ({
        error: 'Studio cloning is not available in the web version.'
      })
    },

    leads: {
      fetch: async (): Promise<LeadsResult> => {
        const sheetId = localStorage.getItem(K_LEADS_SHEET) || DEFAULT_LEADS_SHEET_ID
        return fetchLeadsFromSheet(sheetId)
      },
      getSheetId: async (): Promise<string> =>
        localStorage.getItem(K_LEADS_SHEET) || DEFAULT_LEADS_SHEET_ID,
      setSheetId: async (idOrUrl: string): Promise<string> => {
        const id = extractSheetId(idOrUrl)
        localStorage.setItem(K_LEADS_SHEET, id)
        return id
      }
    }
  }
}

// ── Export a flag so components can detect web mode ────────────────────────
export const IS_WEB = true
export { K_BACKEND }

// ── Migrate legacy store if needed ────────────────────────────────────────
export function migrateWebStore(): void {
  const raw = localStorage.getItem(K_STORE)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: number }
    if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      parsed.schemaVersion = CURRENT_SCHEMA_VERSION
      localStorage.setItem(K_STORE, JSON.stringify(parsed))
    }
  } catch { localStorage.removeItem(K_STORE) }
}
