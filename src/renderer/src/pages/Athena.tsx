import { useEffect, useRef, useState } from 'react'
import { bridgeOnline, fetchStatus, fetchVaultTree, saveAgentSession } from '../lib/bridge'
import { chatWithTools, summarizeTool, type ToolEvent } from '../lib/agentTools'
import odyssey from '../assets/athena-odyssey.jpg'
import mural from '../assets/athena-mural.jpg'
import olympus from '../assets/athena-olympus.jpg'

/* ============================================================
   ATHENA — Odyssey edition. Open canvas chat, top-tab interfaces,
   bottom-right god/model selector, node-graph delegation editor.
   ============================================================ */

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'
const keyOf = (): string => localStorage.getItem('wc-openrouter-key') || ''

const MODELS = [
  { id: 'anthropic/claude-opus-4.8', label: 'Opus 4.8' },
  { id: 'anthropic/claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'openai/gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
  { id: 'z-ai/glm-4.7', label: 'GLM 4.7' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1' },
  { id: 'perplexity/sonar-pro', label: 'Sonar Pro' }
]
const short = (id: string): string => id.split('/').pop()?.replace(/-preview$/, '') || id
/* Real brand logos, true colors — each provider's own favicon. */
const DOMAIN: Record<string, string> = { openai: 'openai.com', anthropic: 'claude.ai', google: 'gemini.google.com', 'x-ai': 'x.ai', deepseek: 'deepseek.com', 'z-ai': 'z.ai', moonshotai: 'kimi.com', perplexity: 'perplexity.ai', qwen: 'chat.qwen.ai', mistralai: 'mistral.ai', 'meta-llama': 'llama.com', minimax: 'minimax.io', nvidia: 'nvidia.com', amazon: 'aws.amazon.com', microsoft: 'microsoft.com', tencent: 'tencent.com', xiaomi: 'mi.com', cohere: 'cohere.com' }
const logoUrl = (id: string): string => {
  const dom = DOMAIN[id.split('/')[0]]
  return dom ? `https://www.google.com/s2/favicons?domain=${dom}&sz=128` : ''
}
function Logo({ id, size = 18 }: { id: string; size?: number }): React.JSX.Element {
  const prov = id.split('/')[0]
  const dom = DOMAIN[prov]
  return dom ? (
    <img src={`https://www.google.com/s2/favicons?domain=${dom}&sz=64`} width={size} height={size} alt=""
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 4 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
  ) : (
    <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: '50%', border: '1px solid #c9a227', color: '#e8c95a', fontSize: size * 0.55, alignItems: 'center', justifyContent: 'center' }}>{prov[0]?.toUpperCase()}</span>
  )
}
/* Frontier bench fallback — replaced by the live OpenRouter catalog when it loads. */
const BENCH_SEED = ['anthropic/claude-opus-4.8','openai/gpt-5.5','z-ai/glm-5.2','anthropic/claude-sonnet-5','google/gemini-3.1-pro-preview','google/gemini-3.5-flash','x-ai/grok-4','qwen/qwen3-max','deepseek/deepseek-v4','moonshotai/kimi-k2.5','openai/gpt-5.3-codex','anthropic/claude-haiku-4.5','perplexity/sonar-pro','mistralai/mistral-large','meta-llama/llama-4-maverick','minimax/minimax-m2']

interface Delegator { id: string; name: string; operator: string; workers: (string | null)[]; bestFor: string }
/* Each god paired with the strongest models for its discipline.
   Operator = the taste/judgment brain; workers = specialists it delegates to. */
