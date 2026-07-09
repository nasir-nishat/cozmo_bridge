'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { isInHouseBooking, isLiveBooking } from '@/lib/bookings'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { BookingEntry } from '@/lib/types'

const BRIDGE = '/api/bridge'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })

const SOURCE_LABELS: Record<string, string> = {
  AIRBNB: 'Airbnb', BOOKING_COM: 'Booking', DIRECT: 'Direct',
  HOMEAWAY: 'VRBO', VRBO: 'VRBO', EXPEDIA: 'Expedia', TRIPADVISOR: 'Trip',
}

function statusDot(status: string) {
  if (status === 'CHECKED_IN') return 'bg-[#34c759]'
  if (status === 'BOOKED' || status === 'PAID_IN_FULL') return 'bg-[#007aff]'
  return 'bg-[#c7c7cc]'
}

function statusLabel(status: string) {
  if (status === 'CHECKED_IN') return 'In'
  if (status === 'BOOKED' || status === 'PAID_IN_FULL') return 'Booked'
  return status
}

function occupancy(b: BookingEntry) {
  return [b.adults && `${b.adults}A`, b.children && `${b.children}K`, b.infants && `${b.infants}B`]
    .filter(Boolean).join(' ') || '—'
}

function shortProp(name: string) {
  return name.replace(/^[A-Z0-9_]+_/, '')
}

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

type Filter = 'active' | 'upcoming' | 'all'
type SortKey = 'checkIn' | 'property' | 'status'

