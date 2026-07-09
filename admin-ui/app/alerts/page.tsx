'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AlertEntry } from '@/lib/types'

const BRIDGE = '/api/bridge'
const PLATFORM_COLOR: Record<string, string> = {
  WHATSAPP:  '#25d366',
  LINE:      '#06c755',
  KAKAO:     '#f9c000',
  WECHAT:    '#07c160',
  HOSTFULLY: '#007aff',
  GENERAL:   '#8e8e93',
}

function AlertRow({ alert }: { alert: AlertEntry }) {
  const lines = alert.plainText.split('\n').filter(l => l.trim() && l !== '─────────────────')
  const title = lines[0] ?? ''
  const body = lines.slice(1).filter(l => !l.startsWith('via COZMO'))
  const platform = alert.platform ?? 'GENERAL'
  const color = PLATFORM_COLOR[platform] ?? '#8e8e93'
  const time = new Date(alert.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-[3px] self-stretch rounded-full mt-0.5 shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#1d1d1f] leading-tight">{title}</p>
        {body.slice(0, 2).map((line, i) => (
          <p key={i} className="text-[12px] text-[#6e6e73] mt-0.5 leading-tight truncate">{line}</p>
        ))}
      </div>
      <div className="shrink-0 text-right">
        <span className="text-[11px] text-[#8e8e93] tabular-nums">{time}</span>
        <br />
        <span className="text-[10px] text-[#c7c7cc]">{platform.toLowerCase()}</span>
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [liveCount, setLiveCount] = useState(0)
  const seenIds = useRef(new Set<string>())

  useEffect(() => {
    // Seed with history immediately — don't wait for SSE to open
    fetch(`${BRIDGE}/admin/alerts/recent`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return
        const fresh = (data.alerts as AlertEntry[]).filter(a => !seenIds.current.has(a.id))
        fresh.forEach(a => seenIds.current.add(a.id))
        setAlerts(fresh)
      })
      .catch(() => {})

    // SSE for live updates
    const es = new EventSource(`${BRIDGE}/admin/alerts/stream`)
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try {
        const alert: AlertEntry = JSON.parse(e.data)
        if (seenIds.current.has(alert.id)) return
        seenIds.current.add(alert.id)
        setAlerts(prev => [alert, ...prev].slice(0, 100))
        setLiveCount(c => c + 1)
      } catch { /* ignore */ }
    }
    return () => es.close()
  }, [])

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Alerts</h1>
        <div className="flex items-center gap-2">
          <div className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-[#34c759]' : 'bg-[#c7c7cc]')} />
          <span className={cn('text-[12px]', connected ? 'text-[#34c759]' : 'text-[#8e8e93]')}>
            {connected ? 'Live' : 'Connecting'}
          </span>
          {liveCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#007aff] text-white text-[10px] font-bold tabular-nums">
              +{liveCount}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-border overflow-hidden md:flex-1 md:min-h-0 md:overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-[#8e8e93]">
            {connected ? 'Waiting for alerts…' : 'Loading…'}
          </p>
        ) : (
          alerts.map((a, i) => (
            <div key={a.id}>
              {i > 0 && <div className="h-px bg-border ml-8" />}
              <AlertRow alert={a} />
            </div>
          ))
        )}
      </div>
    </>
  )
}
