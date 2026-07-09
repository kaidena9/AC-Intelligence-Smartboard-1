/**
 * Content-aware inbox sorting. Reads each email's sender, subject, and body and sorts
 * it into a category. Confident matches land in their category; anything uncertain is
 * FLAGGED and left in the global "All Mail" only — never force-filed. A manual move
 * (stored per-message) always wins and clears the flag.
 */
import type { EmailMessage } from './email'

export type Category = 'pipeline' | 'clients' | 'internal' | 'notifications'

export const CATEGORY_META: Record<Category, { label: string; color: string; desc: string }> = {
  pipeline: { label: 'Pipeline', color: 'var(--accent)', desc: 'Website leads & form submissions' },
  clients: { label: 'Clients', color: 'var(--emerald)', desc: 'Replies from prospects & clients' },
  internal: { label: 'Internal', color: 'var(--violet)', desc: 'You & the team (Frankie, AC Intelligence)' },
  notifications: { label: 'Notifications', color: 'var(--cyan)', desc: 'Automated & system mail' }
}
export const CATEGORY_ORDER: Category[] = ['pipeline', 'clients', 'internal', 'notifications']

// Team addresses/domains → Internal. Add more here as the team grows.
const INTERNAL_DOMAINS = ['acintelligence.net', 'acintelligence.co']
const INTERNAL_ADDRS = ['frankie.campbell.chicago@gmail.com']
// Automated / no-reply senders → Notifications.
const NOTIF_SENDER = /(^|[.<])(no-?reply|do-?not-?reply|notifications?|updates?|receipts?|news|mailer|ci|builds?|automated|team|support|alerts?)@|@(github|vercel|netlify|railway|stripe|figma|anthropic|google|slack|discord|calendly|shopify|squarespace|wix|godaddy|mailchimp|intercom|quickbooks|zoom)\./i
// Website pipeline / lead-form language.
const PIPELINE_RE = /\b(new lead|new form|form submission|contact form|new message from your|new (inquiry|enquiry)|quote request|website (inquiry|lead|submission)|someone (submitted|filled out)|new submission|booking request|new appointment|form on your (site|website))\b/i

export interface Classification {
  category: Category | null // where it's filed (null = only in All Mail)
  auto: Category | null // what the classifier guessed
  confidence: number // 0..1
  flagged: boolean // low confidence — stays in All Mail, marked
  manual: boolean // user moved it here
}

const K_OVERRIDES = 'wc-email-cats'
function overrides(): Record<string, Category> {
  try { return JSON.parse(localStorage.getItem(K_OVERRIDES) || '{}') } catch { return {} }
}
export function setCategoryOverride(id: string, cat: Category | null): void {
  const o = overrides()
  if (cat) o[id] = cat; else delete o[id]
  try { localStorage.setItem(K_OVERRIDES, JSON.stringify(o)) } catch { /* */ }
}

const THRESHOLD = 0.6

export function classify(m: EmailMessage): Classification {
  const from = (m.from.email || '').toLowerCase()
  const dom = from.split('@')[1] || ''
  const hay = `${m.subject} ${m.preview} ${m.body}`.toLowerCase()

  let auto: Category | null = null
  let confidence = 0.3
  if (INTERNAL_ADDRS.includes(from) || INTERNAL_DOMAINS.includes(dom)) {
    auto = 'internal'; confidence = 0.95
  } else if (PIPELINE_RE.test(hay) || (/^(leads?|forms?|hello|info|contact)@/.test(from) && /lead|form|submission|inquiry|message/.test(hay))) {
    auto = 'pipeline'; confidence = 0.9
  } else if (NOTIF_SENDER.test(from)) {
    auto = 'notifications'; confidence = 0.85
  } else if (/^re:/i.test(m.subject.trim())) {
    // A reply from a real person we don't otherwise recognize — probably a prospect/client,
    // but not certain, so medium confidence.
    auto = 'clients'; confidence = 0.62
  } else if (dom && !NOTIF_SENDER.test(from) && /\b(interested|quote|pricing|website|call|meeting|available|schedule|book|thanks for reaching)\b/.test(hay)) {
    auto = 'clients'; confidence = 0.55
  }

  const ov = overrides()[m.id]
  if (ov) return { category: ov, auto, confidence: 1, flagged: false, manual: true }

  const flagged = confidence < THRESHOLD
  return { category: flagged ? null : auto, auto, confidence, flagged, manual: false }
}
