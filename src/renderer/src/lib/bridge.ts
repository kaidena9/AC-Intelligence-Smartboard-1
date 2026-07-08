/**
 * Client for the local Agentic OS bridge (http://localhost:5177).
 * Lights up the System tabs (Ops / Brain / Sessions) when Kaiden's Mac is
 * running the bridge; everything degrades to a clear offline state otherwise.
 */

const BRIDGE = 'http://localhost:5177'

async function get<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(`${BRIDGE}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function bridgeOnline(): Promise<boolean> {
  return (await get<{ ok: boolean }>('/api/hub/ping', 2500))?.ok === true
}

export interface BridgeStatus {
  projects: { name: string; branch: string; date: string; msg: string; dirty: number; freight: boolean; live: string | null; liveStatus: string | null }[]
  freight: { loggedIn: boolean; apps: { app: string; label: string; state: string }[]; lastTriage: { when: string; verdict: string; note: string } | null; latestIncident: string | null }
  pulse: { days: string[]; commitsPerDay: number[]; commits7: number; velocity: number; runsPerDay: number[]; runsTotal: number }
  claude: { runs: { skill: string; when: string; verdict: string; worked: string }[]; wip: { project: string; head: string }[] }
}
export const fetchStatus = (): Promise<BridgeStatus | null> => get<BridgeStatus>('/api/status', 60000)

export interface SessionGrade {
  score: number; headline: string; strengths: string[]; improvements: string[]; powerTips: string[]
  gradedAt: string; stats: { msgCount: number; assistantTurns: number; toolCalls: number; durationMin: number | null }
}
export interface SessionRow { id: string; project: string; mtime: string; sizeMB: number; grade: SessionGrade | null }
export const fetchSessions = (): Promise<{ sessions: SessionRow[]; gradingBusy: boolean } | null> =>
  get('/api/hub/sessions', 20000)

export async function gradeSession(id: string): Promise<SessionGrade | { error: string }> {
  try {
    const res = await fetch(`${BRIDGE}/api/hub/sessions/${id}/grade`, {
      method: 'POST',
      signal: AbortSignal.timeout(200000)
    })
    return (await res.json()) as SessionGrade | { error: string }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export interface VaultNode { type: 'dir' | 'file'; name: string; path: string; mtime?: string; children?: VaultNode[] }
export const fetchVaultTree = (): Promise<{ root: string; notes: number; tree: VaultNode[] } | null> =>
  get('/api/vault/tree', 15000)
export const fetchVaultFile = (p: string): Promise<{ path: string; content: string } | null> =>
  get(`/api/vault/file?p=${encodeURIComponent(p)}`, 15000)

/** Fleet health comes from the Railway backend (works for everyone, no bridge needed). */
export interface FleetSite { name: string; url: string; status: number; ok: boolean; ms: number }
export async function fetchFleet(): Promise<{ checkedAt: number; sites: FleetSite[] } | null> {
  const K_BACKEND = 'wc-backend-url'
  const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
  const base = ((localStorage.getItem(K_BACKEND) || ENV.VITE_BACKEND_URL || '') as string).replace(/\/$/, '')
  const token = localStorage.getItem('wc-auth-token') || sessionStorage.getItem('wc-auth-token') || ''
  if (!base) return null
  try {
    const res = await fetch(`${base}/fleet`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return null
    return (await res.json()) as { checkedAt: number; sites: FleetSite[] }
  } catch {
    return null
  }
}

export interface BrainEvent { t: string; kind: 'tool' | 'say' | 'user'; label: string }
export const fetchBrainFeed = (): Promise<{ active: boolean; events: BrainEvent[] } | null> =>
  get('/api/hub/brainfeed', 8000)

/* Command deck — allowlisted read-only/dry-run skills on the bridge. */
export interface DeckCommand { key: string; prompt: string }
export interface DeckJob { id: number; key: string; status: string; startedAt: string; endedAt: string | null; tail?: string }
export const fetchCommands = (): Promise<DeckCommand[] | null> => get('/api/commands', 8000)
export const fetchJobs = (): Promise<DeckJob[] | null> => get('/api/jobs', 8000)
export async function runCommand(key: string): Promise<{ id?: number; error?: string }> {
  try {
    const res = await fetch('http://localhost:5177/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }), signal: AbortSignal.timeout(8000) })
    return await res.json()
  } catch (e) { return { error: (e as Error).message } }
}

/* Agent conversations (Odin / Athena) — memory, recall & agent-specific grading. */
export interface AgentGrade { score: number; headline: string; strengths: string[]; improvements: string[]; powerTips: string[]; gradedAt: string }
export interface AgentSessionRow { id: string; title: string; savedAt: string; msgCount: number; models: string[]; grade: AgentGrade | null }
export interface AgentMsg { role: 'user' | 'assistant'; content: string }
export const fetchAgentSessions = (agent: string): Promise<{ sessions: AgentSessionRow[] } | null> => get(`/api/agent/${agent}/sessions`, 12000)
export const fetchAgentSession = (agent: string, id: string): Promise<{ id: string; title: string; messages: AgentMsg[]; models: string[] } | null> => get(`/api/agent/${agent}/session/${id}`, 12000)
export async function saveAgentSession(agent: string, id: string, messages: AgentMsg[], models: string[]): Promise<void> {
  try {
    await fetch(`${BRIDGE}/api/agent/${agent}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, messages, models }), signal: AbortSignal.timeout(6000) })
  } catch { /* offline — kept in localStorage regardless */ }
}
export async function gradeAgentSession(agent: string, id: string): Promise<AgentGrade | { error: string }> {
  try {
    const res = await fetch(`${BRIDGE}/api/agent/${agent}/sessions/${id}/grade`, { method: 'POST', signal: AbortSignal.timeout(200000) })
    return await res.json()
  } catch (e) { return { error: (e as Error).message } }
}
export async function gradeAllAgent(agent: string): Promise<{ running: boolean; total: number } | null> {
  try { const res = await fetch(`${BRIDGE}/api/agent/${agent}/grade-all`, { method: 'POST', signal: AbortSignal.timeout(8000) }); return await res.json() } catch { return null }
}

/* Coaching report — aggregate insights across all graded sessions of a source. */
export interface CoachReport {
  source: string; count: number; avg: number | null
  trend: number[]; distribution: Record<string, number>
  topFixes: string[]; strengths: string[]
  synthPending?: boolean
}
// Returns instantly now (stats from disk); themes fill in via synthPending polling.
export const fetchCoachReport = (source: string): Promise<CoachReport | null> =>
  get(`/api/hub/coach-report?source=${source}`, 15000)