const DEFAULTS: Delegator[] = [
  { id: 'apollo', name: 'Apollo · Websites', operator: 'anthropic/claude-opus-4.8', bestFor: 'Landing pages, redesigns, UI & copy — Opus directs taste, Codex writes the markup, Gemini reviews design & a11y, Sonnet polishes copy', workers: ['openai/gpt-5.3-codex', 'google/gemini-3.1-pro-preview', 'anthropic/claude-sonnet-5'] },
  { id: 'hephaestus', name: 'Hephaestus · Automations', operator: 'anthropic/claude-opus-4.8', bestFor: 'Functions, scripts, pipelines — Codex drafts, DeepSeek writes tests & edge cases, Kimi reasons through failure modes', workers: ['openai/gpt-5.3-codex', 'deepseek/deepseek-chat-v3.1', 'moonshotai/kimi-k2.5'] },
  { id: 'delphi', name: 'Delphi · Research', operator: 'anthropic/claude-opus-4.8', bestFor: 'Deep sourced research — Sonar searches the live web, Gemini synthesizes long context, Kimi hunts contradictions', workers: ['perplexity/sonar-pro', 'google/gemini-3.1-pro-preview', 'moonshotai/kimi-k2.5'] },
  { id: 'muses', name: 'Muses · Imagery', operator: 'anthropic/claude-opus-4.8', bestFor: 'Art direction & image prompts — Opus directs, Gemini (multimodal) crafts detailed prompts, Grok adds creative variety', workers: ['google/gemini-3.1-pro-preview', 'x-ai/grok-4', 'z-ai/glm-4.7'] }
]

interface ToolLog { name: string; args: string; result: string; ok: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; via?: string; workings?: { model: string; out: string }[]; tools?: ToolLog[] }

async function llm(model: string, messages: { role: string; content: string }[], effort?: string, maxTokens = 5000): Promise<string> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, usage: { include: true } }
  if (effort) body.reasoning = { effort }
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyOf()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `OpenRouter ${res.status}`)
  const cost = Number(data?.usage?.cost || 0)
  if (cost > 0) {
    const mk = new Date().toISOString().slice(0, 7)
    const led = JSON.parse(localStorage.getItem('athena-costs') || '{}')
    led[mk] = (led[mk] || 0) + cost
    localStorage.setItem('athena-costs', JSON.stringify(led))
    window.dispatchEvent(new Event('athena-cost'))
  }
  return data.choices?.[0]?.message?.content ?? ''
}

