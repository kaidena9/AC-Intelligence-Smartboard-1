import { useEffect, useRef, useState } from 'react'
import { Card, Button } from '../components/ui'
import { cn } from '../lib/util'
import {
  bridgeOnline, fetchSessions, gradeSession,
  fetchAgentSessions, gradeAgentSession, gradeAllAgent, fetchCoachReport,
  type SessionGrade, type CoachReport
} from '../lib/bridge'

/* ============================================================
   Session Coach — insights-first. Your coaching REPORT leads
   (grade, trend, top fixes, strengths across every session);
   the individual sessions collapse into a browse drawer.
   Three tracks: Claude Code · Athena · Odin (own rubrics).
   ============================================================ */

type Source = 'claude' | 'athena' | 'odin'
const SOURCES: { id: Source; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'athena', label: 'Athena' },
  { id: 'odin', label: 'Odin' }
]

interface Grade { score: number; headline: string; strengths: string[]; improvements: string[]; powerTips: string[]; meta: string }
interface Row { id: string; when: string; label: string; sub: string; grade: Grade | null }

function ScoreRing({ score }: { score: number }): React.JSX.Element {
  const pct = score * 10
  const hue = score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--amber)' : 'var(--red)'
  return (
    <div className="tnum flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-text"
      style={{ background: `conic-gradient(${hue} ${pct}%, rgba(255,255,255,0.08) 0)` }}>
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#0d0e18]">{score}</span>
    </div>
  )
}

