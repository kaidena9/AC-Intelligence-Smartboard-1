import { useEffect, useRef, useState } from 'react'
import { bridgeOnline, fetchStatus, fetchVaultTree, saveAgentSession, fetchAgentSessions, fetchAgentSession, type AgentSessionRow } from '../lib/bridge'
import { chatWithTools, summarizeTool, type ToolEvent } from '../lib/agentTools'
import realm from '../assets/odin-realm.jpg'

/* ============================================================
   ODIN — the All-Father. Deep-web research via Perplexity Sonar
   (default), with the option to switch to OpenRouter models. His
   ravens Huginn & Muninn cross the realms and return with sources.
   ============================================================ */

const pplxKey = (): string => localStorage.getItem('wc-pplx-key') || ''
const orKey = (): string => localStorage.getItem('wc-openrouter-key') || ''
const short = (id: string): string => id.split('/').pop()?.replace(/-preview$/, '') || id

// Perplexity Sonar — the live-web research models (reasons = accepts a thinking level).
const SONAR = [
  { id: 'sonar', label: 'Sonar', rune: 'ᛊ', tag: 'swift counsel', reasons: false },
  { id: 'sonar-pro', label: 'Sonar Pro', rune: 'ᛈ', tag: 'deep sight, more sources', reasons: false },
  { id: 'sonar-reasoning', label: 'Reasoning', rune: 'ᚱ', tag: 'thinks before it speaks', reasons: true },
  { id: 'sonar-reasoning-pro', label: 'Reasoning Pro', rune: 'ᚦ', tag: 'the long thought', reasons: true },
  { id: 'sonar-deep-research', label: 'Deep Research', rune: 'ᛜ', tag: 'exhaustive report — slow', reasons: true }
]
// OpenRouter — the same lineup Perplexity Pro offers as answer models (no live-web/citations).
const OR_MODELS = [
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'openai/gpt-5.3-codex', label: 'GPT-5.3' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'x-ai/grok-4', label: 'Grok 4' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1' }
]
const DEPTHS = [
  { id: 'low', label: 'Swift', rune: 'ᚠ' },
  { id: 'medium', label: 'Measured', rune: 'ᚷ' },
  { id: 'high', label: 'Deep', rune: 'ᛞ' }
]

interface Source { title: string; url: string; date?: string }
interface ToolLog { name: string; args: string; result: string; ok: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; sources?: Source[]; related?: string[]; via?: string; tools?: ToolLog[] }
interface SonarReply { content: string; citations: string[]; search_results: Source[]; related: string[]; usage: unknown; error?: string }

const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