export function Athena(): React.JSX.Element {
  const [tab, setTab] = useState<'chat' | 'delegation'>('chat')
  const [brain, setBrain] = useState('')
  const [brainOn, setBrainOn] = useState(false)
  const [mode, setMode] = useState<string>('single')
  const [model, setModel] = useState(MODELS[0].id)
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>('medium')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [delegators, setDelegators] = useState<Delegator[]>(() => {
    try { const d = JSON.parse(localStorage.getItem('athena-delegators-v3') || 'x'); return Array.isArray(d) ? d : DEFAULTS } catch { return DEFAULTS }
  })
  const [editId, setEditId] = useState('apollo')
  const [slotSel, setSlotSel] = useState<number | null>(null)   // armed seat: -1 = core, 0..2 = expert
  const [held, setHeld] = useState<string | null>(null)          // model picked from the bench, awaiting a seat

  // Pin a delegator's core so auto-promote won't overwrite a hand-chosen operator.
  function pinDelegator(delegatorId: string): void { pinnedRef.current.add(delegatorId); localStorage.setItem('athena-op-pinned', JSON.stringify([...pinnedRef.current])) }
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem('athena-chat') || '[]') } catch { return [] } })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [bench, setBench] = useState<string[]>(BENCH_SEED)
  const [flagship, setFlagship] = useState<string>('')      // newest top-ranked operator from live catalog
  const pinnedRef = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('athena-op-pinned') || '[]')))
  const [maxTok, setMaxTok] = useState<number>(() => Number(localStorage.getItem('athena-maxtok')) || 4096)
  useEffect(() => { localStorage.setItem('athena-maxtok', String(maxTok)) }, [maxTok])
  const [stats, setStats] = useState({ day: 0, month: 0, spend: 0, credits: -1 })
  useEffect(() => {
    const refresh = (): void => {
      const dk = new Date().toISOString().slice(0, 10), mk = dk.slice(0, 7)
      const mc = JSON.parse(localStorage.getItem('athena-msgcount') || '{}')
      const led = JSON.parse(localStorage.getItem('athena-costs') || '{}')
      const month = Object.keys(mc).filter((k) => k.startsWith(mk)).reduce((a, k) => a + mc[k], 0)
      setStats((s0) => ({ ...s0, day: mc[dk] || 0, month, spend: led[mk] || 0 }))
      if (keyOf()) void fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${keyOf()}` } })
        .then((r) => r.json()).then((j) => setStats((s0) => ({ ...s0, credits: (j.data?.total_credits ?? 0) - (j.data?.total_usage ?? 0) }))).catch(() => {})
    }
    refresh()
    window.addEventListener('athena-cost', refresh)
    return () => window.removeEventListener('athena-cost', refresh)
  }, [])
  /* Live catalog: pull the real OpenRouter model list so the bench is never capped. */
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/models')
        const j = await r.json()
        const prio = ['anthropic/', 'openai/', 'google/', 'x-ai/', 'deepseek/', 'z-ai/', 'qwen/', 'moonshotai/', 'perplexity/', 'mistralai/', 'meta-llama/', 'minimax/']
        const ids = (j.data as { id: string; created: number }[])
          .filter((m) => prio.some((p) => m.id.startsWith(p)) && !/embed|whisper|tts|audio|image|vision-only|:free/.test(m.id))
          .sort((a, b) => b.created - a.created)
        const seen = new Set<string>(); const top: string[] = []
        for (const pfx of prio) { for (const m of ids) { if (m.id.startsWith(pfx) && !seen.has(m.id) && top.length < 24) { seen.add(m.id); top.push(m.id); if (top.filter((t) => t.startsWith(pfx)).length >= 3) break } } }
        if (top.length > 6) setBench(top)
        // newest top-ranked OPERATOR-grade model (taste/reasoning leaders, newest first)
        const isOp = (id: string): boolean =>
          /(opus|fable|sonnet-?5|gpt-5(\.\d)?($|-|\b)|gemini-[\d.]+-pro|grok-4|kimi-k2|deepseek-(v[45]|r\d))/i.test(id) &&
          !/(haiku|mini|nano|flash|lite|air|codex|embed|instruct-turbo)/i.test(id)
        const fs = ids.find((m) => isOp(m.id))?.id
        if (fs) setFlagship(fs)
      } catch { /* keep seed */ }
    })()
  }, [])

  /* Auto-promote: newest flagship fills every un-pinned core seat as it's discovered. */
  useEffect(() => {
    if (!flagship) return
    setDelegators((prev) => {
      const next = prev.map((d) => (pinnedRef.current.has(d.id) || d.operator === flagship ? d : { ...d, operator: flagship }))
      return next.some((d, i) => d.operator !== prev[i].operator) ? next : prev
    })
  }, [flagship])

  useEffect(() => { localStorage.setItem('athena-chat', JSON.stringify(msgs.slice(-60))) }, [msgs])
  // Persist the conversation for the Session Coach (Athena track).
  useEffect(() => {
    if (msgs.length && msgs[msgs.length - 1].role === 'assistant') {
      let sid = localStorage.getItem('athena-sid')
      if (!sid) { sid = crypto.randomUUID?.() ?? String(Date.now()); localStorage.setItem('athena-sid', sid) }
      const used = [...new Set(msgs.map((m) => m.via).filter(Boolean) as string[])]
      void saveAgentSession('athena', sid, msgs.map((m) => ({ role: m.role, content: m.content })), used)
    }
  }, [msgs])
  useEffect(() => { localStorage.setItem('athena-delegators-v3', JSON.stringify(delegators)) }, [delegators])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  useEffect(() => {
    void (async () => {
      if (!(await bridgeOnline())) return
      const [st, vt] = await Promise.all([fetchStatus(), fetchVaultTree()])
      const wip = st?.claude.wip.map((w) => `${w.project}: ${w.head.slice(0, 70)}`).join('\n') ?? ''
      setBrain(
        `OPERATOR PROFILE: Kaiden Amaro — AC Intelligence (AI consulting, partner Frankie Campbell; sites ac-intelligence/720tech/nexoria/dva) + Source Alliance freight automation (AP-Banyan, International-UI, Azure; colleagues Greg, Aurora). Wants evidence before "done", premium visuals, one-step-at-a-time on freight.\nVAULT: ${vt?.notes ?? 0} notes. WIP:\n${wip}\nPulse: ${st?.pulse.commits7 ?? '?'} commits/7d.`
      )
      setBrainOn(true)
    })()
  }, [])

  const active = delegators.find((d) => d.id === mode) || null
  const editing = delegators.find((d) => d.id === editId) || delegators[0]

  // Place a model into a seat: seat -1 = core/operator, 0..2 = expert.
  function assign(seat: number, m: string | null): void {
    setDelegators((prev) => prev.map((d) => {
      if (d.id !== editing.id) return d
      if (seat === -1) { pinDelegator(d.id); return { ...d, operator: m ?? d.operator } }
      return { ...d, workers: d.workers.map((w, i) => (i === seat ? m : w)) }
    }))
  }
  // Click a bench model: if a seat is armed, drop it there; otherwise hold it (toggle).
  function onBench(id: string): void {
    if (slotSel !== null) { assign(slotSel, id); setSlotSel(null); setHeld(null) }
    else setHeld((h) => (h === id ? null : id))
  }
  // Click a seat: if holding a model, drop it in; if seat filled, clear it; else arm the seat.
  function onSeat(seat: number, filled: boolean): void {
    if (held) { assign(seat, held); setHeld(null); setSlotSel(null) }
    else if (filled && seat !== -1) { assign(seat, null); setSlotSel(null) }
    else setSlotSel((s) => (s === seat ? null : seat))
  }

  async function send(): Promise<void> {
    const q = input.trim()
    if (!q || busy) return
    setErr(null); setInput('')
    setMsgs((m) => [...m, { role: 'user', content: q }])
    const dk = new Date().toISOString().slice(0, 10)
    const mc = JSON.parse(localStorage.getItem('athena-msgcount') || '{}')
    mc[dk] = (mc[dk] || 0) + 1
    localStorage.setItem('athena-msgcount', JSON.stringify(mc))
    window.dispatchEvent(new Event('athena-cost'))
    const sys = `You are Athena — Kaiden's operator agent in his Operations System. Direct, wise, concise.\n${brain || '(bridge offline — no personal context)'}\n\nTOOLS — you have real hands on Kaiden's machine and GitHub. Use them to DO things, not just describe steps:\n• gh — the GitHub CLI as kaidena9 (issues, PRs, repos, releases, Actions, gh api). Write-capable.\n• git — git in his local repos (pass cwd).\n• read_file / list_dir — inspect his files for reference.\n• claude_task — hand a whole multi-step job to headless Claude Code.\nYou are fully autonomous: when asked to do something, execute it directly with tools and report the result. Chain multiple tool calls as needed. Copy identifiers (repo names, PR numbers, SHAs) exactly.`
    const history = msgs.slice(-8).map((m) => ({ role: m.role, content: m.content }))
    try {
      if (!keyOf()) throw new Error('No OpenRouter key — add it in Settings (Image generation card).')
      if (!active) {
        setBusy(`${short(model)} is thinking…`)
        const toolLog: ToolLog[] = []
        const { content } = await chatWithTools(
          model,
          [{ role: 'system', content: sys }, ...history, { role: 'user', content: q }],
          {
            effort, maxTokens: maxTok,
            onEvent: (e: ToolEvent) => {
              toolLog.push({ name: e.name, args: JSON.stringify(e.args), result: e.result, ok: e.ok })
              setBusy(`⚙ ${summarizeTool(e)}…`)
            }
          }
        )
        setMsgs((m) => [...m, { role: 'assistant', content, via: `${short(model)} · ${effort}${toolLog.length ? ` · ${toolLog.length} tool${toolLog.length > 1 ? 's' : ''}` : ''}`, tools: toolLog.length ? toolLog : undefined }])
      } else {
        const workers = active.workers.filter(Boolean) as string[]
        setBusy(`${active.name.split('·')[0].trim()} plans…`)
        const plan = await llm(active.operator, [
          { role: 'system', content: sys },
          { role: 'user', content: `Task: ${q}\n\nWorkers:\n${workers.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n\nWrite one self-contained brief per worker labeled "WORKER 1:" etc. If trivial, reply NO_DELEGATION then answer directly.` }
        ], effort)
        if (plan.trim().startsWith('NO_DELEGATION') || workers.length === 0) {
          setMsgs((m) => [...m, { role: 'assistant', content: plan.replace('NO_DELEGATION', '').trim(), via: active.name }])
        } else {
          setBusy('the workers labor…')
          const briefs = workers.map((_, i) => plan.match(new RegExp(`WORKER ${i + 1}:([\\s\\S]*?)(?=WORKER ${i + 2}:|$)`))?.[1]?.trim() || q)
          const outs = await Promise.all(workers.map((w, i) => llm(w, [{ role: 'user', content: briefs[i] }], undefined, maxTok).catch((e) => `⚠ ${e.message}`)))
          setBusy('Athena weighs the counsel…')
          const fin = await llm(active.operator, [
            { role: 'system', content: sys },
            { role: 'user', content: `Task: ${q}\n\nWorker results:\n${workers.map((w, i) => `--- ${w} ---\n${outs[i]}`).join('\n\n')}\n\nSynthesize the best final answer; verify claims across workers; deliver the work product.` }
          ], effort, 6000)
          setMsgs((m) => [...m, { role: 'assistant', content: fin, via: active.name, workings: workers.map((w, i) => ({ model: w, out: outs[i] })) }])
        }
      }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  /* node graph geometry */
  const WXS = [90, 300, 510]

  return (
    <div className="athena" style={{ position: 'fixed', inset: 0, left: 228, fontFamily: "'Palatino','Book Antiqua',Georgia,serif", color: '#efe6d0', overflow: 'hidden' }}>
      <style>{`
        .athena .tabbtn{background:transparent;border:0;border-bottom:2px solid transparent;color:#b9ad92;font-family:inherit;font-size:12.5px;letter-spacing:.32em;padding:14px 22px;cursor:pointer;text-transform:uppercase}
        .athena .tabbtn.on{color:#e8c95a;border-bottom-color:#c9a227}
        .athena .glass{background:rgba(14,11,6,.72);border:1px solid rgba(201,162,39,.3);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
        .athena .msgu{background:rgba(201,162,39,.14);border:1px solid rgba(201,162,39,.25)}
        .athena .msga{background:rgba(10,8,4,.62);border:1px solid rgba(201,162,39,.18)}
        .athena textarea{background:transparent;border:0;outline:none;color:#efe6d0;font-family:inherit;font-size:15px;width:100%;resize:none}
        .athena .via{font-size:10px;letter-spacing:.24em;color:#c9a227;text-transform:uppercase;margin-bottom:6px}
        .athena details summary{cursor:pointer;color:#c9a227;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
        .athena .rost{display:block;width:100%;text-align:left;background:rgba(10,8,4,.5);border:1px solid rgba(201,162,39,.25);color:#d9cdb0;font-family:inherit;font-size:12.5px;padding:7px 10px;border-radius:2px;cursor:pointer;margin-bottom:6px}
        .athena .rost:hover{border-color:#e8c95a;color:#e8c95a}
        .athena .nodecirc{cursor:pointer;transition:.2s}
      `}</style>

      {/* backdrop per tab */}
      <img src={tab === 'chat' ? odyssey : mural} alt="" aria-hidden="true" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: tab === 'chat'
        ? 'linear-gradient(180deg, rgba(12,9,4,.64), rgba(12,9,4,.72) 55%, rgba(10,8,4,.95))'
        : 'linear-gradient(180deg, rgba(10,8,5,.66), rgba(10,8,5,.8))' }} />

      {/* top tab bar */}
      <div className="glass" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderLeft: 0, borderRight: 0, borderTop: 0 }}>
        <span style={{ position: 'absolute', left: 22, color: '#e8c95a', letterSpacing: '.3em', fontSize: 13 }}>ΑΘΗΝΑ</span>
        <button className={`tabbtn ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>Chamber</button>
        <button className={`tabbtn ${tab === 'delegation' ? 'on' : ''}`} onClick={() => setTab('delegation')}>Delegation</button>
        <span style={{ position: 'absolute', right: 22, fontSize: 10, letterSpacing: '.18em', color: brainOn ? '#e8c95a' : '#7a705a' }}>
          {brainOn ? '◉ BRAIN LINKED' : '○ BRAIN OFFLINE'}
        </span>
      </div>

      {tab === 'chat' && (
        <>
          {/* stats strip */}
          <div className="glass" style={{ position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 26, alignItems: 'center', borderRadius: 6, padding: '9px 22px', fontSize: 12 }}>
            <span><span className="via" style={{ margin: 0, display: 'block' }}>Messages</span><span style={{ color: '#efe6d0', fontSize: 14 }}>{stats.day} today · {stats.month} this month</span></span>
            <span><span className="via" style={{ margin: 0, display: 'block' }}>Spend · {new Date().toLocaleString('en-US', { month: 'long' })}</span><span style={{ color: '#e8c95a', fontSize: 14 }}>${stats.spend.toFixed(4)}{stats.credits >= 0 ? ` · $${stats.credits.toFixed(2)} left` : ''}</span></span>
            <span><span className="via" style={{ margin: 0, display: 'block' }}>{active ? 'Council' : 'Voice'}</span>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#efe6d0' }}>
                {active ? (<>
                  <Logo id={active.operator} size={17} /> {short(active.operator)}
                  {(active.workers.filter(Boolean) as string[]).map((w) => <Logo key={w} id={w} size={15} />)}
                </>) : (<><Logo id={model} size={17} /> {short(model)} · {effort}</>)}
              </span>
            </span>
          </div>
          {/* open canvas */}
          <div style={{ position: 'absolute', top: 50, bottom: 118, left: 0, right: 0, overflowY: 'auto', padding: '60px 0 28px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
              {msgs.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: '16vh' }}>
                  <div style={{ fontSize: 30, letterSpacing: '.12em' }}>Speak, wanderer.</div>
                  <div style={{ fontStyle: 'italic', color: '#c4b795', marginTop: 8, fontSize: 14 }}>The goddess listens — or sends her council.</div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'msgu' : 'msga'} style={{ padding: '13px 17px', borderRadius: 4, margin: '12px 0', lineHeight: 1.65, fontSize: 15, whiteSpace: 'pre-wrap', marginLeft: m.role === 'user' ? '15%' : 0, marginRight: m.role === 'user' ? 0 : '8%' }}>
                  {m.via && <div className="via">{m.via}</div>}
                  {m.content}
                  {m.tools && m.tools.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary>actions taken ({m.tools.length})</summary>
                      {m.tools.map((t, j) => (
                        <div key={j} style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,.4)', borderRadius: 3, fontSize: 12 }}>
                          <div className="via" style={{ color: t.ok ? '#c9a227' : '#e8a0a0' }}>{t.ok ? '✓' : '✕'} {t.name} · {t.args.slice(0, 120)}</div>
                          <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace,monospace', color: '#cdbf9c' }}>{t.result.slice(0, 1400)}{t.result.length > 1400 ? '…' : ''}</div>
                        </div>
                      ))}
                    </details>
                  )}
                  {m.workings && (
                    <details style={{ marginTop: 10 }}>
                      <summary>the workers' scrolls ({m.workings.length})</summary>
                      {m.workings.map((w, j) => (
                        <div key={j} style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,.4)', borderRadius: 3, fontSize: 12.5 }}>
                          <div className="via">{w.model}</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{w.out.slice(0, 2200)}{w.out.length > 2200 ? '…' : ''}</div>
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              {busy && <div style={{ fontStyle: 'italic', color: '#e8c95a', padding: '6px 0' }}>⚡ {busy}</div>}
              {err && <div className="msga" style={{ padding: 12, borderColor: '#a33', color: '#e8a0a0', borderRadius: 4 }}>{err}</div>}
              <div ref={endRef} />
            </div>
          </div>

          {/* composer */}
          <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
            <div className="glass" style={{ width: '100%', maxWidth: 760, borderRadius: 6, padding: '12px 14px 10px', position: 'relative' }}>
              <textarea rows={2} value={input} placeholder={active ? `Command ${active.name.split('·')[0].trim()}…` : 'Ask Athena…'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 10.5, color: '#8d8266', letterSpacing: '.1em' }}>enter to send · shift+enter newline</span>
                {/* bottom-right selector */}
                <button onClick={() => setPickerOpen(!pickerOpen)}
                  style={{ background: 'linear-gradient(180deg,#3a2f10,#241d0a)', border: '1px solid #c9a227', color: '#e8c95a', fontFamily: 'inherit', fontSize: 12, letterSpacing: '.08em', padding: '6px 14px', borderRadius: 3, cursor: 'pointer' }}>
                  {active ? active.name.split('·')[0].trim() : short(model)} · {effort} ▾
                </button>
              </div>
              {pickerOpen && (
                <div className="glass" style={{ position: 'absolute', bottom: '105%', right: 0, width: 320, borderRadius: 5, padding: 14, maxHeight: 380, overflowY: 'auto' }}>
                  <div className="via">Gods (delegator packages)</div>
                  {delegators.map((d) => (
                    <button key={d.id} className="rost" style={mode === d.id ? { borderColor: '#e8c95a', color: '#e8c95a' } : {}} onClick={() => { setMode(d.id); setPickerOpen(false) }}>
                      {d.name} <span style={{ opacity: .6, fontSize: 11 }}>— {d.bestFor}</span>
                    </button>
                  ))}
                  <div className="via" style={{ marginTop: 10 }}>Single voice</div>
                  {MODELS.map((m) => (
                    <button key={m.id} className="rost" style={mode === 'single' && model === m.id ? { borderColor: '#e8c95a', color: '#e8c95a' } : {}} onClick={() => { setMode('single'); setModel(m.id); setPickerOpen(false) }}>{m.label}</button>
                  ))}
                  <div className="via" style={{ marginTop: 10 }}>Depth of thought</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['low', 'medium', 'high'] as const).map((e) => (
                      <button key={e} className="rost" style={{ marginBottom: 0, textAlign: 'center', ...(effort === e ? { borderColor: '#e8c95a', color: '#e8c95a' } : {}) }} onClick={() => setEffort(e)}>{e}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'delegation' && (
        <div style={{ position: 'absolute', top: 50, bottom: 0, left: 0, right: 0, overflowY: 'auto', padding: '18px 26px' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
            <div>
              <div className="via" style={{ margin: 0 }}>✦ Pantheon · The Ensemble</div>
              <div style={{ fontSize: 26, letterSpacing: '.18em' }}>MINISTRY OF EXPERTS</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {delegators.map((d) => (
                <button key={d.id} className="rost" style={{ width: 'auto', marginBottom: 0, ...(editId === d.id ? { borderColor: '#e8c95a', color: '#e8c95a' } : {}) }} onClick={() => { setEditId(d.id); setSlotSel(null) }}>{d.name}</button>
              ))}
              <button className="rost" style={{ width: 'auto', marginBottom: 0 }} onClick={() => { pinnedRef.current.clear(); localStorage.removeItem('athena-op-pinned'); setHeld(null); setSlotSel(null); setDelegators(flagship ? DEFAULTS.map((d) => ({ ...d, operator: flagship })) : DEFAULTS) }}>use default</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* THE BENCH */}
            <div className="glass" style={{ flex: '1 1 380px', maxWidth: 560, borderRadius: 5, padding: 14 }}>
              <div className="via">{held ? `Holding ${short(held)} — click a seat →` : slotSel !== null ? `${slotSel === -1 ? 'Core' : `Expert ${slotSel + 1}`} armed — click a model →` : 'The Bench — click a model, then a seat'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                {bench.map((id, rank) => {
                  const seat = editing.workers.indexOf(id)
                  const isOp = editing.operator === id
                  const isHeld = held === id
                  return (
                    <button key={id} onClick={() => onBench(id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: isHeld ? 'rgba(201,162,39,.22)' : 'rgba(10,8,4,.55)', border: `1px solid ${isHeld ? '#fff' : isOp ? '#e8c95a' : seat >= 0 ? '#c9a227' : 'rgba(201,162,39,.25)'}`, borderRadius: 4, padding: '6px 9px', cursor: 'pointer', color: '#efe6d0', fontFamily: 'inherit', position: 'relative', transition: 'border-color .15s, background .15s' }}>
                      <Logo id={id} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{short(id)}</span>
                        <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.12em', color: '#c9a227' }}>ARENA #{rank + 1}</span>
                      </span>
                      {isOp && <span style={{ position: 'absolute', top: 4, right: 6 }}>👑</span>}
                      {seat >= 0 && !isOp && <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, border: '1px solid #c9a227', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8c95a' }}>{seat + 1}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* ORCHESTRATOR GRAPH */}
            <div className="glass" style={{ flex: '1 1 420px', borderRadius: 5, padding: 16, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <img src={olympus} alt="" aria-hidden="true" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .5 }} />
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 95% at 50% 40%, rgba(10,8,4,.34), rgba(8,6,3,.86))' }} />
              <div style={{ position: 'relative' }}>
              <div className="via" style={{ textAlign: 'center' }}>Core · Orchestrator</div>
              <svg width="100%" height="322" viewBox="0 0 560 322">
                <defs>
                  <linearGradient id="feed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(232,201,90,.95)" />
                    <stop offset="1" stopColor="rgba(232,201,90,.4)" />
                  </linearGradient>
                  <filter id="feedglow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="2" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {/* feeds: solid glowing lines core → experts (was faint dashes) */}
                {WXS.map((x, i) => {
                  const cx = x * 0.93 + 20
                  const on = !!editing.workers[i]
                  return (
                    <g key={i} filter={on ? 'url(#feedglow)' : undefined}>
                      <path d={`M 280 126 C 280 165, ${cx} 158, ${cx} 196`} fill="none" stroke={on ? 'url(#feed)' : 'rgba(201,162,39,.22)'} strokeWidth={on ? 2 : 1.2} strokeLinecap="round" />
                      {on && <circle cx={cx} cy="196" r="2.6" fill="rgba(240,225,150,.95)" />}
                    </g>
                  )
                })}
                {/* CORE — click to arm/place; holding a model drops it here (and pins it) */}
                <g className="nodecirc" onClick={() => onSeat(-1, true)} style={{ cursor: 'pointer' }}>
                  <circle cx="280" cy="66" r={slotSel === -1 ? 33 : 30} fill="#f7f3e8" stroke={slotSel === -1 ? '#fff' : 'none'} strokeWidth={slotSel === -1 ? 2.5 : 0} />
                  <image href={logoUrl(editing.operator)} x="262" y="48" width="36" height="36" preserveAspectRatio="xMidYMid meet" />
                  <text x="280" y="116" textAnchor="middle" fill="#efe6d0" fontSize="12.5" fontFamily="Palatino,serif">{short(editing.operator)}</text>
                </g>
                {/* EXPERTS — circular logos with white rings */}
                {WXS.map((x, i) => {
                  const cx = x * 0.93 + 20
                  const w = editing.workers[i]
                  const sel = slotSel === i
                  return (
                    <g key={i} className="nodecirc" onClick={() => onSeat(i, !!w)} style={{ cursor: 'pointer' }}>
                      <text x={cx} y="212" textAnchor="middle" fill="#c9a227" fontSize="9" letterSpacing="2" fontFamily="Palatino,serif">EXPERT {i + 1}</text>
                      {w ? (
                        <>
                          <circle cx={cx} cy="248" r={sel ? 30 : 27} fill="#f7f3e8" stroke={sel ? '#fff' : 'none'} strokeWidth={sel ? 2.4 : 0} />
                          <image href={logoUrl(w)} x={cx - 16} y="232" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
                          <text x={cx} y="297" textAnchor="middle" fill="#efe6d0" fontSize="12" fontFamily="Palatino,serif">{short(w)}</text>
                          {held && <text x={cx} y="248" textAnchor="middle" fill="#8a7420" fontSize="8" letterSpacing="1" fontFamily="Palatino,serif" pointerEvents="none">swap</text>}
                        </>
                      ) : (
                        <>
                          <circle cx={cx} cy="248" r={sel || held ? 29 : 27} fill="rgba(10,8,4,.45)" stroke={sel ? '#fff' : held ? 'rgba(232,201,90,.8)' : 'rgba(255,255,255,.35)'} strokeWidth={sel ? 2.4 : 1.4} strokeDasharray="6 6" />
                          <text x={cx} y="253" textAnchor="middle" fill="#b9ad92" fontSize="11" fontFamily="Palatino,serif">{sel || held ? 'place' : 'empty'}</text>
                        </>
                      )}
                    </g>
                  )
                })}
              </svg>
              {/* MAX TOKENS / CALL */}
              <div style={{ marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="via" style={{ margin: 0 }}>Max tokens / call</span>
                  <span style={{ color: '#e8c95a', fontSize: 15 }}>{maxTok.toLocaleString()}</span>
                </div>
                <input type="range" min="1024" max="16384" step="512" value={maxTok} onChange={(e) => setMaxTok(Number(e.target.value))} style={{ width: '100%', accentColor: '#c9a227' }} />
                <div style={{ fontSize: 11, color: '#b9ad92', fontStyle: 'italic' }}>Sweet spot ~4,096 — expert answers stay short and sharp, so the core gets clean signal.</div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
