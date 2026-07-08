/**
 * Agent tool-use — gives Athena & Odin real hands on Kaiden's machine.
 *
 * The models run a standard OpenAI-style function-calling loop against OpenRouter;
 * each tool call is executed by the local bridge (127.0.0.1:5177) which shells out
 * via execFile arg-arrays (no shell → the model picks the command but can't inject a
 * second one). Capabilities: full GitHub CLI (`gh`, authenticated as kaidena9), `git`
 * in local repos, file reads, and headless Claude Code tasks.
 *
 * Fully autonomous by Kaiden's explicit choice — no in-UI approval, no destructive-op
 * guard. Safe only because the bridge is localhost-only and never in the public bundle.
 */

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'
const BRIDGE = 'http://localhost:5177'
const orKey = (): string => localStorage.getItem('wc-openrouter-key') || ''

export interface ChatMsg {
  role: string
  content?: string | null
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}
export interface ToolEvent { name: string; args: Record<string, unknown>; result: string; ok: boolean }

/** OpenAI/OpenRouter function-calling schema advertised to the model. */
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'gh',
      description:
        'Run the GitHub CLI (`gh`) as Kaiden (authenticated account kaidena9) — the same access as his GitHub connector, plus write. Full surface: issues, pull requests, repos, releases, Actions runs, and raw REST/GraphQL via `gh api`. Pass argv as a string array. Prefer `--json <fields>` for machine-readable output. WRITE-CAPABLE: create/comment/merge/edit/close all work. Examples: ["pr","list","--repo","kaidena9/720tech","--json","number,title,state"]; ["issue","create","--repo","kaidena9/720tech","--title","Fix nav","--body","..."]; ["api","repos/kaidena9/720tech/commits?per_page=5"].',
      parameters: {
        type: 'object',
        properties: {
          args: { type: 'array', items: { type: 'string' }, description: 'argv passed straight to gh (no shell)' },
          cwd: { type: 'string', description: 'optional repo dir (absolute or home-relative) for repo-context commands' }
        },
        required: ['args']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git',
      description:
        'Run git as Kaiden inside one of his local repos. Always pass `cwd` (repo dir, e.g. "720tech" or "/Users/kaiden/720tech"). WRITE-CAPABLE: status/log/diff/add/commit/branch/checkout/push all work. Example: {cwd:"720tech", args:["commit","-am","Update copy"]}.',
      parameters: {
        type: 'object',
        properties: {
          args: { type: 'array', items: { type: 'string' }, description: 'argv passed straight to git (no shell)' },
          cwd: { type: 'string', description: 'repo directory (absolute or home-relative)' }
        },
        required: ['args', 'cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: "Read a UTF-8 file from Kaiden's machine for reference. Path is absolute or relative to his home dir.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'file path (absolute or home-relative)' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: "List a directory on Kaiden's machine (absolute or home-relative path). Directories are suffixed with '/'.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'directory path (absolute or home-relative); defaults to home' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'claude_task',
      description:
        "Delegate a whole multi-step job to Claude Code running headless on Kaiden's machine — it can read/edit files, run builds and tests, and use git. Use for autonomous work bigger than a single command, e.g. 'in ~/720tech add a contact form section and commit it'. Returns Claude's final output. Slow (up to 10 min) — use sparingly for real tasks, not lookups.",
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'the full task instruction for Claude Code' },
          cwd: { type: 'string', description: 'optional working dir (absolute or home-relative); defaults to home' }
        },
        required: ['prompt']
      }
    }
  }
]

/** Perplexity models can't tool-call on OpenRouter; everything else we treat as capable. */
export const supportsTools = (model: string): boolean => !/perplexity\//i.test(model)

function accrueCost(data: { usage?: { cost?: number } }): void {
  const cost = Number(data?.usage?.cost || 0)
  if (cost <= 0) return
  const mk = new Date().toISOString().slice(0, 7)
  const led = JSON.parse(localStorage.getItem('athena-costs') || '{}')
  led[mk] = (led[mk] || 0) + cost
  localStorage.setItem('athena-costs', JSON.stringify(led))
  window.dispatchEvent(new Event('athena-cost'))
}

/** Execute one tool call on the local bridge; returns text to feed back to the model. */
export async function execTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch(`${BRIDGE}/api/tools/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: name, ...args }),
      signal: AbortSignal.timeout(name === 'claude_task' ? 600000 : 130000)
    })
    const d = await res.json()
    if (!res.ok) return { ok: false, text: d?.error || `bridge ${res.status}` }
    if (d.ok) return { ok: true, text: (d.stdout || '(no output)') + (d.stderr ? `\n[stderr]\n${d.stderr}` : '') }
    return { ok: false, text: `ERROR: ${d.error || 'failed'}${d.stdout ? `\n${d.stdout}` : ''}` }
  } catch (e) {
    return { ok: false, text: `bridge unreachable — is Agentic OS running? (${(e as Error).message})` }
  }
}

interface ChatOpts {
  effort?: string
  maxTokens?: number
  maxHops?: number
  onEvent?: (e: ToolEvent) => void
}

/**
 * Chat completion with an autonomous tool-use loop. Models without tool support (or
 * when the bridge is down) fall back to a plain single-shot completion.
 */
export async function chatWithTools(
  model: string,
  messages: ChatMsg[],
  opts: ChatOpts = {}
): Promise<{ content: string; events: ToolEvent[] }> {
  const useTools = supportsTools(model)
  const events: ToolEvent[] = []
  const convo: ChatMsg[] = [...messages]
  const maxHops = opts.maxHops ?? 8

  for (let hop = 0; hop <= maxHops; hop++) {
    const body: Record<string, unknown> = { model, messages: convo, max_tokens: opts.maxTokens ?? 5000, usage: { include: true } }
    if (opts.effort) body.reasoning = { effort: opts.effort }
    if (useTools) { body.tools = TOOLS; body.tool_choice = 'auto' }

    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || `OpenRouter ${res.status}`)
    accrueCost(data)

    const msg = data.choices?.[0]?.message as ChatMsg | undefined
    if (!msg) return { content: '', events }
    const calls = msg.tool_calls
    if (!useTools || !calls || calls.length === 0) return { content: msg.content ?? '', events }

    convo.push(msg) // assistant turn carrying the tool_calls
    for (const call of calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { /* malformed args */ }
      const r = await execTool(call.function.name, args)
      const ev: ToolEvent = { name: call.function.name, args, result: r.text, ok: r.ok }
      events.push(ev)
      opts.onEvent?.(ev)
      convo.push({ role: 'tool', tool_call_id: call.id, content: r.text })
    }
  }
  return { content: '(stopped — hit the tool-hop limit. Ask me to continue and I will keep going.)', events }
}

/** One-line human summary of a tool call, for the live "working…" indicator. */
export function summarizeTool(e: ToolEvent): string {
  if (e.name === 'gh' || e.name === 'git') return `${e.name} ${(e.args.args as string[] | undefined)?.slice(0, 3).join(' ') ?? ''}`
  if (e.name === 'read_file' || e.name === 'list_dir') return `${e.name} ${String(e.args.path ?? '')}`
  if (e.name === 'claude_task') return 'claude_task (delegating a job…)'
  return e.name
}
