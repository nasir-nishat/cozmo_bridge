'use client'

import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { GroupCard } from '@/components/kakao/GroupCard'
import { StatsBar } from '@/components/kakao/StatsBar'
import type { KakaoGroup, ScanResult } from '@/lib/types'

const BRIDGE = '/api/bridge'

export default function KakaoPage() {
  const [groups, setGroups] = useState<KakaoGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dryRun, setDryRun] = useState(false)
  const [scanningAll, setScanningAll] = useState(false)
  const [scanningGroup, setScanningGroup] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({})

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/kakao/groups`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      const order: Record<string, number> = { CHECKED_IN: 0, BOOKED: 1, PAID_IN_FULL: 1 }
      data.groups.sort((a: KakaoGroup, b: KakaoGroup) =>
        (order[a.booking?.status ?? ''] ?? 9) - (order[b.booking?.status ?? ''] ?? 9)
      )
      setGroups(data.groups)
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  const scanGroup = async (groupKey: string) => {
    setScanningGroup(groupKey)
    try {
      const res = await fetch(`${BRIDGE}/admin/kakao/scan-expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupKey, dryRun }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      const map: Record<string, ScanResult> = {}
      for (const r of data.results) map[r.groupKey] = r
      setScanResults(prev => ({ ...prev, ...map }))
      await loadGroups()
      const r = data.results.find((r: ScanResult) => r.groupKey === groupKey)
      if (r?.newCount) toast.success(`Recovered ${r.newCount} expense(s)${dryRun ? ' · dry run' : ''}`)
      else toast.info('No missed /exp commands found')
    } catch (e: any) {
      toast.error(`Scan error: ${e.message}`)
    } finally {
      setScanningGroup(null)
    }
  }

  const scanAll = async () => {
    setScanningAll(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/kakao/scan-expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      const map: Record<string, ScanResult> = {}
      for (const r of data.results) map[r.groupKey] = r
      setScanResults(map)
      await loadGroups()
      if (data.totalNew > 0) toast.success(`Recovered ${data.totalNew} expense(s) · ${data.totalSkipped} already in Sheets${dryRun ? ' · dry run' : ''}`)
      else toast.info(`All caught up — ${data.totalSkipped} already in Sheets`)
    } catch (e: any) {
      toast.error(`Scan error: ${e.message}`)
    } finally {
      setScanningAll(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col md:h-[calc(100vh-3rem)]">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between mb-4">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">KakaoTalk</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-[#6e6e73] cursor-pointer select-none touch-manipulation">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run
          </label>
          <Button variant="secondary" size="sm" onClick={loadGroups}>
            <RotateCcw className="w-3 h-3" />
            Refresh
          </Button>
          <Button size="sm" disabled={scanningAll} onClick={scanAll}>
            <Zap className="w-3 h-3" />
            {scanningAll ? 'Scanning…' : 'Scan All'}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-16">Loading groups…</p>
      ) : groups.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">No linked KakaoTalk groups found.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <StatsBar groups={groups} />
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {groups.map(g => (
              <GroupCard
                key={g.groupKey}
                group={g}
                scanResult={scanResults[g.groupKey]}
                onScan={scanGroup}
                scanning={scanningGroup === g.groupKey}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
