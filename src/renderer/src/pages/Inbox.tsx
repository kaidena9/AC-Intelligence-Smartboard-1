import { useEffect, useMemo, useState } from 'react'
import { useInbox } from '../store/useInbox'
import { Button } from '../components/ui'
import { relativeTime, cn } from '../lib/util'
import type { EmailMessage } from '../lib/email'
import { TEMPLATES, loadVars, saveVars, type TemplateVars } from '../lib/emailTemplates'
import {
  classify, setCategoryOverride, CATEGORY_META, CATEGORY_ORDER, type Category, type Classification
} from '../lib/emailClassify'
import {
  IconMail, IconReply, IconArchive, IconTrash, IconStar, IconSend, IconPlus, IconSearch
} from '../components/icons'

type View = 'all' | Category | 'flagged' | 'starred' | 'sent' | 'archive' | 'trash'
const CARD = 'rounded-2xl border border-border bg-surface shadow-[var(--shadow)]'
const initials = (n: string): string => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const emptyDraft = { to: '', subject: '', body: '' }

export function Inbox(): React.JSX.Element {
  const account = useInbox((s) => s.account)
  const messages = useInbox((s) => s.messages)
  const selectedId = useInbox((s) => s.selectedId)
  const composeOpen = useInbox((s) => s.composeOpen)
  const select = useInbox((s) => s.select)
  const markRead = useInbox((s) => s.markRead)
  const toggleStar = useInbox((s) => s.toggleStar)
  const archive = useInbox((s) => s.archive)
  const trash = useInbox((s) => s.trash)
  const openCompose = useInbox((s) => s.openCompose)
  const closeCompose = useInbox((s) => s.closeCompose)
  const send = useInbox((s) => s.send)
  const load = useInbox((s) => s.load)
  const live = useInbox((s) => s.live)
  const loading = useInbox((s) => s.loading)
  const composeError = useInbox((s) => s.composeError)

  useEffect(() => { void load() }, [load])

  const [view, setView] = useState<View>('all')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState(emptyDraft)
  const [tplOpen, setTplOpen] = useState(false)
  const [sigOpen, setSigOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [vars, setVars] = useState<TemplateVars>(() => loadVars())
  const [catV, setCatV] = useState(0) // bump to recompute after a manual move

  // Read each email's content and sort it.
  const cls = useMemo(() => {
    const map: Record<string, Classification> = {}
    for (const m of messages) map[m.id] = classify(m)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, catV])

  const inboxMsgs = useMemo(() => messages.filter((m) => m.folder === 'inbox'), [messages])

  const count = (v: View): number => {
    if (v === 'all') return inboxMsgs.filter((m) => !m.read).length
    if (v === 'flagged') return inboxMsgs.filter((m) => cls[m.id]?.flagged && !m.read).length
    if (v === 'starred') return messages.filter((m) => m.starred && m.folder !== 'trash').length
    if (v === 'sent' || v === 'archive' || v === 'trash') return messages.filter((m) => m.folder === v).length
    return inboxMsgs.filter((m) => cls[m.id]?.category === v && !m.read).length
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let items: EmailMessage[]
    if (view === 'all') items = inboxMsgs
    else if (view === 'flagged') items = inboxMsgs.filter((m) => cls[m.id]?.flagged)
    else if (view === 'starred') items = messages.filter((m) => m.starred && m.folder !== 'trash')
    else if (view === 'sent' || view === 'archive' || view === 'trash') items = messages.filter((m) => m.folder === view)
    else items = inboxMsgs.filter((m) => cls[m.id]?.category === view)
    if (needle) items = items.filter((m) => [m.from.name, m.from.email, m.subject, m.preview, m.body].join(' ').toLowerCase().includes(needle))
    return [...items].sort((a, b) => b.date - a.date)
  }, [messages, inboxMsgs, view, q, cls])

  const selected = messages.find((m) => m.id === selectedId) ?? null
  const selCls = selected ? cls[selected.id] : null

  function startCompose(prefill?: Partial<typeof draft>): void {
    setDraft({ ...emptyDraft, ...prefill }); setTplOpen(false); setSigOpen(false); openCompose()
  }
  function reply(m: EmailMessage): void {
    startCompose({ to: m.from.email, subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`,
      body: `\n\n———\nOn ${new Date(m.date).toLocaleString()}, ${m.from.name} <${m.from.email}> wrote:\n${m.body}` })
  }
  function forward(m: EmailMessage): void {
    startCompose({ to: '', subject: m.subject.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject}`,
      body: `\n\n———— Forwarded message ————\nFrom: ${m.from.name} <${m.from.email}>\nSubject: ${m.subject}\n\n${m.body}` })
  }
  function applyTemplate(id: string): void {
    const t = TEMPLATES.find((x) => x.id === id); if (!t) return
    const { subject, body } = t.build(vars); setDraft((d) => ({ ...d, subject, body })); setTplOpen(false)
  }
  function moveTo(cat: Category | null): void {
    if (selected) { setCategoryOverride(selected.id, cat); setCatV((v) => v + 1); setMoveOpen(false) }
  }

  const PRIMARY: { id: View; label: string; color?: string }[] = [
    { id: 'all', label: 'All Mail' },
    ...CATEGORY_ORDER.map((c) => ({ id: c as View, label: CATEGORY_META[c].label, color: CATEGORY_META[c].color }))
  ]
  const SECONDARY: { id: View; label: string }[] = [
    { id: 'flagged', label: 'Flagged' }, { id: 'starred', label: 'Starred' },
    { id: 'sent', label: 'Sent' }, { id: 'archive', label: 'Archive' }, { id: 'trash', label: 'Trash' }
  ]

  const NavRow = ({ n }: { n: { id: View; label: string; color?: string } }): React.JSX.Element => {
    const on = view === n.id; const c = count(n.id)
    return (
      <button onClick={() => { setView(n.id); select(null) }}
        className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-semibold transition',
          on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-bg hover:text-text')}>
        <span className="flex items-center gap-2">
          {n.color && <span className="h-2 w-2 rounded-full" style={{ background: n.color }} />}
          {n.id === 'flagged' && <span className="text-amber">⚑</span>}
          {n.id === 'starred' && <IconStar className="h-3.5 w-3.5" />}
          {n.label}
        </span>
        {c > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', on ? 'bg-accent text-[var(--ink-fg)]' : 'bg-bg text-subtle')}>{c}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left rail */}
      <div className="flex w-[200px] shrink-0 flex-col gap-3">
        <Button onClick={() => startCompose()} className="w-full justify-center"><IconPlus className="h-4 w-4" /> Compose</Button>
        <nav className={cn(CARD, 'flex-1 overflow-y-auto p-1.5')}>
          {PRIMARY.map((n) => <NavRow key={n.id} n={n} />)}
          <div className="my-1.5 border-t border-border" />
          {SECONDARY.map((n) => <NavRow key={n.id} n={n} />)}
        </nav>
        <div className="px-2 text-[10.5px] leading-tight">
          <div className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald' : 'bg-amber')} />
            <span className="font-semibold text-muted">{live ? 'Live inbox' : 'Demo mailbox'}</span>
            <button onClick={() => void load()} title="Refresh" className="ml-auto text-[12px] text-subtle hover:text-text">↻</button>
          </div>
          <div className="mt-0.5 truncate text-subtle">{account}</div>
        </div>
      </div>

      {/* Message list */}
      <div className={cn(CARD, 'flex w-[350px] shrink-0 flex-col overflow-hidden')}>
        <div className="relative border-b border-border p-2.5">
          <IconSearch className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail…"
            className="w-full rounded-full border border-border bg-bg py-1.5 pl-9 pr-3 text-[13px] text-text outline-none focus:border-accent" />
        </div>
        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">Loading mail…</div>
          ) : list.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">{q ? 'No matches.' : 'Nothing here.'}</div>
          ) : list.map((m) => {
            const isSel = selected?.id === m.id; const cc = cls[m.id]
            return (
              <button key={m.id} onClick={() => select(m.id)}
                className={cn('group flex w-full gap-3 px-3.5 py-3 text-left transition', isSel ? 'bg-accent-soft' : 'hover:bg-bg')}>
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">{initials(m.from.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('min-w-0 flex-1 truncate text-sm', m.read ? 'font-medium text-text' : 'font-bold text-text')}>{m.from.name}</span>
                    {cc?.category && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_META[cc.category].color }} title={CATEGORY_META[cc.category].label} />}
                    {cc?.flagged && <span className="shrink-0 text-[11px] text-amber" title="Unsure — flagged in All Mail">⚑</span>}
                    <span onClick={(e) => { e.stopPropagation(); toggleStar(m.id) }} className={cn('shrink-0 opacity-0 transition group-hover:opacity-100', m.starred && 'opacity-100')}>
                      <IconStar className={cn('h-3.5 w-3.5', m.starred ? 'text-amber' : 'text-subtle')} />
                    </span>
                    <span className="shrink-0 text-[11px] text-subtle">{relativeTime(m.date)}</span>
                  </div>
                  <div className={cn('truncate text-[13px]', m.read ? 'text-muted' : 'font-semibold text-text')}>{m.subject}</div>
                  <div className="truncate text-[12px] text-subtle">{m.preview}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Reading pane */}
      <div className={cn(CARD, 'flex min-w-0 flex-1 flex-col overflow-hidden')}>
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-text">{selected.subject}</h2>
                <div className="mt-1.5 flex items-center gap-2 text-sm">
                  <span className="font-semibold text-text">{selected.from.name}</span>
                  <span className="text-subtle">&lt;{selected.from.email}&gt;</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
                  <span>to {selected.to} · {new Date(selected.date).toLocaleString()}</span>
                  {/* category chip + move */}
                  <span className="relative">
                    <button onClick={() => setMoveOpen((v) => !v)} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold hover:border-accent"
                      style={selCls?.category ? { color: CATEGORY_META[selCls.category].color } : undefined}>
                      {selCls?.category ? <><span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_META[selCls.category].color }} />{CATEGORY_META[selCls.category].label}</>
                        : selCls?.flagged ? <span className="text-amber">⚑ Flagged</span> : 'Uncategorized'}
                      {selCls?.manual && <span className="text-subtle">·moved</span>} ▾
                    </button>
                    {moveOpen && (
                      <span className={cn(CARD, 'absolute left-0 top-[130%] z-10 block w-44 p-1')}>
                        {CATEGORY_ORDER.map((c) => (
                          <button key={c} onClick={() => moveTo(c)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-text hover:bg-accent-soft">
                            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].label}
                          </button>
                        ))}
                        <button onClick={() => moveTo(null)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-subtle hover:bg-bg">Reset to auto</button>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconAction onClick={() => toggleStar(selected.id)} title="Star" active={selected.starred}><IconStar className="h-4 w-4" /></IconAction>
                <IconAction onClick={() => markRead(selected.id, false)} title="Mark unread"><IconMail className="h-4 w-4" /></IconAction>
                <IconAction onClick={() => archive(selected.id)} title="Archive"><IconArchive className="h-4 w-4" /></IconAction>
                <IconAction onClick={() => trash(selected.id)} title="Delete" danger><IconTrash className="h-4 w-4" /></IconAction>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5"><p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{selected.body}</p></div>
            <div className="flex gap-2 border-t border-border p-4">
              <Button variant="subtle" onClick={() => reply(selected)}><IconReply className="h-4 w-4" /> Reply</Button>
              <Button variant="ghost" onClick={() => forward(selected)}>Forward</Button>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted"><IconMail className="mb-2 h-8 w-8 text-subtle" />Select a message to read.</div>
        )}
      </div>

      {/* Compose */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={closeCompose}>
          <div className={cn(CARD, 'flex w-full max-w-xl flex-col')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-base font-semibold text-text">New message</h2>
              <button onClick={closeCompose} className="text-lg leading-none text-muted hover:text-text">×</button>
            </div>
            <div className="space-y-2.5 p-5">
              <input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="To" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Subject" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Write your message…" className="min-h-56 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text outline-none focus:border-accent" />
            </div>
            {sigOpen && (
              <div className="mx-5 mb-3 rounded-lg border border-border bg-bg p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-subtle">Signature — fills your templates</div>
                <div className="grid grid-cols-2 gap-2">
                  {([['senderName', 'Your name'], ['phone', 'Phone'], ['calendarLink', 'Booking link'], ['company', 'Company']] as const).map(([k, ph]) => (
                    <input key={k} value={vars[k]} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} placeholder={ph} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-accent" />
                  ))}
                </div>
                <div className="mt-2 flex justify-end"><button onClick={() => { saveVars(vars); setSigOpen(false) }} className="text-[12px] font-semibold text-accent hover:underline">Save signature</button></div>
              </div>
            )}
            {composeError && (
              <div className="mx-5 mb-2 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-[12px] text-red">{composeError}</div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
              <div className="relative flex items-center gap-2">
                <button onClick={() => setTplOpen((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-[12.5px] font-semibold text-muted transition hover:border-accent hover:text-accent">✦ Templates ▾</button>
                <button onClick={() => setSigOpen((v) => !v)} title="Edit signature" className="text-[11.5px] text-subtle hover:text-text">✎ signature</button>
                {tplOpen && (
                  <div className={cn(CARD, 'absolute bottom-[115%] left-0 z-10 w-72 overflow-hidden p-1')}>
                    {TEMPLATES.map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t.id)} className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-accent-soft">
                        <div className="text-[13px] font-semibold text-text">{t.label}</div>
                        <div className="text-[11.5px] text-subtle">{t.desc}</div>
                      </button>
                    ))}
                    <div className="border-t border-border px-3 py-1.5 text-[10.5px] text-subtle">Fill [bracketed] blanks per business.</div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeCompose}>Discard</Button>
                <Button onClick={() => send(draft)} disabled={!draft.to.trim()}><IconSend className="h-4 w-4" /> Send</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IconAction({ onClick, title, active, danger, children }: {
  onClick: () => void; title: string; active?: boolean; danger?: boolean; children: React.ReactNode
}): React.JSX.Element {
  return (
    <button onClick={onClick} title={title}
      className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface transition',
        active ? 'text-amber' : danger ? 'text-muted hover:text-red' : 'text-muted hover:border-accent hover:text-accent')}>
      {children}
    </button>
  )
}
