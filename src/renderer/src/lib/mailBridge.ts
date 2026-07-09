/**
 * Live mail client — talks to the local Agentic OS bridge, which reads consult@'s
 * inbox over IMAP and sends over SMTP. Absent (plain web / bridge down) → the store
 * falls back to the demo mailbox.
 */
import type { EmailMessage, Draft } from './email'

const BRIDGE = 'http://localhost:5177'

export async function fetchMail(): Promise<{ account: string; messages: EmailMessage[] } | null> {
  try {
    const r = await fetch(`${BRIDGE}/api/mail/list?limit=80`, { signal: AbortSignal.timeout(40000) })
    if (!r.ok) return null
    const d = await r.json()
    if (!Array.isArray(d.messages)) return null
    return { account: d.account || '', messages: d.messages as EmailMessage[] }
  } catch { return null }
}

export async function sendMail(d: Draft): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${BRIDGE}/api/mail/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d), signal: AbortSignal.timeout(40000)
    })
    const j = await r.json()
    return { ok: !!j.ok, error: j.error }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

export function markMail(uid: string, patch: { read?: boolean; starred?: boolean }): void {
  fetch(`${BRIDGE}/api/mail/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, ...patch }) }).catch(() => {})
}

export function moveMail(uid: string, folder: 'archive' | 'trash'): void {
  fetch(`${BRIDGE}/api/mail/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, folder }) }).catch(() => {})
}
