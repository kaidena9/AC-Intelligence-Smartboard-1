/**
 * Lead call-workflow state, stored in the dashboard (localStorage), layered on top of
 * the read-only Google Sheet. The sheet is the SOURCE of leads; this is Kaiden's live
 * working state — whether he's called, his notes, and the chosen next step. Keyed by
 * business + phone so it survives sheet re-fetches and row reorders.
 */
import type { Lead } from '@shared/types'

export interface LeadAction {
  called: boolean
  notes: string
  outcome: string // '' | 'callback' | 'email' | 'nocall'
  updatedAt: number
}

export const OUTCOMES: { id: string; label: string; color: string; hint: string }[] = [
  { id: 'callback', label: 'Call back', color: 'var(--amber)', hint: 'reach out again' },
  { id: 'email', label: 'Email follow-up', color: 'var(--cyan)', hint: 'send an email next' },
  { id: 'nocall', label: "Don't contact again", color: 'var(--red)', hint: 'dead lead' }
]
export const outcomeMeta = (id: string): (typeof OUTCOMES)[number] | undefined => OUTCOMES.find((o) => o.id === id)

const KEY = 'wc-lead-actions'

export const leadKey = (l: Pick<Lead, 'business' | 'phone'>): string =>
  `${l.business}|${l.phone}`.toLowerCase().trim()

export function loadActions(): Record<string, LeadAction> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, LeadAction> } catch { return {} }
}

function persist(actions: Record<string, LeadAction>): void {
  try { localStorage.setItem(KEY, JSON.stringify(actions)) } catch { /* quota */ }
}

/** Merge a patch into one lead's action and persist; returns the new map (for setState). */
export function patchAction(
  actions: Record<string, LeadAction>,
  key: string,
  patch: Partial<LeadAction>
): Record<string, LeadAction> {
  const prev = actions[key] ?? { called: false, notes: '', outcome: '', updatedAt: 0 }
  const next = { ...actions, [key]: { ...prev, ...patch, updatedAt: Date.now() } }
  persist(next)
  return next
}

/** Affirmative values the source sheet might carry in its "Called?" column. */
export function sheetCalled(l: Lead): boolean {
  const v = l.called.trim().toLowerCase()
  return v === 'y' || v === 'yes' || v === 'true' || v === '✓' || v === 'x' || v === 'done'
}

/** The effective, display state: dashboard action overrides the sheet's original values. */
export function effective(l: Lead, a?: LeadAction): { called: boolean; notes: string; outcome: string } {
  return {
    called: a ? a.called : sheetCalled(l),
    notes: a && a.notes !== undefined ? a.notes || l.notes : l.notes,
    outcome: a?.outcome || l.outcome || ''
  }
}
