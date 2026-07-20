import Link from 'next/link'
import ColCard from './ColCard'
import { cn } from '@/lib/utils'
import type { ScheduleEvent } from '@/lib/types'

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

// Today's automated message schedule — the same data as the COZMO AI Tasks page, previewed on the dashboard
export default function AutomationCol({ events }: { events: ScheduleEvent[] }) {
  return (
    <ColCard
      label="COZMO AI Tasks"
      count={events.length}
      action={
        <Link href="/tasks" className="text-[11px] text-[#B88E23] font-medium hover:text-[#856949] transition-colors">
          View all
        </Link>
      }
    >
      {events.length === 0 ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">No automated messages today.</p>
      ) : (
        <div>
          {events.map((ev, i) => (
            <div key={`${ev.groupKey}:${ev.type}:${i}`}>
              {i > 0 && <div className="h-px bg-[#F1EEE3] mx-3.5" />}
              <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                <div className="w-10 shrink-0 text-[11px] font-semibold text-[#867970] tabular-nums pt-0.5">{ev.time}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[#272525] leading-snug truncate">{ev.label}</p>
                  <p className="text-[11px] text-[#867970] mt-0.5 truncate">{ev.guestName} · {propShort(ev.property)}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn('text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md', PLATFORM_COLOR[ev.platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]')}>
                      {PLATFORM_BADGE[ev.platform] ?? ev.platform}
                    </span>
                    <span className={cn('text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md', STATUS_META[ev.status]?.color ?? 'bg-[#F1EEE3] text-[#5C4E3D]')}>
                      {STATUS_META[ev.status]?.label ?? ev.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColCard>
  )
}
