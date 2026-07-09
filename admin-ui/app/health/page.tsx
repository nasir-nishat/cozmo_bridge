'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HealthData, AlertEntry } from '@/lib/types'

const BRIDGE = '/api/bridge'

const PLATFORM_META: Record<string, { label: string; mark: string }> = {
  whatsapp: { label: 'WhatsApp', mark: 'WA' },
  line: { label: 'LINE', mark: 'LN' },
  kakao: { label: 'KakaoTalk', mark: 'KT' },
  wechat: { label: 'WeChat', mark: 'WC' },
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${s}s`
}

interface ServiceStatus {
  name: string
  label: string
  mark: string
  publicUrl: string
  target: string
  online: boolean
  statusCode: number | null
  latencyMs: number
  error?: string
}

interface AllStatus {
  services: ServiceStatus[]
  bridgeHealth: HealthData | null
  alertsToday: number | null
}

export default function HealthPage() {
  const [status, setStatus] = useState<AllStatus>({ services: [], bridgeHealth: null, alertsToday: null })
  const [loading, setLoading] = useState(true)
  const [ts, setTs] = useState<Date | null>(null)

  const load = async () => {
    try {
      const serviceRes = await fetch('/api/health/services', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      const serviceData = serviceRes.ok ? await serviceRes.json() : null
      const services: ServiceStatus[] = Array.isArray(serviceData?.services) ? serviceData.services : []
      setStatus(prev => ({ ...prev, services }))

      const bridgeSvc = services.find(s => s.name === 'bridge')
      if (bridgeSvc?.online) {
        try {
          const [healthRes, alertsRes] = await Promise.all([
            fetch(`${BRIDGE}/admin/health`, { signal: AbortSignal.timeout(5000) }),
            fetch(`${BRIDGE}/admin/alerts/recent`, { signal: AbortSignal.timeout(5000) }),
          ])
          const bridgeHealth = healthRes.ok ? await healthRes.json() : null
          const alertData = alertsRes.ok ? await alertsRes.json() : null
          const alertsToday = alertData?.ok && Array.isArray(alertData.alerts)
            ? (alertData.alerts as AlertEntry[]).filter(a => a.ts > Date.now() - 24 * 60 * 60 * 1000).length
            : null
          setStatus(prev => ({ ...prev, bridgeHealth, alertsToday }))
        } catch { /* bridge call failed, but service is online */ }
      }
      setTs(new Date())
    } catch (e) {
      console.error('Health check error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [])

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">System Health</h1>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      {loading ? (
        <p className="text-[13px] text-[#6e6e73] py-12 text-center">Checking services...</p>
      ) : (
        <>
          <h2 className="text-[13px] font-semibold text-[#6e6e73] mb-2 uppercase tracking-wider">Services</h2>
          <div className="bg-white rounded-lg border border-border overflow-hidden mb-4">
            {status.services.map((svc, i) => (
              <div key={svc.name}>
                {i > 0 && <div className="h-px bg-border ml-14" />}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-8 h-8 rounded-md bg-[#f2f2f7] text-[#6e6e73] flex items-center justify-center text-[11px] font-semibold tracking-tight">
                    {svc.mark}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] text-[#1d1d1f]">{svc.label}</p>
                    <p className="text-[11px] text-[#8e8e93] font-mono truncate">
                      {svc.publicUrl} -&gt; {svc.target}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={cn('w-2 h-2 rounded-full', svc.online ? 'bg-[#34c759]' : 'bg-[#ff3b30]')} />
                    <span className={cn('text-[12px]', svc.online ? 'text-[#34c759]' : 'text-[#ff3b30]')}>
                      {svc.online ? 'Online' : 'Offline'}
                    </span>
                    <span className="hidden sm:inline text-[11px] text-[#8e8e93] tabular-nums">
                      {svc.statusCode ?? 'ERR'} · {svc.latencyMs}ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {status.bridgeHealth && (
            <>
              <h2 className="text-[13px] font-semibold text-[#6e6e73] mb-2 uppercase tracking-wider">Bridge Details</h2>
              <div className="flex gap-2 mb-4 flex-wrap">
                {[
                  { label: 'Uptime', value: formatUptime(status.bridgeHealth.bridge.uptimeSeconds) },
                  { label: 'Mode', value: status.bridgeHealth.bridge.mode.toUpperCase() },
                  { label: 'Alerts (24h)', value: status.alertsToday !== null ? String(status.alertsToday) : '-' },
                ].map(s => (
                  <div
                    key={s.label}
                    className="flex items-center gap-1.5 bg-white rounded-md border border-border px-3 py-1.5"
                  >
                    <span className="text-[11px] text-[#8e8e93]">{s.label}</span>
                    <span className="text-[13px] font-semibold text-[#1d1d1f] tabular-nums">{s.value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-lg border border-border overflow-hidden">
                {(Object.entries(status.bridgeHealth.platforms) as [string, any][]).map(([key, p], i) => {
                  const meta = PLATFORM_META[key] ?? { label: key, mark: key.slice(0, 2).toUpperCase() }
                  const disabled = !p.enabled
                  const ok = p.enabled && p.connected
                  return (
                    <div key={key}>
                      {i > 0 && <div className="h-px bg-border ml-14" />}
                      <div className={cn('flex items-center gap-3 px-4 py-3', disabled && 'opacity-40')}>
                        <span className="w-8 h-8 rounded-md bg-[#f2f2f7] text-[#6e6e73] flex items-center justify-center text-[11px] font-semibold tracking-tight">
                          {meta.mark}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] text-[#1d1d1f]">{meta.label}</p>
                          {key === 'kakao' && p.enabled && p.ageMs !== null && (
                            <p className={cn('text-[11px] tabular-nums',
                              p.ageMs < 60_000 ? 'text-[#34c759]' : p.ageMs < 300_000 ? 'text-[#ff9500]' : 'text-[#ff3b30]',
                            )}>
                              Heartbeat {Math.floor(p.ageMs / 1000)}s ago
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className={cn('w-2 h-2 rounded-full',
                            disabled ? 'bg-[#c7c7cc]' : ok ? 'bg-[#34c759]' : 'bg-[#ff3b30]',
                          )} />
                          <span className={cn('text-[12px]',
                            disabled ? 'text-[#8e8e93]' : ok ? 'text-[#34c759]' : 'text-[#ff3b30]',
                          )}>
                            {disabled ? 'Off' : ok ? 'OK' : 'Down'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {ts && (
            <p className="text-[11px] text-[#c7c7cc] mt-3 text-right tabular-nums">
              {ts.toLocaleTimeString()}
            </p>
          )}
        </>
      )}
      </div>
    </>
  )
}
