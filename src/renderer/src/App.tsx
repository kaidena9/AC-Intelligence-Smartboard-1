import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { useStore } from './store/useStore'
import { cn } from './lib/util'
import { Hub } from './pages/Hub'
import { Inbox } from './pages/Inbox'
import { Leads } from './pages/Leads'
import { Wizard } from './pages/Wizard'
import { Projects } from './pages/Projects'
import { Settings } from './pages/Settings'
import { Studio } from './pages/Studio'
import { Ops } from './pages/Ops'
import { Sessions } from './pages/Sessions'
import { Athena } from './pages/Athena'
import { Odin } from './pages/Odin'
import ambient from './assets/app-ambient.jpg'

const FULL_BLEED = new Set(['studio', 'ops'])


export default function App(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const hydrate = useStore((s) => s.hydrate)
  const hydrated = useStore((s) => s.hydrated)
  const checkGithub = useStore((s) => s.checkGithub)
  const fullBleed = FULL_BLEED.has(view)

  // Auto-fill the OpenRouter key from the local bridge (localhost) if not already set,
  // so Athena/Odin/Whiteboard work without pasting it — key never enters the public bundle.
  useEffect(() => {
    if (localStorage.getItem('wc-openrouter-key')) return
    void (async () => {
      try {
        const cfg = await (await fetch('http://localhost:5177/api/config', { signal: AbortSignal.timeout(5000) })).json()
        if (cfg?.openrouterKey) localStorage.setItem('wc-openrouter-key', cfg.openrouterKey)
      } catch { /* bridge offline — paste-once still works */ }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      await hydrate()
      await checkGithub()
      const st = useStore.getState()
      if (st.githubStatus?.connected && !localStorage.getItem('wc-autosynced-v7')) {
        try {
          await st.syncFromGitHub()
        } finally {
          localStorage.setItem('wc-autosynced-v7', '1')
        }
      }
    })()
  }, [hydrate, checkGithub])

  return (
    <div className="relative flex h-full overflow-hidden text-text">
      {/* The aurora world — everything floats above it. */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <img src={ambient} alt="" className="h-full w-full object-cover" draggable={false} />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,7,13,.45) 0%, rgba(7,7,13,.62) 55%, rgba(7,7,13,.88) 100%)'
          }}
        />
      </div>

      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main
          className={cn(
            'min-h-0 flex-1',
            fullBleed ? 'overflow-hidden' : 'overflow-y-auto px-7 pb-7 pt-6'
          )}
        >
          {!hydrated ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading your dashboard…
            </div>
          ) : (
            <>
              {view === 'hub'        && <Hub />}
              {view === 'inbox'      && <Inbox />}
              {view === 'leads'      && <Leads />}
              {view === 'wizard'     && <Wizard />}
              {view === 'projects'   && <Projects />}
              {view === 'settings'   && <Settings />}
              {view === 'studio'     && <Studio />}
              {view === 'ops'        && <Ops />}
              {view === 'sessions'   && <Sessions />}
              {view === 'athena'     && <Athena />}
              {view === 'odin'       && <Odin />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
