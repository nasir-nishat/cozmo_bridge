'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { BookingEntry, GroupEntry, HealthData, KakaoGroup, PropertyTask, ScheduleEvent } from '@/lib/types'
import { isArrivingBooking, isDepartingBooking, isInHouseBooking } from '@/lib/bookings'
import ComingToday from '@/components/dashboard/ComingToday'
import ActiveGroups from '@/components/dashboard/ActiveGroups'
import AutomationCol from '@/components/dashboard/AutomationCol'
import ExpensesCol, { type ExpenseSummaryGroup } from '@/components/dashboard/ExpensesCol'
import CozmoTodo from '@/components/dashboard/CozmoTodo'

const BRIDGE = '/api/bridge'

const PLATFORM_DOT: Record<string, string> = {
  whatsapp: 'bg-[#16A34A]',
  line: 'bg-[#1D4ED8]',
  kakao: 'bg-[#B88E23]',
  wechat: 'bg-[#065F46]',
}
const PLATFORM_LABEL: Record<string, string> = { whatsapp: 'WA', line: 'LINE', kakao: 'KT', wechat: 'WC' }

type AlertEntry = {
  id: string
  text: string
  plainText: string
  platform?: string
  ts: number
}

function parseField(text: string, label: string) {
  const re = new RegExp(`${label}:\\s*(.+)`, 'i')
  const match = text.match(re)
  return match?.[1]?.trim() || ''
}

