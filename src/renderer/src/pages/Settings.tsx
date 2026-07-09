import { useEffect, useState } from 'react'
import { Card, Button } from '../components/ui'
import { cn } from '../lib/util'
import { useStore } from '../store/useStore'
import { useWhiteboard } from '../store/useWhiteboard'
import { IconGit, IconCheck, IconWizard } from '../components/icons'
const WEB_BACKEND_KEY = 'wc-backend-url'
function isWeb(): boolean {
  return (window as { api?: { platform?: string } }).api?.platform === 'web'
}


function GithubCard(): React.JSX.Element {
  const status = useStore((s) => s.githubStatus)
  const syncing = useStore((s) => s.githubSyncing)
  const checkGithub = useStore((s) => s.checkGithub)
  const syncFromGitHub = useStore((s) => s.syncFromGitHub)
  const setView = useStore((s) => s.setView)
  const [result, setResult] = useState<string | null>(null)
  const [addingAccount, setAddingAccount] = useState(false)
  const [patInput, setPatInput] = useState('')
  const [addStatus, setAddStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const connected = status?.connected
  const reason = status?.reason
  const additionalAccounts = status?.additionalAccounts ?? []

  async function sync(): Promise<void> {
    setResult(null)
    const { added, updated, orphaned } = await syncFromGitHub()
    const parts = [`${added} added`, `${updated} updated`]
    if (orphaned > 0) parts.push(`${orphaned} orphaned (gone from GitHub)`)
    setResult(`Synced — ${parts.join(', ')}.`)
  }

  async function addAccount(): Promise<void> {
    setAddStatus(null)
    const res = await window.api.github.addAccount(patInput.trim())
    if (res.error) {
      setAddStatus({ type: 'error', msg: res.error })
    } else {
      setAddStatus({ type: 'success', msg: `Connected @${res.login}` })
      setPatInput('')
      setAddingAccount(false)
      await checkGithub()
    }
  }

  async function removeAccount(login: string): Promise<void> {
    setRemoving(login)
    await window.api.github.removeAccount(login)
    await checkGithub()
    setRemoving(null)
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-text/5 text-text">
          <IconGit className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">GitHub</h3>

          {/* Primary account display */}
          <div className="mt-2">
            {connected ? (
              <p className="text-sm text-muted">
                <span className="font-medium text-emerald">@{status?.login}</span>
                <span className="ml-2 text-xs text-subtle">{isWeb() ? 'via PAT · primary' : 'via gh CLI · primary'}</span>
              </p>
            ) : (
              <p className="text-sm text-muted">
                {isWeb()
                  ? 'No GitHub account connected. Add a Personal Access Token below.'
                  : reason === 'gh-not-found'
                    ? 'GitHub CLI not found. Install it and run `gh auth login`.'
                    : reason === 'not-authenticated'
                      ? 'GitHub CLI found but not logged in. Run `gh auth login` in your terminal.'
                      : 'Checking connection…'}
              </p>
            )}
          </div>

          {/* Additional accounts */}
          {additionalAccounts.length > 0 && (
            <div className="mt-2 space-y-1">
              {additionalAccounts.map((a) => (
                <div key={a.login} className="flex items-center gap-2">
                  <p className="text-sm text-muted">
                    <span className="font-medium text-emerald">@{a.login}</span>
                    <span className="ml-2 text-xs text-subtle">via PAT</span>
                  </p>
                  <button
                    onClick={() => void removeAccount(a.login)}
                    disabled={removing === a.login}
                    className="ml-auto text-xs text-subtle transition hover:text-red-400"
                  >
                    {removing === a.login ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add account form */}
          {addingAccount ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted">
                Create a{' '}
                <span className="font-medium text-text">Personal Access Token</span> on GitHub
                (Settings → Developer settings → Personal access tokens) with{' '}
                <code className="rounded bg-bg px-1 py-0.5 text-xs">repo</code> scope, then paste
                it here.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  placeholder="ghp_…"
                  className="w-72 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
                <Button onClick={() => void addAccount()} disabled={!patInput.trim()}>
                  Connect
                </Button>
                <Button variant="ghost" onClick={() => { setAddingAccount(false); setAddStatus(null) }}>
                  Cancel
                </Button>
              </div>
              {addStatus && (
                <p className={cn('text-sm font-medium', addStatus.type === 'error' ? 'text-red-400' : 'text-emerald')}>
                  {addStatus.msg}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAddingAccount(true)}
              className="mt-3 text-xs text-muted transition hover:text-text"
            >
              {isWeb() && !connected ? '+ Connect a GitHub account' : '+ Add another GitHub account'}
            </button>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={sync} disabled={!connected || syncing}>
              {syncing ? 'Syncing…' : 'Sync repositories'}
            </Button>
            {connected && (
              <Button variant="subtle" onClick={() => setView('hub')}>
                View sites
              </Button>
            )}
            {!connected && (
              <Button variant="ghost" onClick={() => void checkGithub()}>
                Recheck
              </Button>
            )}
          </div>

          {result && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald">
              <IconCheck className="h-4 w-4" /> {result}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function BackendUrlCard(): React.JSX.Element {
  const [url, setUrl] = useState(() => localStorage.getItem(WEB_BACKEND_KEY) ?? '')
  const [saved, setSaved] = useState(false)

  function save(): void {
    const trimmed = url.trim().replace(/\/$/, '')
    if (trimmed) localStorage.setItem(WEB_BACKEND_KEY, trimmed)
    else localStorage.removeItem(WEB_BACKEND_KEY)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-text/5 text-text">
          <IconWizard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">Terminal Server URL</h3>
          <p className="mt-0.5 text-sm text-muted">
            The terminal runs via a backend server you deploy to Railway (free tier). Paste the
            deployment URL here. See the <code className="rounded bg-bg px-1 py-0.5 text-xs">backend/</code> folder for setup instructions.
          </p>
          {!url && (
            <div className="mt-2 text-sm text-amber">No server URL set — terminal sessions won't connect.</div>
          )}
          {url && (
            <div className="mt-2 text-xs text-muted break-all">
              Current: <span className="font-mono text-text">{url}</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.up.railway.app"
              className="w-80 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <Button onClick={save}>Save</Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald">
                <IconCheck className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function ApiKeyCard(): React.JSX.Element {
  const checkKey = useWhiteboard((s) => s.checkKey)
  const [has, setHas] = useState(false)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.settings.hasApiKey().then(setHas)
  }, [])

  async function save(): Promise<void> {
    const ok = await window.api.settings.setApiKey(key.trim())
    setHas(ok)
    setKey('')
    setSaved(true)
    void checkKey()
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-text/5 text-text">
          <IconWizard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">Image generation (OpenRouter)</h3>
          <p className="mt-0.5 text-sm text-muted">
            Powers the Whiteboard's image generation via the Gemini “nano banana” model. Your key is
            stored locally on this Mac only — never sent anywhere but OpenRouter.
          </p>
          {has ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald">
              <IconCheck className="h-4 w-4" /> Key configured — generation is enabled.
            </div>
          ) : (
            <div className="mt-2 text-sm text-amber">No key set — add one to generate images.</div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-or-v1-…"
              className="w-72 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <Button onClick={() => void save()} disabled={!key.trim()}>
              Save key
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald">
                <IconCheck className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function Settings(): React.JSX.Element {
  const count = useStore((s) => s.projects.length)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="eyebrow mb-2">Configuration</p>
        <h1 className="font-display text-2xl font-bold text-text">Settings</h1>
      </div>
      <GithubCard />
      <ApiKeyCard />
      {isWeb() && <BackendUrlCard />}
      <Card className="p-6">
        <h3 className="font-semibold text-text">Your data</h3>
        <p className="mt-1 text-sm text-muted">
          You're tracking <span className="font-semibold text-text">{count}</span>{' '}
          {count === 1 ? 'repo' : 'repos'}.{' '}
          {isWeb()
            ? 'Everything is stored in your browser\'s localStorage — private to this device and browser.'
            : 'Everything is stored locally on your machine with atomic, backed-up writes — nothing leaves your machine.'}
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-text">About</h3>
        <p className="mt-1 text-sm text-muted">
          AC Intelligence Smartboard — your command center for projects, leads, email, and the Athena &amp; Odin AI operators.
        </p>
        <div className="mt-3 text-xs text-subtle">Version 1.0</div>
      </Card>
    </div>
  )
}