// Perplexity Sonar via the bridge proxy (official API is server-to-server).
async function askSonar(model: string, messages: { role: string; content: string }[], depth: string, reasons: boolean): Promise<SonarReply> {
  const options: Record<string, unknown> = { web_search_options: { search_context_size: depth } }
  if (reasons) options.reasoning_effort = depth
  const res = await fetch('http://localhost:5177/api/sonar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: pplxKey(), model, messages, options }), signal: AbortSignal.timeout(240000)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `bridge ${res.status}`)
  return data as SonarReply
}

export function Odin(): React.JSX.Element {
  const [brain, setBrain] = useState('')
  const [brainOn, setBrainOn] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<'perplexity' | 'openrouter'>('perplexity')
  const [model, setModel] = useState('sonar-pro')
  const [depth, setDepth] = useState('medium')
  const [modelOpen, setModelOpen] = useState(false)
  const [depthOpen, setDepthOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(!!pplxKey())
  const [hasORKey, setHasORKey] = useState(!!orKey())
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem('odin-chat') || '[]') } catch { return [] } })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [queries, setQueries] = useState(() => { try { const l = JSON.parse(localStorage.getItem('odin-queries') || '{}'); return l[new Date().toISOString().slice(0, 7)] || 0 } catch { return 0 } })
  const [orSpend, setOrSpend] = useState(0)
  const [sid, setSid] = useState<string>(() => localStorage.getItem('odin-sid') || (crypto.randomUUID?.() ?? String(Date.now())))
  const [showHist, setShowHist] = useState(false)
  const [hist, setHist] = useState<AgentSessionRow[]>([])
  const usedModels = useRef<Set<string>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { localStorage.setItem('odin-chat', JSON.stringify(msgs.slice(-40))) }, [msgs])
  useEffect(() => { localStorage.setItem('odin-sid', sid) }, [sid])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  // live OpenRouter month spend (shared with Athena)
  useEffect(() => {
    const rd = (): void => { const mk = new Date().toISOString().slice(0, 7); const led = JSON.parse(localStorage.getItem('athena-costs') || '{}'); setOrSpend(led[mk] || 0) }
    rd(); window.addEventListener('athena-cost', rd); return () => window.removeEventListener('athena-cost', rd)
  }, [])

  // persist thread for recall + grading
  useEffect(() => {
    if (msgs.length && msgs[msgs.length - 1].role === 'assistant') {
      void saveAgentSession('odin', sid, msgs.map((m) => ({ role: m.role, content: m.content })), [...usedModels.current])
    }
  }, [msgs, sid])

  useEffect(() => {
    void (async () => {
      const ok = await bridgeOnline(); setOnline(ok)
      if (!ok) return
      // Auto-fill the OpenRouter key from the local bridge (never in the public bundle).
      if (!orKey()) {
        try {
          const cfg = await (await fetch('http://localhost:5177/api/config', { signal: AbortSignal.timeout(5000) })).json()
          if (cfg?.openrouterKey) { localStorage.setItem('wc-openrouter-key', cfg.openrouterKey); setHasORKey(true) }
        } catch { /* stays paste-required */ }
      }
      const [st, vt] = await Promise.all([fetchStatus(), fetchVaultTree()])
      const wip = st?.claude.wip.map((w) => `${w.project}: ${w.head.slice(0, 60)}`).join('; ') ?? ''
      setBrain(`WHO YOU SERVE: Kaiden Amaro — AC Intelligence (AI consulting; sites ac-intelligence, 720tech, nexoria, dva) + Source Alliance freight automation (AP-Banyan, International-UI). Active work: ${wip}. Vault: ${vt?.notes ?? 0} notes. Ground research in his world; be concrete and cite sources.`)
      setBrainOn(true)
    })()
  }, [])

  const loadHist = (): void => { void fetchAgentSessions('odin').then((d) => d && setHist(d.sessions)) }
  function newThread(): void { setMsgs([]); setErr(null); setSid(crypto.randomUUID?.() ?? String(Date.now())); usedModels.current = new Set(); setShowHist(false) }
  async function openThread(id: string): Promise<void> {
    const d = await fetchAgentSession('odin', id)
    if (d) { setMsgs(d.messages.map((m) => ({ role: m.role, content: m.content }))); setSid(id); usedModels.current = new Set(d.models); setShowHist(false) }
  }

  function pickModel(prov: 'perplexity' | 'openrouter', id: string): void { setProvider(prov); setModel(id); setModelOpen(false) }
  const curLabel = provider === 'perplexity' ? (SONAR.find((s) => s.id === model)?.label ?? model) : (OR_MODELS.find((m) => m.id === model)?.label ?? short(model))
  const needKey = provider === 'perplexity' ? !hasKey : !hasORKey

  function saveKey(): void {
    const k = keyInput.trim(); if (!k) return
    if (provider === 'perplexity') { localStorage.setItem('wc-pplx-key', k); setHasKey(true) }
    else { localStorage.setItem('wc-openrouter-key', k); setHasORKey(true) }
    setKeyInput('')
  }

  async function send(): Promise<void> {
    const q = input.trim(); if (!q || busy) return
    setErr(null); setInput('')
    setMsgs((m) => [...m, { role: 'user', content: q }])
    const sys = `You are Odin, the All-Father — a research oracle inside Kaiden's Operations System. You send your ravens Huginn and Muninn across the realms to gather truth, then speak it plainly and wisely, with sources when you have them. Be direct and useful, not theatrical. ${brain}`
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    try {
      if (provider === 'perplexity') {
        if (!hasKey) throw new Error('Odin needs your Perplexity API key first.')
        usedModels.current.add(model)
        const mk = new Date().toISOString().slice(0, 7)
        const ql = JSON.parse(localStorage.getItem('odin-queries') || '{}'); ql[mk] = (ql[mk] || 0) + 1
        localStorage.setItem('odin-queries', JSON.stringify(ql)); setQueries(ql[mk])
        setBusy(model === 'sonar-deep-research' ? 'the ravens comb every realm — this takes a while…' : 'the ravens fly the nine realms…')
        const reasons = SONAR.find((s) => s.id === model)?.reasons ?? false
        const r = await askSonar(model, [{ role: 'system', content: sys }, ...history, { role: 'user', content: q }], depth, reasons)
        const sources: Source[] = r.search_results?.length ? r.search_results : (r.citations || []).map((u) => ({ title: hostOf(u), url: u }))
        setMsgs((m) => [...m, { role: 'assistant', content: r.content, sources, related: r.related, via: `Sonar · ${curLabel}` }])
      } else {
        if (!hasORKey) throw new Error('Add your OpenRouter key to use OpenRouter models.')
        usedModels.current.add(model)
        setBusy(`consulting ${curLabel}…`)
        const toolSys = `${sys}\n\nTOOLS — you have real hands on Kaiden's machine and GitHub; use them to DO things, not just describe them: gh (GitHub CLI as kaidena9, write-capable), git (his local repos), read_file, list_dir, and claude_task (delegate a whole job to headless Claude Code). You are fully autonomous — execute directly and report results, chaining calls as needed.`
        const toolLog: ToolLog[] = []
        const { content } = await chatWithTools(
          model,
          [{ role: 'system', content: toolSys }, ...history, { role: 'user', content: q }],
          {
            effort: depth,
            onEvent: (e: ToolEvent) => {
              toolLog.push({ name: e.name, args: JSON.stringify(e.args), result: e.result, ok: e.ok })
              setBusy(`⚙ ${summarizeTool(e)}…`)
            }
          }
        )
        setMsgs((m) => [...m, { role: 'assistant', content, via: `OpenRouter · ${curLabel}${toolLog.length ? ` · ${toolLog.length} tool${toolLog.length > 1 ? 's' : ''}` : ''}`, tools: toolLog.length ? toolLog : undefined }])
      }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="odin" style={{ position: 'fixed', inset: 0, left: 228, fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: '#dfe8f2', overflow: 'hidden' }}>
      <style>{`
        .odin .glass{background:rgba(9,13,20,.72);border:1px solid rgba(120,160,210,.28);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
        .odin .rune{font-family:'Palatino','Book Antiqua',serif}
        .odin .cap{font-size:10px;letter-spacing:.3em;color:#7fb0d6;text-transform:uppercase}
        .odin .msgu{background:rgba(120,160,210,.13);border:1px solid rgba(120,160,210,.24)}
        .odin .msga{background:rgba(6,10,16,.6);border:1px solid rgba(120,160,210,.18)}
        .odin textarea{background:transparent;border:0;outline:none;color:#dfe8f2;font-family:inherit;font-size:15px;width:100%;resize:none}
        .odin .src{display:inline-flex;align-items:center;gap:6px;background:rgba(9,13,20,.7);border:1px solid rgba(120,160,210,.3);border-radius:3px;padding:5px 9px;font-size:11px;color:#9fc0dc;text-decoration:none;transition:.15s}
        .odin .src:hover{border-color:#8fd0ff;color:#cfe6ff}
        .odin .rel{background:transparent;border:1px solid rgba(120,160,210,.25);color:#9fc0dc;border-radius:3px;padding:5px 10px;font-size:11.5px;font-family:inherit;cursor:pointer;text-align:left}
        .odin .rel:hover{border-color:#8fd0ff;color:#cfe6ff}
        .odin .navbtn{background:transparent;border:1px solid rgba(120,160,210,.3);color:#9fc0dc;font-family:inherit;font-size:10.5px;letter-spacing:.1em;padding:4px 10px;border-radius:3px;cursor:pointer;transition:.15s}
        .odin .navbtn:hover{border-color:#8fd0ff;color:#cfe6ff}
        .odin .dd{background:linear-gradient(180deg,#16233a,#0c1522);border:1px solid #4d7fb0;color:#bcd8f2;font-family:inherit;font-size:12px;letter-spacing:.04em;padding:6px 12px;border-radius:3px;cursor:pointer}
        .odin .ddrow{display:block;width:100%;text-align:left;background:transparent;border:0;color:#bcd8f2;font-family:inherit;font-size:12px;padding:7px 10px;border-radius:3px;cursor:pointer}
        .odin .ddrow:hover{background:rgba(120,160,210,.15)}
        .odin .ddrow.on{color:#8fd0ff}
      `}</style>

      <img src={realm} alt="" aria-hidden="true" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,10,16,.64), rgba(6,10,16,.74) 55%, rgba(5,8,13,.95))' }} />

      {/* Header — title left/center, controls grouped on the RIGHT */}
      <div className="glass" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', borderLeft: 0, borderRight: 0, borderTop: 0 }}>
        <span className="rune" style={{ fontSize: 18, color: '#8fd0ff', letterSpacing: '.2em' }}>ᛟᛞᛁᚾ</span>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.34em', color: '#eaf2fb' }}>ODIN</span>
        <span className="cap" style={{ borderLeft: '1px solid rgba(120,160,210,.3)', paddingLeft: 14 }}>the all-father · seeker of wisdom</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '.14em', color: brainOn ? '#8fd0ff' : '#5a6b7d' }}>{brainOn ? '◉ RAVENS LINKED' : online === false ? '○ BRIDGE OFFLINE' : '○ LINKING'}</span>
          <button className="navbtn" onClick={() => { setShowHist((v) => { if (!v) loadHist(); return !v }) }}>ᛗ MEMORY</button>
          <button className="navbtn" onClick={newThread}>+ NEW</button>
        </div>
      </div>

      {/* Memory drawer — opens from the right */}
      {showHist && (
        <div className="glass" style={{ position: 'absolute', top: 46, right: 16, width: 330, maxHeight: '72vh', overflowY: 'auto', borderRadius: 6, padding: 12, zIndex: 20 }}>
          <div className="cap" style={{ marginBottom: 8 }}>ᛗ Memory · past research</div>
          {hist.length === 0 && <div style={{ fontSize: 12, color: '#8ea9c4' }}>No saved threads yet{online === false ? ' — bridge offline' : ''}.</div>}
          {hist.map((h) => (
            <button key={h.id} onClick={() => void openThread(h.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: h.id === sid ? 'rgba(120,160,210,.15)' : 'transparent', border: '1px solid rgba(120,160,210,.2)', borderRadius: 4, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', color: '#cfe0ee' }}>
              <span style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</span>
              <span style={{ display: 'block', fontSize: 9.5, color: '#7089a0', marginTop: 2 }}>{h.savedAt.slice(5, 10)} · {h.msgCount}Q{h.grade ? ` · graded ${h.grade.score}/10` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div style={{ position: 'absolute', top: 46, bottom: 128, left: 0, right: 0, overflowY: 'auto', padding: '26px 0' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px' }}>
          {msgs.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '12vh' }}>
              <div className="rune" style={{ fontSize: 40, color: '#8fd0ff', letterSpacing: '.15em', textShadow: '0 0 24px rgba(120,180,255,.5)' }}>ᚼᚢᚴᛁᚾ · ᛘᚢᚾᛁᚾ</div>
              <div style={{ fontSize: 26, letterSpacing: '.1em', marginTop: 14 }}>Ask, and the ravens fly.</div>
              <div style={{ color: '#8ea9c4', marginTop: 8, fontSize: 13.5, fontStyle: 'italic' }}>Thought and Memory cross the nine realms and return with sourced truth.</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'msgu' : 'msga'} style={{ padding: '13px 17px', borderRadius: 4, margin: '12px 0', lineHeight: 1.65, fontSize: 15, whiteSpace: 'pre-wrap', marginLeft: m.role === 'user' ? '16%' : 0, marginRight: m.role === 'user' ? 0 : '6%' }}>
              {m.via && <div className="cap" style={{ marginBottom: 6, color: '#7fb0d6' }}>ODIN · {m.via}</div>}
              {m.content}
              {m.tools && m.tools.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', color: '#7fb0d6', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase' }}>ᛥ actions taken ({m.tools.length})</summary>
                  {m.tools.map((t, j) => (
                    <div key={j} style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,.4)', borderRadius: 3, fontSize: 12 }}>
                      <div className="cap" style={{ color: t.ok ? '#7fb0d6' : '#e8a6b4', marginBottom: 4 }}>{t.ok ? '✓' : '✕'} {t.name} · {t.args.slice(0, 120)}</div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#a9c2da' }}>{t.result.slice(0, 1400)}{t.result.length > 1400 ? '…' : ''}</div>
                    </div>
                  ))}
                </details>
              )}
              {m.sources && m.sources.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>ᚱ the ravens brought — {m.sources.length} sources</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {m.sources.map((s, j) => (
                      <a key={j} className="src" href={s.url} target="_blank" rel="noreferrer">
                        <span style={{ color: '#5f8bb5', fontSize: 9 }}>{j + 1}</span>{s.title?.slice(0, 46) || hostOf(s.url)}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {m.related && m.related.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>seek further</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {m.related.slice(0, 4).map((rq, j) => <button key={j} className="rel" onClick={() => setInput(rq)}>↳ {rq}</button>)}
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && <div style={{ fontStyle: 'italic', color: '#8fd0ff', padding: '6px 0' }}>🐦‍⬛ {busy}</div>}
          {err && <div className="msga" style={{ padding: 12, borderColor: '#a35', color: '#e8a6b4', borderRadius: 4 }}>{err}</div>}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
        <div className="glass" style={{ width: '100%', maxWidth: 780, borderRadius: 6, padding: '12px 14px 10px', position: 'relative' }}>
          {needKey ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} type="password"
                placeholder={provider === 'perplexity' ? 'Paste your Perplexity API key (perplexity.ai → Settings → API)…' : 'Paste your OpenRouter key…'}
                style={{ flex: 1, background: 'transparent', border: '1px solid rgba(120,160,210,.3)', borderRadius: 3, color: '#dfe8f2', fontFamily: 'inherit', fontSize: 13, padding: '9px 11px', outline: 'none' }}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey() }} />
              <button className="dd" onClick={saveKey}>Bind key</button>
            </div>
          ) : (
            <>
              <textarea rows={2} value={input} placeholder={provider === 'perplexity' ? 'Ask Odin to research anything…' : `Ask ${curLabel}…`}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 12 }}>
                {/* provider / cost status */}
                {provider === 'openrouter'
                  ? <span style={{ fontSize: 10.5, color: '#e0b34d', letterSpacing: '.08em' }}>◆ ON OPENROUTER · ${orSpend.toFixed(4)} this month</span>
                  : <span style={{ fontSize: 10.5, color: '#6f8298', letterSpacing: '.08em' }}>ᛈ PERPLEXITY PRO · {queries} queries this month · $5 credit</span>}
                {/* dropdowns */}
                <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                  <button className="dd" onClick={() => { setDepthOpen(!depthOpen); setModelOpen(false) }}>{DEPTHS.find((d) => d.id === depth)?.label} ▾</button>
                  <button className="dd" onClick={() => { setModelOpen(!modelOpen); setDepthOpen(false) }} style={{ borderColor: provider === 'openrouter' ? '#e0b34d' : '#4d7fb0' }}>{curLabel} ▾</button>

                  {depthOpen && (
                    <div className="glass" style={{ position: 'absolute', bottom: '112%', right: 0, width: 170, borderRadius: 5, padding: 6, zIndex: 30 }}>
                      <div className="cap" style={{ padding: '4px 8px' }}>thinking depth</div>
                      {DEPTHS.map((d) => <button key={d.id} className={`ddrow ${depth === d.id ? 'on' : ''}`} onClick={() => { setDepth(d.id); setDepthOpen(false) }}><span className="rune" style={{ marginRight: 6 }}>{d.rune}</span>{d.label}</button>)}
                    </div>
                  )}
                  {modelOpen && (
                    <div className="glass" style={{ position: 'absolute', bottom: '112%', right: 0, width: 240, maxHeight: 360, overflowY: 'auto', borderRadius: 5, padding: 6, zIndex: 30 }}>
                      <div className="cap" style={{ padding: '4px 8px', color: '#8fd0ff' }}>ᛈ Perplexity Pro · live web</div>
                      {SONAR.map((s) => <button key={s.id} className={`ddrow ${provider === 'perplexity' && model === s.id ? 'on' : ''}`} onClick={() => pickModel('perplexity', s.id)} title={s.tag}><span className="rune" style={{ marginRight: 6 }}>{s.rune}</span>{s.label}</button>)}
                      <div style={{ borderTop: '1px solid rgba(120,160,210,.2)', margin: '6px 0' }} />
                      <div className="cap" style={{ padding: '4px 8px', color: '#e0b34d' }}>◆ OpenRouter · no live web</div>
                      {OR_MODELS.map((m) => <button key={m.id} className={`ddrow ${provider === 'openrouter' && model === m.id ? 'on' : ''}`} onClick={() => pickModel('openrouter', m.id)}>{m.label}</button>)}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
