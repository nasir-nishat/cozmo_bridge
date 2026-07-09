'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import BookingTrendChart from '@/components/BookingTrendChart'
import type { AnalyticsDay, AnalyticsResponse, PropertyOption } from '@/lib/types'

const BRIDGE = '/api/bridge'

type RangeKey = '30d' | '90d' | '6m' | '1y' | '3y' | '5y'
const RANGE_DAYS: Record<RangeKey, number> = { '30d': 30, '90d': 90, '6m': 182, '1y': 365, '3y': 1095, '5y': 1826 }
const RANGE_LABELS: Record<RangeKey, string> = { '30d': '30D', '90d': '90D', '6m': '6M', '1y': '1Y', '3y': '3Y', '5y': '5Y' }

function kstToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}
function kstDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

export default function AnalyticsPage() {
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [propertyUid, setPropertyUid] = useState('')
  const [range, setRange] = useState<RangeKey>('90d')
  const [days, setDays] = useState<AnalyticsDay[]>([])
  const [loading, setLoading] = useState(true)
  const [scannedLeads, setScannedLeads] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const from = useMemo(() => kstDaysAgo(RANGE_DAYS[range]), [range])
  const to = useMemo(() => kstToday(), [])

  useEffect(() => {
    fetch(`${BRIDGE}/admin/properties`)
      .then(r => r.json())
      .then(data => { if (data.ok) setProperties(data.properties) })
      .catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      if (propertyUid) params.set('propertyUid', propertyUid)
      const res = await fetch(`${BRIDGE}/admin/bookings/analytics?${params}`)
      const data: AnalyticsResponse = await res.json()
      if (!data.ok) throw new Error(data.error)
      setDays(data.days)
      setScannedLeads(data.scannedLeads)
      setTruncated(data.truncated)
      setNextCursor(data.nextCursor)
    } catch (e: any) {
      toast.error(`Failed to load analytics: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [propertyUid, range])

  const loadOlder = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ from, to, cursor: nextCursor })
      if (propertyUid) params.set('propertyUid', propertyUid)
      const res = await fetch(`${BRIDGE}/admin/bookings/analytics?${params}`)
      const data: AnalyticsResponse = await res.json()
      if (!data.ok) throw new Error(data.error)
      setDays(prev => {
        const byDate = new Map(prev.map(d => [d.date, { ...d }]))
        for (const d of data.days) {
          const cur = byDate.get(d.date)
          if (cur) { cur.newCount += d.newCount; cur.cancelledCount += d.cancelledCount }
        }
        return Array.from(byDate.values())
      })
      setScannedLeads(s => s + data.scannedLeads)
      setTruncated(data.truncated)
      setNextCursor(data.nextCursor)
    } catch (e: any) {
      toast.error(`Failed to extend scan: ${e.message}`)
    } finally {
      setLoadingMore(false)
    }
  }

  const totals = useMemo(() => days.reduce((acc, d) => ({
    newCount: acc.newCount + d.newCount, cancelledCount: acc.cancelledCount + d.cancelledCount,
  }), { newCount: 0, cancelledCount: 0 }), [days])

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Analytics</h1>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filters — one row, date range first */}
      <div className="flex items-center gap-2 mb-4 flex-wrap md:shrink-0">
        <div className="flex gap-1.5">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors touch-manipulation',
                range === r ? 'bg-[#1d1d1f] text-white' : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <select value={propertyUid} onChange={e => setPropertyUid(e.target.value)}
          className="ml-auto px-2.5 py-1.5 rounded-md text-[12px] bg-[#f2f2f7] text-[#1d1d1f] border-none touch-manipulation"
        >
          <option value="">All properties</option>
          {properties.map(p => <option key={p.uid} value={p.uid}>{p.name}</option>)}
        </select>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 mb-4 md:shrink-0">
        <div className="bg-white rounded-lg border border-border p-3">
          <p className="text-[11px] text-[#8e8e93] mb-1">New bookings</p>
          <p className="text-[22px] font-semibold text-[#1d1d1f]">{totals.newCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-border p-3">
          <p className="text-[11px] text-[#8e8e93] mb-1">Cancelled</p>
          <p className="text-[22px] font-semibold text-[#1d1d1f]">{totals.cancelledCount}</p>
        </div>
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
        <BookingTrendChart days={days} loading={loading} />

        <div className="mt-3 flex items-center justify-between text-[11px] text-[#8e8e93]">
          <span>Scanned {scannedLeads.toLocaleString()} leads · Hostfully has no server-side date filter, so wider ranges scan more</span>
        </div>

        {truncated && nextCursor && (
          <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-md bg-[#fffbeb] text-[12px] text-[#8e8e93]">
            <span>Scan hit its time budget before covering the full range — older days may be undercounted.</span>
            <button onClick={loadOlder} disabled={loadingMore}
              className="shrink-0 ml-3 px-2.5 py-1 rounded-md text-[12px] font-medium text-[#1d1d1f] bg-white border border-border hover:bg-[#f2f2f7] transition-colors touch-manipulation disabled:opacity-50"
            >
              {loadingMore ? 'Scanning…' : 'Scan further back'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