const PAGE_SIZE = 10

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('checkIn')
  const [filter, setFilter] = useState<Filter>('active')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [pageSize, setPageSize] = useState<Record<string, number>>({})

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const loadMore = (key: string) => {
    setPageSize(prev => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }))
  }

  const load = async () => {
    try {
      const res = await fetch(`${BRIDGE}/admin/bookings`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setBookings(data.bookings)
    } catch (e: any) {
      toast.error(`Failed to load bookings: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // "In-house" is date-driven, not status-driven: Hostfully's status field often
  // never flips to CHECKED_IN for guests who are mid-stay, so relying on status
  // alone under-counts (or always shows 0) guests currently traveling.
  const checkedIn = bookings.filter(b => isInHouseBooking(b, TODAY)).length
  const upcoming  = bookings.filter(b => isLiveBooking(b) && b.checkIn > TODAY).length

  const filtered = bookings
    .filter(b => {
      if (filter === 'active')   return isInHouseBooking(b, TODAY)
      if (filter === 'upcoming') return isLiveBooking(b) && b.checkIn > TODAY
      return isLiveBooking(b) && b.checkOut >= THIRTY_DAYS_AGO
    })
    .sort((a, b) => {
      if (sort === 'checkIn')  return a.checkIn.localeCompare(b.checkIn)
      if (sort === 'property') return a.property.localeCompare(b.property)
      return a.status.localeCompare(b.status)
    })

  const monthGroups: { key: string; label: string | null; items: BookingEntry[] }[] = []
  if (filter === 'upcoming') {
    for (const b of filtered) {
      const key = b.checkIn.slice(0, 7)
      let group = monthGroups.find(g => g.key === key)
      if (!group) {
        group = { key, label: monthLabel(b.checkIn), items: [] }
        monthGroups.push(group)
      }
      group.items.push(b)
    }
    monthGroups.sort((a, b) => a.key.localeCompare(b.key))
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'active',   label: `In (${checkedIn})` },
    { key: 'upcoming', label: `Upcoming (${upcoming})` },
    { key: 'all',      label: `All (${bookings.length})` },
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h1 className="text-[17px] font-semibold text-[#1d1d1f]">Bookings</h1>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Filter + sort */}
      <div className="flex items-center gap-2 mb-4 flex-wrap md:shrink-0">
        <div className="flex gap-1.5">
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
        <div className="ml-auto flex items-center gap-1 text-[12px] text-[#8e8e93]">
          {(['checkIn', 'property', 'status'] as SortKey[]).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={cn(
                'px-2 py-1 rounded transition-colors touch-manipulation',
                sort === s ? 'text-[#1d1d1f] font-medium' : 'hover:text-[#1d1d1f]',
              )}
            >
              {s === 'checkIn' ? 'Date' : s === 'property' ? 'Property' : 'Status'}
            </button>
          ))}
        </div>
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
      {loading ? (
        <p className="text-[13px] text-[#6e6e73] py-12 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-border py-10 text-center">
          <p className="text-[13px] text-[#8e8e93]">No bookings found.</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-4">
            {(filter === 'upcoming' ? monthGroups : [{ key: 'all', label: null, items: filtered }]).map(group => {
              const isMonth = group.label !== null
              const isOpen = !isMonth || expandedMonths.has(group.key)
              const shown = pageSize[group.key] ?? PAGE_SIZE
              const visible = isMonth ? group.items.slice(0, shown) : group.items
              const hasMore = isMonth && group.items.length > shown
              return (
                <div key={group.key}>
                  {isMonth && (
                    <button onClick={() => toggleMonth(group.key)}
                      className="flex items-center justify-between w-full px-3 py-2 mb-1.5 rounded-md bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1d1d1f]">
                        <ChevronRight className={cn('w-3.5 h-3.5 text-[#8e8e93] transition-transform', isOpen && 'rotate-90')} />
                        {group.label}
                      </span>
                      <span className="text-[12px] font-medium text-[#8e8e93]">{group.items.length}</span>
                    </button>
                  )}
                  {isOpen && (
                    <>
                      <div className="bg-white rounded-lg border border-border overflow-hidden">
                        {visible.map((b, i) => (
                          <div key={b.leadUid}>
                            {i > 0 && <div className="h-px bg-border ml-4" />}
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className={cn('w-2 h-2 rounded-full shrink-0', statusDot(b.status))} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-[#1d1d1f] truncate">
                                  {b.guestName}
                                  {b.nationality && <span className="ml-1.5 text-[12px] font-normal text-[#8e8e93]">{b.nationality}</span>}
                                </p>
                                <p className="text-[12px] text-[#6e6e73] truncate mt-0.5">
                                  {shortProp(b.property)} · {b.checkIn} → {b.checkOut}
                                </p>
                                <p className="text-[11px] text-[#8e8e93] mt-0.5">
                                  {occupancy(b)} · {SOURCE_LABELS[b.source] ?? b.source}
                                </p>
                              </div>
                              <span className={cn('text-[11px] font-semibold shrink-0',
                                b.status === 'CHECKED_IN' ? 'text-[#34c759]' : 'text-[#007aff]',
                              )}>
                                {statusLabel(b.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {hasMore && (
                        <button onClick={() => loadMore(group.key)}
                          className="w-full mt-2 py-2 rounded-md text-[12px] font-medium text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
                        >
                          Load more ({group.items.length - shown} left)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block space-y-5">
            {(filter === 'upcoming' ? monthGroups : [{ key: 'all', label: null, items: filtered }]).map(group => {
              const isMonth = group.label !== null
              const isOpen = !isMonth || expandedMonths.has(group.key)
              const shown = pageSize[group.key] ?? PAGE_SIZE
              const visible = isMonth ? group.items.slice(0, shown) : group.items
              const hasMore = isMonth && group.items.length > shown
              return (
                <div key={group.key}>
                  {isMonth && (
                    <button onClick={() => toggleMonth(group.key)}
                      className="flex items-center justify-between w-full px-3 py-2 mb-1.5 rounded-md bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1d1d1f]">
                        <ChevronRight className={cn('w-3.5 h-3.5 text-[#8e8e93] transition-transform', isOpen && 'rotate-90')} />
                        {group.label}
                      </span>
                      <span className="text-[12px] font-medium text-[#8e8e93]">{group.items.length}</span>
                    </button>
                  )}
                  {isOpen && (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Guest</TableHead>
                            <TableHead>Property</TableHead>
                            <TableHead>Check-in</TableHead>
                            <TableHead>Check-out</TableHead>
                            <TableHead>Guests</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visible.map(b => (
                            <TableRow key={b.leadUid}>
                              <TableCell className="font-medium text-foreground">
                                {b.guestName}
                                {b.nationality && <span className="ml-1.5 text-xs text-muted-foreground">{b.nationality}</span>}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{shortProp(b.property)}</TableCell>
                              <TableCell className="tabular-nums text-sm font-medium">{b.checkIn}</TableCell>
                              <TableCell className="tabular-nums text-sm text-muted-foreground">{b.checkOut}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{occupancy(b)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{SOURCE_LABELS[b.source] ?? b.source}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <div className={cn('w-1.5 h-1.5 rounded-full', statusDot(b.status))} />
                                  <span className="text-xs text-muted-foreground">{statusLabel(b.status)}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {hasMore && (
                        <button onClick={() => loadMore(group.key)}
                          className="w-full mt-2 py-1.5 rounded-md text-[12px] font-medium text-[#6e6e73] bg-[#f2f2f7] hover:bg-[#e5e5ea] transition-colors touch-manipulation"
                        >
                          Load more ({group.items.length - shown} left)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      </div>
    </>
  )
}
