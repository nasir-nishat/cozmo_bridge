'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import ColCard from '@/components/dashboard/ColCard'
import type { DaySchedule, MessageScheduleReport, ScheduleEvent } from '@/lib/types'

const BRIDGE = '/api/bridge'

const PLATFORM_BADGE: Record<string, string> = { wa: 'WA', line: 'LINE', kakao: 'KT', wechat: 'WC' }
const PLATFORM_COLOR: Record<string, string> = {
  wa: 'bg-[#DCFCE7] text-[#166534]',
  line: 'bg-[#DBEAFE] text-[#1E40AF]',
  kakao: 'bg-[#FEF9C3] text-[#854D0E]',
  wechat: 'bg-[#D1FAE5] text-[#065F46]',
}
const STATUS_META: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-[#F1EEE3] text-[#5C4E3D]' },
  queued: { label: 'Queued', color: 'bg-[#DBEAFE] text-[#1E40AF]' },
  sent: { label: 'Sent', color: 'bg-[#DCFCE7] text-[#166534]' },
  missed: { label: 'Missed', color: 'bg-[#FEE2E2] text-[#991B1B]' },
  skipped: { label: 'Skipped', color: 'bg-[#F1EEE3] text-[#8e8e93]' },
}

function propShort(raw: string) {
  return raw.split('_').slice(-3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function fmtColDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function EventCard({ ev }: { ev: ScheduleEvent }) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-3">
      <div className="w-10 shrink-0 text-[11px] font-semibold text-[#867970] tabular-nums pt-0.5">{ev.time}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-[#272525] leading-snug">{ev.label}</p>
        <p className="text-[11px] text-[#867970] mt-0.5 truncate">{ev.guestName} · {propShort(ev.property)}</p>
        <p className="text-[10.5px] text-[#AD9362] mt-0.5 truncate">{ev.groupName || `${ev.guestName} · ${propShort(ev.property)}`}{ev.note ? ` · ${ev.note}` : ''}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn('text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md', PLATFORM_COLOR[ev.platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]')}>
            {PLATFORM_BADGE[ev.platform] ?? ev.platform}
          </span>
          <span className={cn('text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md', STATUS_META[ev.status]?.color ?? 'bg-[#F1EEE3] text-[#5C4E3D]')}>
            {STATUS_META[ev.status]?.label ?? ev.status}
          </span>
        </div>
      </div>
    </div>
  )
}

function DayColumn({ label, day }: { label: string; day: DaySchedule | undefined }) {
  const events = day?.events ?? []
  return (
    <ColCard label={day ? `${label} · ${fmtColDate(day.date)}` : label} count={day ? events.length : undefined}>
      {!day ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">Loading…</p>
      ) : events.length === 0 ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">No automated messages.</p>
      ) : (
        <div>
          {events.map((ev, i) => (
            <div key={`${ev.groupKey}:${ev.type}:${i}`}>
              {i > 0 && <div className="h-px bg-[#F1EEE3] mx-3.5" />}
              <EventCard ev={ev} />
            </div>
          ))}
        </div>
      )}
    </ColCard>
  )
}

export default function TasksPage() {
  const [report, setReport] = useState<MessageScheduleReport | null>(null)
  const [spinning, setSpinning] = useState(false)

  const load = useCallback(async () => {
    setSpinning(true)
    try {
      const res = await fetch(`${BRIDGE}/admin/message-schedule`).then(r => r.json()).catch(() => null)
      if (res?.ok) setReport({ yesterday: res.yesterday, today: res.today, tomorrow: res.tomorrow })
    } finally {
      setSpinning(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-full md:h-full md:flex md:flex-col">
      <div className="flex items-center justify-between mb-5 md:shrink-0">
        <div>
          <p className="text-[10px] font-semibold text-[#B88E23] uppercase tracking-[0.18em] mb-1">COZMO Automation</p>
          <h1 className="text-[24px] font-bold text-[#272525] tracking-tight leading-none">COZMO AI Tasks</h1>
          <p className="text-[12px] text-[#867970] mt-1">What COZMO is sending — yesterday, today, and tomorrow</p>
        </div>
        <button
          onClick={() => { load() }}
          disabled={spinning}
          className="p-2 rounded-lg bg-white border border-[#E2DCC6] text-[#867970] hover:text-[#B88E23] hover:border-[#B88E23] transition-colors touch-manipulation shadow-sm"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', spinning && 'animate-spin')} />
        </button>
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-3 md:flex-1 md:min-h-0">
        <DayColumn label="Yesterday" day={report?.yesterday} />
        <DayColumn label="Today" day={report?.today} />
        <DayColumn label="Tomorrow" day={report?.tomorrow} />
      </div>
    </div>
  )
}
