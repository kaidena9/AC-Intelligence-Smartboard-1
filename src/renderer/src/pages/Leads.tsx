import { useEffect, useMemo, useState } from 'react'
import type { Lead } from '@shared/types'
import { DEFAULT_LEADS_SHEET_ID } from '@shared/types'
import { openExternal, cn } from '../lib/util'
import { Button } from '../components/ui'
import {
  OUTCOMES, outcomeMeta, leadKey, loadActions, patchAction, effective,
  type LeadAction
} from '../lib/leadActions'
import {
  IconRefresh, IconExternal, IconSearch, IconCheck, IconAlert, IconPhone, IconLeads
} from '../components/icons'

const sheetEditUrl = (id: string): string => `https://docs.google.com/spreadsheets/d/${id}/edit`

// Phone-keypad letter → digit (handles vanity numbers like "(312) 850-HOME").
const KEYPAD: Record<string, string> = {
  a: '2', b: '2', c: '2', d: '3', e: '3', f: '3', g: '4', h: '4', i: '4',
  j: '5', k: '5', l: '5', m: '6', n: '6', o: '6', p: '7', q: '7', r: '7', s: '7',
  t: '8', u: '8', v: '8', w: '9', x: '9', y: '9', z: '9'
}
function telHref(phone: string): string | null {
  let digits = ''
  for (const ch of phone.toLowerCase()) {
    if (ch >= '0' && ch <= '9') digits += ch
    else if (KEYPAD[ch]) digits += KEYPAD[ch]
  }
  if (digits.length < 7) return null
  if (digits.length === 10) digits = `1${digits}`
  return `tel:+${digits}`
}

function CopyGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }): React.JSX.Element {
  return (
    <div className="widget rounded-2xl px-4 py-3">
      <div className="font-display tnum text-2xl font-bold text-text" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-subtle">{label}</div>
    </div>
  )
}

/* ------------------------------ business card ----------------------------- */