function deriveTasksFromAlerts(alerts: AlertEntry[]): PropertyTask[] {
  return alerts.flatMap(alert => {
    const plain = alert.plainText
    if (!/Guest Request Detected/i.test(plain)) return []

    const guestName = parseField(plain, 'Guest')
    const property = parseField(plain, 'Property')
    const request = parseField(plain, 'Request')
    if (!property || !request) return []

    const task: PropertyTask = {
      id: `alert:${alert.id}`,
      property,
      title: request,
      type: 'guest_request',
      status: 'new',
      assignee: null,
      source: 'ai',
      notes: `Derived from live alert${guestName ? ` for ${guestName}` : ''}`,
      createdAt: new Date(alert.ts).toISOString(),
      updatedAt: new Date(alert.ts).toISOString(),
      guestName: guestName || undefined,
    }

    return [task]
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function deriveExpenseSummary(groups: KakaoGroup[]): ExpenseSummaryGroup[] {
  return groups.flatMap(group => {
    const unsettled = group.sheetExpenses.filter(e => !e.settled)
    if (!unsettled.length) return []

    return [{
      groupId: group.groupKey,
      groupName: group.chatName || group.booking?.property || group.groupKey.replace('kakao:', ''),
      platform: 'kakao',
      total: unsettled.reduce((sum, e) => sum + e.amount, 0),
      count: unsettled.length,
    }]
  }).sort((a, b) => b.total - a.total)
}

function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function dateStr() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [bookings, setBookings] = useState<BookingEntry[]>([])
  const [groups, setGroups] = useState<GroupEntry[]>([])
  const [tasks, setTasks] = useState<PropertyTask[]>([])
  const [alerts, setAlerts] = useState<AlertEntry[]>([])
  const [todayEvents, setTodayEvents] = useState<ScheduleEvent[]>([])
  const [kakaoGroups, setKakaoGroups] = useState<KakaoGroup[]>([])
  const [expenses, setExpenses] = useState<ExpenseSummaryGroup[]>([])
  const [expLoading, setExpLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [spinning, setSpinning] = useState(false)

  const load = useCallback(async () => {
    setSpinning(true)
    setExpLoading(true)
    try {
      const [h, b, g, t, a, k, e, s] = await Promise.all([
        fetch(`${BRIDGE}/admin/health`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/bookings`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/groups`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/tasks`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/alerts/recent`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/kakao/groups`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/expenses/summary`).then(r => r.json()).catch(() => null),
        fetch(`${BRIDGE}/admin/message-schedule`).then(r => r.json()).catch(() => null),
      ])
      if (h?.ok) setHealth(h)
      if (b?.ok) setBookings(Array.isArray(b.bookings) ? b.bookings : [])
      if (g?.ok) setGroups(Array.isArray(g.groups) ? g.groups : [])
      if (t?.ok) setTasks(Array.isArray(t.tasks) ? t.tasks : [])
      if (a?.ok) setAlerts(Array.isArray(a.alerts) ? a.alerts : [])
      if (k?.ok) setKakaoGroups(Array.isArray(k.groups) ? k.groups : [])
      if (e?.ok) setExpenses(Array.isArray(e.summary) ? e.summary : [])
      if (s?.ok) setTodayEvents(Array.isArray(s.today?.events) ? s.today.events : [])
    } finally {
      setLoaded(true)
      setSpinning(false)
      setExpLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const today = getToday()
  const inHouse = bookings.filter(b => isInHouseBooking(b, today))
  const arriving = bookings.filter(b => isArrivingBooking(b, today))
  const departing = bookings.filter(b => isDepartingBooking(b, today))
  const groupByLead = Object.fromEntries(groups.map(g => [g.leadUid, g]))
  const alertTasks = deriveTasksFromAlerts(alerts)
  const dashboardTasks = [...tasks, ...alertTasks].filter((task, idx, all) => all.findIndex(t => t.id === task.id) === idx)
  const pendingSends = todayEvents.filter(ev => ev.status === 'scheduled' || ev.status === 'queued')
  const expenseSummary = expenses.length > 0 ? expenses : deriveExpenseSummary(kakaoGroups)

  const platforms = health
    ? Object.entries(health.platforms as Record<string, { enabled: boolean; connected: boolean }>).filter(([, p]) => p.enabled)
    : []

  return (
    <div className="min-h-full md:h-full md:flex md:flex-col">
      <div className="flex items-center justify-between mb-5 md:shrink-0">
        <div>
          <p className="text-[10px] font-semibold text-[#B88E23] uppercase tracking-[0.18em] mb-1">COZE Hospitality 3.0</p>
          <h1 className="text-[24px] font-bold text-[#272525] tracking-tight leading-none">Operations Dashboard</h1>
          <p className="text-[12px] text-[#867970] mt-1">{dateStr()} - Seoul service command</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5">
            {platforms.map(([key, p]) => (
              <div key={key} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-[#E2DCC6] text-[11px] font-medium text-[#5C4E3D] shadow-sm">
                <div className={`w-1.5 h-1.5 rounded-full ${p.connected ? (PLATFORM_DOT[key] ?? 'bg-[#16A34A]') : 'bg-[#DC2626]'}`} />
                {PLATFORM_LABEL[key] ?? key}
              </div>
            ))}
          </div>
          <button
            onClick={() => { load() }}
            disabled={spinning}
            className="p-2 rounded-lg bg-white border border-[#E2DCC6] text-[#867970] hover:text-[#B88E23] hover:border-[#B88E23] transition-colors touch-manipulation shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loaded && (
        <div className="grid grid-cols-4 gap-3 mb-5 md:shrink-0">
          {[
            { label: 'In-House', value: inHouse.length, color: '#2C8C2C' },
            { label: 'Arriving', value: arriving.length, color: '#B88E23' },
            { label: 'Departing', value: departing.length, color: '#D97706' },
            { label: 'Sends Left Today', value: pendingSends.length, color: '#5C4E3D' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-[#E2DCC6] px-4 py-3.5 shadow-sm">
              <p className="text-[32px] font-bold tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[11px] font-semibold text-[#867970] mt-2 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 md:flex-1 md:min-h-0">
          <ComingToday arriving={arriving} departing={departing} bookings={bookings} groupByLead={groupByLead} />
          <ActiveGroups groups={groups} />
          <AutomationCol events={todayEvents} />
          <ExpensesCol summary={expenseSummary} loading={expLoading} />
          <CozmoTodo arriving={arriving} groups={groups} tasks={dashboardTasks} health={health} />
        </div>
      )}

      {!loaded && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-[#E2DCC6] border-t-[#B88E23] rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
