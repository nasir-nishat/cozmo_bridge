'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupEntry } from '@/lib/types'

const BRIDGE = '/api/bridge'

const PLATFORM_META = {
  whatsapp: { label: 'WhatsApp',  icon: '📱', color: '#25d366' },
  line:     { label: 'LINE',      icon: '💚', color: '#06c755' },
  kakao:    { label: 'KakaoTalk', icon: '💬', color: '#f9c000' },
  wechat:   { label: 'WeChat',    icon: '🟢', color: '#07c160' },
  unknown:  { label: 'Unknown',   icon: '❓', color: '#8e8e93' },
}

type Filter = 'all' | 'whatsapp' | 'line' | 'kakao' | 'wechat'

function shortProp(name: string) {
  return name.replace(/^[A-Z0-9_]+_/, '')
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/groups`)
      const data = await res.json()
      if (data.ok) setGroups(data.groups)
    } catch { /* bridge offline */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const counts: Record<string, number> = { all: groups.length }
  for (const g of groups) counts[g.platform] = (counts[g.platform] || 0) + 1

  const filtered = filter === 'all' ? groups : groups.filter(g => g.platform === filter)

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',      label: `All (${counts.all || 0})` },
    { key: 'whatsapp', label: `WA (${counts.whatsapp || 0})` },
    { key: 'line',     label: `LINE (${counts.line || 0})` },
    { key: 'kakao',    label: `Kakao (${counts.kakao || 0})` },
    { key: 'wechat',   label: `WeChat (${counts.wechat || 0})` },
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Groups</h1>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap md:shrink-0">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors touch-manipulation',
              filter === f.key
                ? 'bg-[#1d1d1f] text-white'
                : 'bg-[#f2f2f7] text-[#6e6e73] hover:bg-[#e5e5ea]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      {loading ? (
        <p className="text-[13px] text-[#6e6e73] py-12 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-border py-10 text-center">
          <p className="text-[13px] text-[#8e8e93]">No groups found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          {filtered.map((g, i) => {
            const meta = PLATFORM_META[g.platform as keyof typeof PLATFORM_META] ?? PLATFORM_META.unknown
            const shortId = g.groupId.replace(/^(line:|kakao:|wechat:)/, '').slice(0, 20)
            return (
              <div key={g.groupId}>
                {i > 0 && <div className="h-px bg-border ml-14" />}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[16px] shrink-0 bg-[#f2f2f7]">
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#1d1d1f] truncate">
                      {g.name ?? <span className="font-normal text-[#8e8e93]">{shortId}…</span>}
                    </p>
                    <p className="text-[11px] text-[#8e8e93] truncate">
                      {meta.label} · {g.leadUid.slice(0, 8)}…
                    </p>
                  </div>
                  {g.booking ? (
                    <div className="text-right shrink-0 max-w-[120px]">
                      <p className="text-[12px] font-medium text-[#1d1d1f] truncate">{g.booking.guestName}</p>
                      <p className="text-[11px] text-[#8e8e93] truncate">
                        {shortProp(g.booking.property)} · {g.booking.checkIn}
                      </p>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[#c7c7cc] shrink-0">No booking</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </>
  )
}