function LeadCard({
  lead, action, onPatch
}: { lead: Lead; action?: LeadAction; onPatch: (patch: Partial<LeadAction>) => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const tel = telHref(lead.phone)
  const eff = effective(lead, action)
  const om = outcomeMeta(eff.outcome)
  const canPickNext = eff.called && eff.notes.trim().length > 0

  return (
    <div className={cn('widget flex flex-col gap-3 rounded-2xl p-4', eff.called && 'opacity-95')}>
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold tracking-tight text-text">{lead.business}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {lead.location && <span className="text-muted">{lead.location}</span>}
            {lead.rating && (
              <span className="tabular-nums text-muted">
                <span className="text-amber">★</span> {lead.rating}{lead.reviewCount && <span className="text-subtle"> · {lead.reviewCount}</span>}
              </span>
            )}
          </div>
        </div>
        {om ? (
          <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: `color-mix(in srgb, ${om.color} 15%, transparent)`, color: om.color }}>{om.label}</span>
        ) : eff.called ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald/15 px-2 py-0.5 text-[11px] font-semibold text-emerald">
            <IconCheck className="h-3 w-3" /> Called
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-subtle">New</span>
        )}
      </div>

      {/* call + copy */}
      <div className="flex items-center gap-2">
        {tel ? (
          <button onClick={() => openExternal(tel)} title={`Call ${lead.phone}`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-ink px-4 py-2.5 text-sm font-semibold text-[var(--ink-fg)] transition duration-200 hover:-translate-y-0.5">
            <IconPhone className="h-4 w-4" /> Call {lead.phone}
          </button>
        ) : (
          <span className="flex-1 rounded-[6px] bg-bg px-4 py-2.5 text-center text-sm text-subtle">No phone number</span>
        )}
        {lead.phone && (
          <button onClick={() => { void navigator.clipboard.writeText(lead.phone); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
            title="Copy number"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-muted transition hover:text-text">
            {copied ? <IconCheck className="h-4 w-4 text-emerald" /> : <CopyGlyph />}
          </button>
        )}
      </div>

      {/* called checkbox */}
      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text">
        <input type="checkbox" checked={eff.called} onChange={(e) => onPatch({ called: e.target.checked })}
          className="h-4 w-4 rounded border-border-strong accent-[var(--accent)]" />
        Called this business
      </label>

      {/* notes */}
      <textarea value={eff.notes} onChange={(e) => onPatch({ notes: e.target.value })} rows={2}
        placeholder="Notes from the call — who you spoke to, interest, best time to reach…"
        className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-[12.5px] text-text outline-none placeholder:text-subtle focus:border-accent" />

      {/* next step — revealed once called + a note exists */}
      {canPickNext ? (
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">Next step</div>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => {
              const on = eff.outcome === o.id
              return (
                <button key={o.id} onClick={() => onPatch({ outcome: on ? '' : o.id })} title={o.hint}
                  className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition"
                  style={on
                    ? { borderColor: o.color, color: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` }
                    : { borderColor: 'var(--border-strong)', color: 'var(--muted)' }}>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-subtle">Check “Called” and jot a note to log the next step.</div>
      )}
    </div>
  )
}

/* --------------------------------- page ---------------------------------- */

type OutcomeFilter = 'all' | 'uncalled' | 'called' | 'callback' | 'email' | 'nocall'

export function Leads(): React.JSX.Element {
  const [leads, setLeads] = useState<Lead[]>([])
  const [actions, setActions] = useState<Record<string, LeadAction>>(() => loadActions())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetId, setSheetId] = useState(DEFAULT_LEADS_SHEET_ID)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<OutcomeFilter>('all')

  async function load(): Promise<void> {
    setLoading(true); setError(null)
    const res = await window.api.leads.fetch()
    setSheetId(res.sheetId)
    if (res.error) setError(res.error)
    setLeads(res.leads)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const update = (l: Lead, patch: Partial<LeadAction>): void =>
    setActions((a) => patchAction(a, leadKey(l), patch))

  const eff = (l: Lead): ReturnType<typeof effective> => effective(l, actions[leadKey(l)])

  // filter + search
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads.filter((l) => {
      const e = eff(l)
      if (filter === 'uncalled' && e.called) return false
      if (filter === 'called' && !e.called) return false
      if ((filter === 'callback' || filter === 'email' || filter === 'nocall') && e.outcome !== filter) return false
      if (!needle) return true
      return [l.business, l.location, l.niche, e.notes, l.phone].join(' ').toLowerCase().includes(needle)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, actions, q, filter])

  // group by business type (niche), biggest sections first
  const groups = useMemo(() => {
    const m = new Map<string, Lead[]>()
    for (const l of filtered) {
      const key = l.niche.trim() || 'Uncategorized'
      const arr = m.get(key) ?? []; arr.push(l); m.set(key, arr)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  // counts for the stat tiles + filter chips
  const counts = useMemo(() => {
    const c = { total: leads.length, uncalled: 0, called: 0, callback: 0, email: 0, nocall: 0 }
    for (const l of leads) {
      const e = eff(l)
      if (e.called) c.called++; else c.uncalled++
      if (e.outcome === 'callback') c.callback++
      else if (e.outcome === 'email') c.email++
      else if (e.outcome === 'nocall') c.nocall++
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, actions])

  const chips: { id: OutcomeFilter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: leads.length },
    { id: 'uncalled', label: 'Uncalled', n: counts.uncalled },
    { id: 'called', label: 'Called', n: counts.called },
    { id: 'callback', label: OUTCOMES[0].label, n: counts.callback },
    { id: 'email', label: OUTCOMES[1].label, n: counts.email },
    { id: 'nocall', label: OUTCOMES[2].label, n: counts.nocall }
  ]

  if (!loading && error === 'not-accessible') {
    return (
      <div className="mx-auto max-w-xl">
        <div className="widget rounded-2xl p-7">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber/15 text-amber"><IconAlert className="h-6 w-6" /></span>
          <h2 className="mt-4 text-lg font-bold text-text">Share the sheet to go live</h2>
          <p className="mt-1 text-sm text-muted">The Leads tab reads your Google Sheet directly. Set link sharing to <strong className="text-text">Anyone with the link → Viewer</strong>, then Refresh.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => openExternal(sheetEditUrl(sheetId))}><IconExternal className="h-4 w-4" /> Open the sheet</Button>
            <Button variant="subtle" onClick={() => void load()}><IconRefresh className="h-4 w-4" /> Refresh</Button>
          </div>
        </div>
      </div>
    )
  }
  if (!loading && error) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="widget rounded-2xl p-7 text-center">
          <h2 className="text-lg font-bold text-text">Couldn't load leads</h2>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <div className="mt-4"><Button variant="subtle" onClick={() => void load()}><IconRefresh className="h-4 w-4" /> Try again</Button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-text">
            <IconLeads className="h-6 w-6 text-accent" /> Leads
          </h1>
          <p className="mt-0.5 text-sm text-muted">Grouped by business type · check off calls, add notes, set the next step.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={() => void load()} disabled={loading}>
            <IconRefresh className={cn('h-4 w-4', loading && 'animate-spin')} />{loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button onClick={() => openExternal(sheetEditUrl(sheetId))}><IconExternal className="h-4 w-4" /> Open sheet</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={counts.total} />
        <Stat label="Uncalled" value={counts.uncalled} accent="var(--accent)" />
        <Stat label="Called" value={counts.called} accent="var(--emerald)" />
        <Stat label="Call back" value={counts.callback} accent="var(--amber)" />
        <Stat label="Email" value={counts.email} accent="var(--cyan)" />
        <Stat label="Don't contact" value={counts.nocall} accent="var(--red)" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, city, niche, notes…"
            className="w-full rounded-full border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none focus:border-accent" />
        </div>
        {chips.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)}
            className={cn('rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition',
              filter === c.id ? 'border-accent bg-accent/10 text-accent' : 'border-border-strong bg-surface text-muted hover:text-text')}>
            {c.label} <span className="text-[10px] opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      {/* Grouped sections */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted">Loading leads…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center text-sm text-muted">No leads match your filters.</div>
      ) : (
        <div className="space-y-7">
          {groups.map(([niche, items]) => (
            <section key={niche}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-text">{niche}</h2>
                <span className="rounded-full bg-bg px-1.5 text-[10px] font-bold text-muted">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((l, i) => (
                  <LeadCard key={`${leadKey(l)}-${i}`} lead={l} action={actions[leadKey(l)]} onPatch={(p) => update(l, p)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
