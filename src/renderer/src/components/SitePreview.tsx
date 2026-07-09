import { useEffect, useRef, useState } from 'react'

const BASE_W = 1280

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/**
 * Live site thumbnail. In Electron uses <webview> (bypasses X-Frame-Options).
 * In the browser, fetches a screenshot via image.thum.io (no API key needed).
 */
export function SitePreview({
  url,
  height = 168
}: {
  url: string
  height?: number
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isElectron = (window as { api?: { platform?: string } }).api?.platform !== 'web'
  const scale = w > 0 ? w / BASE_W : 0
  const baseH = scale > 0 ? height / scale : height

  if (!url) {
    return (
      <div ref={ref} className="flex w-full flex-col items-center justify-center gap-1.5 bg-surface-2 text-subtle" style={{ height }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={{ opacity: 0.45 }}>
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
        </svg>
        <span className="text-[11px]">No live site</span>
      </div>
    )
  }

  /* ── Electron: native <webview> bypasses X-Frame-Options ── */
  if (isElectron) {
    return (
      <div ref={ref} className="relative w-full overflow-hidden bg-bg" style={{ height }}>
        {scale > 0 && (
          <webview
            src={url}
            partition="sitepreview"
            style={{
              position: 'absolute', top: 0, left: 0,
              width: BASE_W, height: baseH, border: '0',
              transform: `scale(${scale})`, transformOrigin: 'top left',
              pointerEvents: 'none'
            }}
          />
        )}
      </div>
    )
  }

  /* ── Web: LIVE scaled iframe (always current — no stale screenshot cache) ──
     Falls back to a screenshot only if the site refuses to be framed. */
  const thumbUrl = `https://image.thum.io/get/width/1280/crop/${Math.round(baseH > 0 ? baseH : 800)}/maxAge/6/${url}`

  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-surface-2" style={{ height }}>
      {!imgError && scale > 0 && (
        <iframe
          src={url}
          title={domain(url)}
          scrolling="no"
          sandbox="allow-scripts allow-same-origin"
          onError={() => setImgError(true)}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: BASE_W, height: baseH, border: '0',
            transform: `scale(${scale})`, transformOrigin: 'top left',
            pointerEvents: 'none'
          }}
        />
      )}
      {imgError && (
        /* Site refuses to be framed → recent screenshot, else a link. */
        <img
          src={thumbUrl}
          alt={domain(url)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      )}
    </div>
  )
}
