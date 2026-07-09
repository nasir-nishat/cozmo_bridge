import { ArrowDownRight, ArrowUpRight, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import ColCard from './ColCard'
import type { BookingEntry, GroupEntry } from '@/lib/types'
import { isLiveBooking } from '@/lib/bookings'

const PLATFORM_BADGE: Record<string, string> = { whatsapp: 'WA', line: 'LINE', kakao: 'KT', wechat: 'WC' }
const PLATFORM_COLOR: Record<string, string> = {
  whatsapp: 'bg-[#DCFCE7] text-[#166534]',
  line:     'bg-[#DBEAFE] text-[#1E40AF]',
  kakao:    'bg-[#FEF9C3] text-[#854D0E]',
  wechat:   'bg-[#D1FAE5] text-[#065F46]',
}

function propShort(raw: string) {
  return raw.split('_').slice(-3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

interface Props {
  arriving: BookingEntry[]
  departing: BookingEntry[]
  bookings: BookingEntry[]
  groupByLead: Record<string, GroupEntry>
}

function GuestRow({ b, group }: { b: BookingEntry; group?: GroupEntry }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#272525] truncate">{b.guestName}</p>
        <p className="text-[11px] text-[#867970] mt-0.5 truncate">{propShort(b.property)}</p>
      </div>
      {group ? (
        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PLATFORM_COLOR[group.platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]'}`}>
          {PLATFORM_BADGE[group.platform] ?? group.platform}
        </span>
      ) : (
        <Link href="/groups" className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-[#B88E23] bg-[#F4EBDD] px-1.5 py-0.5 rounded-md hover:bg-[#E2DCC6] transition-colors">
          <AlertTriangle className="w-3 h-3" />
          No group
        </Link>
      )}
    </div>
  )
}

export default function ComingToday({ arriving, departing, bookings, groupByLead }: Props) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const nextUp = bookings
    .filter(b => isLiveBooking(b) && b.checkIn > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 5)

  return (
    <ColCard label="Coming Today" count={arriving.length + departing.length}>
      {arriving.length === 0 && departing.length === 0 ? (
        nextUp.length === 0 ? (
          <p className="px-4 py-8 text-[12px] text-[#867970] text-center">Nothing today</p>
        ) : (
          <div>
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-[#867970]" />
              <p className="text-[10px] font-semibold text-[#867970] uppercase tracking-wider">Next up - {nextUp.length}</p>
            </div>
            {nextUp.map((b, i) => (
              <div key={b.leadUid}>
                {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#272525] truncate">{b.guestName}</p>
                    <p className="text-[11px] text-[#867970] mt-0.5 truncate">{propShort(b.property)} - {b.checkIn}</p>
                  </div>
                  {groupByLead[b.leadUid] ? (
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${PLATFORM_COLOR[groupByLead[b.leadUid].platform] ?? 'bg-[#F1EEE3] text-[#5C4E3D]'}`}>
                      {PLATFORM_BADGE[groupByLead[b.leadUid].platform] ?? groupByLead[b.leadUid].platform}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#F1EEE3] text-[#5C4E3D]">
                      Booked
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {arriving.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-[#16A34A]" />
                <p className="text-[10px] font-semibold text-[#16A34A] uppercase tracking-wider">Arriving - {arriving.length}</p>
              </div>
              {arriving.map((b, i) => (
                <div key={b.leadUid}>
                  {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
                  <GuestRow b={b} group={groupByLead[b.leadUid]} />
                </div>
              ))}
            </div>
          )}
          {arriving.length > 0 && departing.length > 0 && <div className="h-px bg-[#E2DCC6] mx-4 my-1" />}
          {departing.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#D97706]" />
                <p className="text-[10px] font-semibold text-[#D97706] uppercase tracking-wider">Departing - {departing.length}</p>
              </div>
              {departing.map((b, i) => (
                <div key={b.leadUid}>
                  {i > 0 && <div className="h-px bg-[#F1EEE3] mx-4" />}
                  <GuestRow b={b} group={groupByLead[b.leadUid]} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ColCard>
  )
}
