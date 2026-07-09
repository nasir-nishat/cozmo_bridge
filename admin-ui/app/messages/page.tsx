'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronLeft, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BufferGroup } from '@/lib/types'

const PLATFORM_META: Record<string, { icon: string; color: string }> = {
  WhatsApp: { icon: '📱', color: '#25d366' },
  LINE: { icon: '💚', color: '#06c755' },
  KakaoTalk: { icon: '💬', color: '#f9c000' },
  WeChat: { icon: '🟢', color: '#07c160' },
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function MessagesPage() {
  const [groups, setGroups] = useState<BufferGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      setGroups(data.groups ?? [])
    } catch { /* admin-ui data route offline */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const selectedGroup = groups.find(g => g.groupKey === selected) ?? null

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Messages</h1>
          <p className="mt-0.5 text-[12px] text-[#6e6e73]">
            Live buffer of recent guest group chats — last 24 hours
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr] md:flex-1 md:min-h-0">
        {/* Group list */}
        <div className={cn(selectedGroup ? 'hidden md:block' : 'block', 'md:overflow-y-auto md:min-h-0')}>
          {loading ? (
            <p className="text-[13px] text-[#6e6e73] py-12 text-center">Loading…</p>
          ) : groups.length === 0 ? (
            <div className="bg-white rounded-lg border border-border py-10 text-center">
              <p className="text-[13px] text-[#8e8e93]">No buffered messages yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-border overflow-hidden">
              {groups.map((g, i) => {
                const meta = PLATFORM_META[g.platform] ?? { icon: '❓', color: '#8e8e93' }
                const isActive = g.groupKey === selected
                return (
                  <div key={g.groupKey}>
                    {i > 0 && <div className="h-px bg-border ml-14" />}
                    <button
                      onClick={() => setSelected(g.groupKey)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors touch-manipulation',
                        isActive ? 'bg-[#f2f2f7]' : 'hover:bg-[#f9f9fb]',
                      )}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[16px] shrink-0 bg-[#f2f2f7]">
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">{g.name}</p>
                        <p className="text-[11px] text-[#8e8e93] truncate">
                          {g.platform} · {g.messageCount} msgs · {fmtTime(g.lastActive)}
                        </p>
                      </div>
                      {g.propertyCode && (
                        <span className="text-[10px] font-medium text-[#6e6e73] bg-[#f2f2f7] rounded-[4px] px-1.5 py-0.5 shrink-0">
                          {g.propertyCode}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className={cn(selectedGroup ? 'block' : 'hidden md:block', 'md:h-full md:min-h-0')}>
          {!selectedGroup ? (
            <div className="bg-white rounded-lg border border-border py-16 text-center h-full flex flex-col items-center justify-center gap-2">
              <MessageSquare className="w-6 h-6 text-[#c7c7cc]" />
              <p className="text-[13px] text-[#8e8e93]">Select a group to see its messages.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-border overflow-hidden flex flex-col md:h-full">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border md:shrink-0">
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden -ml-1 p-1 text-[#6e6e73]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#1d1d1f] truncate">{selectedGroup.name}</p>
                  <p className="text-[11px] text-[#8e8e93] truncate">
                    {selectedGroup.platform}{selectedGroup.propertyCode ? ` · ${selectedGroup.propertyCode}` : ''} · {selectedGroup.messageCount} msgs in last 24h
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3 max-h-[70vh] overflow-y-auto md:max-h-none md:flex-1 md:min-h-0">
                {selectedGroup.messages.map((m, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-semibold text-[#1d1d1f]">{m.sender}</span>
                      <span className="text-[10px] text-[#c7c7cc]">{fmtClock(m.ts)}</span>
                    </div>
                    <p className="text-[13px] text-[#1d1d1f] leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
