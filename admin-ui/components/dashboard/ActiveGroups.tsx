import ColCard from './ColCard'
import type { GroupEntry } from '@/lib/types'

const PLATFORM_LABEL: Record<string, string> = { whatsapp: 'WA', line: 'LINE', kakao: 'KT', wechat: 'WC' }
const PLATFORM_COLOR: Record<string, string> = {
  whatsapp: 'bg-[#DCFCE7] text-[#166534]',
  line:     'bg-[#DBEAFE] text-[#1E40AF]',
  kakao:    'bg-[#FEF9C3] text-[#854D0E]',
  wechat:   'bg-[#D1FAE5] text-[#065F46]',
}

function propShort(raw: string) {
  return raw.split('_').slice(-3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function statusDot(status: string) {
  if (status === 'CHECKED_IN') return 'bg-[#16A34A]'
  if (status === 'BOOKED' || status === 'PAID_IN_FULL') return 'bg-[#D97706]'
  return 'bg-[#867970]'
}

function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

export default function ActiveGroups({ groups }: { groups: GroupEntry[] }) {
  const today = getToday()
  const active = groups.filter(g => {
    if (!g.booking) return false
    if (g.booking.status === 'CHECKED_OUT') return false
    return g.booking.checkOut >= today
  })
  const visible = active.slice(0, 10)

  return (
    <ColCard label="Active Groups" count={visible.length}>
      {visible.length === 0 ? (
        <p className="px-4 py-8 text-[12px] text-[#867970] text-center">No active groups</p>
      ) : (
        <div>
          {visible.map((g, i) => (
            <div key={g.groupId}>
              {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${statusDot(g.booking?.status ?? '')}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#272525] truncate">
                    {g.booking?.guestName ?? g.name ?? g.groupId.slice(-8)}
                  </p>
                  <p className="text-[11px] text-[#867970] mt-0.5 truncate">
                    {g.booking ? propShort(g.booking.property) : '-'}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PLATFORM_COLOR[g.platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]'}`}>
                  {PLATFORM_LABEL[g.platform] ?? g.platform}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColCard>
  )
}