function TrendLine({ data }: { data: number[] }): React.JSX.Element {
  const w = 260, h = 54
  if (data.length < 2) return <div className="text-[11px] text-subtle">not enough graded sessions yet</div>
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 4 - (v / 10) * (h - 10)}`).join(' ')
  const last = data[data.length - 1]
  return (
    <svg width={w} height={h} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(150,140,255,.35)" /><stop offset="1" stopColor="rgba(150,140,255,0)" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#tr)" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <circle cx={w} cy={h - 4 - (last / 10) * (h - 10)} r="3" fill="var(--accent)" />
    </svg>
  )
}

export function Sessions(): React.JSX.Element {
  const [online, setOnline] = useState<boolean | null>(null)
  const [source, setSource] = useState<Source>('claude')
  const [report, setReport] = useState<CoachReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [grading, setGrading] = useState<string | null>(null)
  const [gradingAll, setGradingAll] = useState(false)
  const [sel, setSel] = useState<Row | null>(null)
  const [browse, setBrowse] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadRows(src: Source): Promise<void> {
    if (src === 'claude') {
      const d = await fetchSessions()
      setRows((d?.sessions ?? []).map((r) => ({
        id: r.id, when: new Date(r.mtime).toLocaleDateString(), label: r.project || 'home',
        sub: `${r.sizeMB}MB${r.grade ? ` · ${r.grade.stats.msgCount} asks` : ' · not graded'}`,
        grade: r.grade ? { ...r.grade, meta: `${r.grade.stats.msgCount} asks · ${r.grade.stats.toolCalls} tools${r.grade.stats.durationMin ? ` · ~${r.grade.stats.durationMin}m` : ''}` } : null
      })))
    } else {
      const d = await fetchAgentSessions(src)
      setRows((d?.sessions ?? []).map((r) => ({
        id: r.id, when: new Date(r.savedAt).toLocaleDateString(), label: r.title || 'session',
        sub: `${r.msgCount} ${src === 'odin' ? 'questions' : 'asks'}`,
        grade: r.grade ? { ...r.grade, meta: `${r.msgCount} ${src === 'odin' ? 'research questions' : 'messages'}` } : null
      })))
    }
  }
  // Guards against a source switch landing a stale response / poll.
  const pollRef = useRef(0)
  async function loadReport(src: Source): Promise<void> {
    setReportLoading(true); setReport(null)
    const token = ++pollRef.current
    const r = await fetchCoachReport(src)          // returns instantly now (stats from disk)
    if (pollRef.current !== token) return
    setReport(r); setReportLoading(false)
    if (r?.synthPending) void pollThemes(src, token)   // themes synth in the background
  }
  async function pollThemes(src: Source, token: number): Promise<void> {
    for (let i = 0; i < 12; i++) {
      await new Promise((res) => setTimeout(res, 5000))
      if (pollRef.current !== token) return
      const nr = await fetchCoachReport(src)
      if (pollRef.current !== token) return
      if (nr) { setReport(nr); if (!nr.synthPending) return }
    }
  }

  useEffect(() => {
    void (async () => {
      const ok = await bridgeOnline(); setOnline(ok)
      if (ok) await Promise.all([loadRows(source), loadReport(source)])
    })()
  }, [])

  async function switchTo(src: Source): Promise<void> {
    pollRef.current++          // cancel any in-flight poll for the old source
    setSource(src); setSel(null); setErr(null); setRows([]); setReport(null); setBrowse(false)
    if (online) await Promise.all([loadRows(src), loadReport(src)])
  }

  async function grade(row: Row): Promise<void> {
    setGrading(row.id); setErr(null)
    const res = source === 'claude' ? await gradeSession(row.id) : await gradeAgentSession(source, row.id)
    setGrading(null)
    if ('error' in res) setErr(res.error)
    else { await loadRows(source); void loadReport(source); const g = res as Grade | SessionGrade; setSel({ ...row, grade: { ...(g as Grade), meta: row.sub } }) }
  }
  async function gradeAllUngraded(): Promise<void> {
    setGradingAll(true); setErr(null)
    if (source === 'claude') { await fetch('http://localhost:5177/api/hub/grade-all', { method: 'POST' }).catch(() => {}) }
    else await gradeAllAgent(source)
    for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 8000)); await loadRows(source) }
    void loadReport(source); setGradingAll(false)
  }

  const ungraded = rows.filter((r) => !r.grade).length
  const t = report?.trend ?? []
  const half = Math.floor(t.length / 2)
  const firstAvg = half ? t.slice(0, half).reduce((a, b) => a + b, 0) / half : 0
  const lastAvg = t.length - half ? t.slice(half).reduce((a, b) => a + b, 0) / (t.length - half) : 0
  const dir = t.length < 4 ? '' : lastAvg > firstAvg + 0.3 ? 'improving ▲' : lastAvg < firstAvg - 0.3 ? 'slipping ▼' : 'steady ▬'
  const dirColor = dir.includes('▲') ? 'var(--green)' : dir.includes('▼') ? 'var(--red)' : 'var(--text-muted)'
  const maxBar = Math.max(1, ...Object.values(report?.distribution ?? { 0: 1 }))

  return (
    <div className="rise-in mx-auto max-w-4xl space-y-5 pb-6">
      <div>
        <p className="eyebrow mb-2">System · Coaching Report</p>
        <h1 className="font-display text-2xl font-bold text-text">Session Coach</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          {source === 'odin' ? 'How well you wield Perplexity for deep research —' : source === 'athena' ? 'How well you wield multi-model delegation —' : 'How effectively you drive Claude —'} synthesized across every graded session.
        </p>
      </div>

      {/* Source switcher */}
      <div className="flex items-center gap-2">
        {SOURCES.map((s) => (
          <button key={s.id} onClick={() => void switchTo(s.id)}
            className={cn('rounded-full border px-4 py-1.5 text-[12.5px] font-semibold tracking-wide transition',
              source === s.id ? 'border-accent/60 bg-accent-soft text-accent' : 'border-border text-muted hover:border-border-strong hover:text-text')}>
            {s.label}
          </button>
        ))}
      </div>

      {online === false && (
        <Card className="p-5" interactive={false}>
          <p className="text-sm text-muted">The coach reads sessions on your Mac — start the bridge:{' '}
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs text-cyan">cd ~/agentic-os/dashboard && node server.mjs</code></p>
        </Card>
      )}
      {err && <p className="rounded-lg border border-red/25 bg-red/10 px-3 py-2 text-[13px] text-red">{err}</p>}

      {online && reportLoading && (
        <Card className="p-6 text-sm text-muted" interactive={false}>Loading your coaching report…</Card>
      )}

      {online && !reportLoading && report && report.count === 0 && (
        <Card className="flex flex-col items-start gap-3 p-6" interactive={false}>
          <p className="text-sm text-muted">No graded {SOURCES.find((s) => s.id === source)!.label} sessions yet.</p>
          {ungraded > 0 && <Button onClick={() => void gradeAllUngraded()} disabled={gradingAll}>{gradingAll ? 'Grading…' : `Grade ${ungraded} sessions`}</Button>}
        </Card>
      )}

      {online && !reportLoading && report && report.count > 0 && (
        <>
          {/* HERO — grade + trend + distribution */}
          <Card className="p-6" interactive={false}>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle">Overall mastery</div>
                <div className="tnum font-display text-[56px] font-bold leading-none text-text">
                  {report.avg}<span className="text-[22px] text-muted"> /10</span>
                </div>
                <div className="mt-1 text-[12px] text-muted">
                  {report.count} graded · <span style={{ color: dirColor }}>{dir || 'building history'}</span>
                </div>
              </div>
              <div className="min-w-[220px] flex-1">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-subtle">Score trend</div>
                <TrendLine data={report.trend} />
              </div>
              <div className="min-w-[150px]">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-subtle">Distribution</div>
                <div className="flex items-end gap-[3px]" style={{ height: 44 }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
                    const c = report.distribution[s] ?? 0
                    return (
                      <div key={s} className="flex flex-1 flex-col items-center justify-end" title={`${s}/10: ${c}`}>
                        <div className="w-full rounded-t-[2px]" style={{ height: `${(c / maxBar) * 100}%`, minHeight: c ? 3 : 0, background: s >= 8 ? 'var(--green)' : s >= 5 ? 'var(--amber)' : 'var(--red)', opacity: c ? 0.85 : 0.15 }} />
                        <span className="mt-0.5 text-[7px] text-subtle">{s}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* TOP FIXES */}
          <Card className="p-5" interactive={false}>
            <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber">
              Top fixes — across every session
              {report.synthPending && <span className="animate-pulse text-[10px] font-normal normal-case tracking-normal text-subtle">clustering themes…</span>}
            </div>
            <ol className="space-y-2">
              {report.topFixes.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted">
                  <span className="tnum shrink-0 font-bold text-amber">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
              {report.topFixes.length === 0 && (
                <li className="text-[13px] text-subtle">{report.synthPending ? `Clustering recurring themes across your ${report.count} graded sessions — this fills in shortly.` : 'Synthesis unavailable — grade more sessions.'}</li>
              )}
            </ol>
          </Card>

          {/* STRENGTHS */}
          <Card className="p-5" interactive={false}>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-green">What you do well</div>
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted"><span className="shrink-0 text-green">+</span><span>{s}</span></li>
              ))}
              {report.strengths.length === 0 && report.synthPending && (
                <li className="text-[13px] text-subtle">Surfacing what you consistently do well…</li>
              )}
            </ul>
          </Card>

          {/* BROWSE — collapsed session list + detail */}
          <div>
            <button onClick={() => setBrowse(!browse)}
              className="flex w-full items-center justify-between rounded-[12px] border border-border bg-surface/50 px-4 py-3 text-left transition hover:border-border-strong">
              <span className="text-[13px] font-semibold text-text">{browse ? '▾' : '▸'} Browse {rows.length} sessions</span>
              <span className="flex items-center gap-3">
                {ungraded > 0 && (
                  <span onClick={(e) => { e.stopPropagation(); void gradeAllUngraded() }}
                    className="rounded-full border border-border px-3 py-1 text-[11px] text-muted hover:text-text">{gradingAll ? 'Grading…' : `Grade ${ungraded} ungraded`}</span>
                )}
              </span>
            </button>

            {browse && (
              <div className="mt-3 grid gap-4 lg:grid-cols-5">
                <div className="space-y-1.5 lg:col-span-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {rows.map((r) => (
                    <button key={r.id} onClick={() => setSel(r)}
                      className={cn('flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition',
                        sel?.id === r.id ? 'border-accent/50 bg-accent-soft' : 'border-border bg-surface/60 hover:border-border-strong')}>
                      {r.grade ? <ScoreRing score={r.grade.score} /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-subtle">—</span>}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold text-text">{r.when} · {r.label}</div>
                        <div className="truncate text-[10.5px] text-subtle">{r.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="lg:col-span-3">
                  {sel ? (
                    <Card className="p-5" interactive={false}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-subtle">{sel.when} · {sel.label.slice(0, 36)}</div>
                          {sel.grade && <h2 className="font-display mt-1.5 text-[15px] font-bold leading-snug text-text">{sel.grade.headline}</h2>}
                        </div>
                        {sel.grade && <ScoreRing score={sel.grade.score} />}
                      </div>
                      {sel.grade ? (
                        <div className="mt-4 space-y-3.5">
                          <div><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-green">What worked</div>
                            <ul className="space-y-1">{sel.grade.strengths.map((s, i) => <li key={i} className="text-[12.5px] leading-relaxed text-muted">+ {s}</li>)}</ul></div>
                          <div><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Do differently</div>
                            <ul className="space-y-1">{sel.grade.improvements.map((s, i) => <li key={i} className="text-[12.5px] leading-relaxed text-muted">→ {s}</li>)}</ul></div>
                          {sel.grade.powerTips.length > 0 && (
                            <div className="rounded-[10px] border border-accent/25 bg-accent-soft p-3">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">{source === 'odin' ? 'Perplexity power tips' : 'Power tips'}</div>
                              <ul className="space-y-1">{sel.grade.powerTips.map((s, i) => <li key={i} className="text-[12.5px] leading-relaxed text-text">★ {s}</li>)}</ul>
                            </div>
                          )}
                          <div className="tnum text-[10.5px] text-subtle">{sel.grade.meta}</div>
                        </div>
                      ) : (
                        <div className="mt-4 flex flex-col items-start gap-2.5">
                          <p className="text-[13px] text-muted">Not graded yet.</p>
                          <Button onClick={() => void grade(sel)} disabled={grading !== null || !online}>{grading === sel.id ? 'Grading…' : 'Grade this session'}</Button>
                        </div>
                      )}
                    </Card>
                  ) : (
                    <Card className="flex h-full min-h-[160px] items-center justify-center p-6 text-[13px] text-muted" interactive={false}>Select a session to see its coaching.</Card>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
