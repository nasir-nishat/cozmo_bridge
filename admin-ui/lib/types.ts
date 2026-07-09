export interface SheetExpense {
  id: string
  item: string
  amount: number
  card: string
  cardName: string
  loggedBy: string
  createdAt: string
  settled: boolean
}

export interface KakaoGroup {
  groupKey: string
  leadUid: string
  chatName: string | null
  bufferedMsgCount: number
  bufferedExpCount: number
  sheetExpenses: SheetExpense[]
  total: number
  totalVat10: number
  totalVat145: number
  booking: {
    guestName: string
    property: string
    checkIn: string
    checkOut: string
    status: string
  } | null
}

export interface ScanResult {
  groupKey: string
  leadUid: string
  newCount: number
  skippedCount: number
  scanned: {
    groupKey: string
    sender: string
    card: string
    cardName: string
    amount: number
    item: string
    ts: number
    alreadyInSheet: boolean
    inserted: boolean
  }[]
}

export interface BookingEntry {
  leadUid: string
  guestName: string
  property: string
  checkIn: string
  checkOut: string
  nationality: string
  adults: number
  children: number
  infants: number
  status: string
  source: string
  phone: string
  updatedAt: string
}

export interface PlatformHealth {
  enabled: boolean
  connected: boolean
  ageMs?: number | null
  lastHeartbeatMs?: number | null
}

export interface HealthData {
  ok: boolean
  bridge: { uptimeSeconds: number; pid: number; mode: string }
  platforms: {
    whatsapp: PlatformHealth
    line: PlatformHealth
    kakao: PlatformHealth & { ageMs: number | null; lastHeartbeatMs: number | null }
    wechat: PlatformHealth
  }
  ts: number
}

export interface AlertEntry {
  id: string
  text: string
  plainText: string
  platform?: string
  ts: number
}

export interface BufferedMessage {
  sender: string
  text: string
  ts: number
}

export interface BufferGroup {
  groupKey: string
  name: string
  platform: string
  propertyCode?: string
  messageCount: number
  lastActive: number
  messages: BufferedMessage[]
}

export interface GroupEntry {
  groupId: string
  leadUid: string
  platform: 'whatsapp' | 'line' | 'kakao' | 'wechat' | 'unknown'
  name: string | null
  booking: {
    guestName: string
    property: string
    checkIn: string
    checkOut: string
    status: string
  } | null
}

export interface StaffMember {
  name: string
  phone: string
  role: string
  active: boolean
  dev: boolean
}

export interface ScheduleEvent {
  time: string
  type: string
  label: string
  guestName: string
  property: string
  platform: 'wa' | 'line' | 'wechat' | 'kakao'
  groupKey: string
  groupName: string | null
  status: 'scheduled' | 'queued' | 'sent' | 'missed' | 'skipped'
  note?: string
}

export interface DaySchedule {
  date: string
  events: ScheduleEvent[]
}

export interface MessageScheduleReport {
  yesterday: DaySchedule
  today: DaySchedule
  tomorrow: DaySchedule
}

export type TaskStatus = 'new' | 'doing' | 'done'
export type TaskType = 'guest_request' | 'pest_control' | 'plant_watering' | 'cleaning' | 'iot'
export type TaskSource = 'whatsapp' | 'line' | 'kakao' | 'wechat' | 'jandi' | 'schedule' | 'booking' | 'ai'

export interface PropertyOption {
  uid: string
  name: string
}

export interface AnalyticsDay {
  date: string
  newCount: number
  cancelledCount: number
}

export interface AnalyticsResponse {
  ok: boolean
  days: AnalyticsDay[]
  scannedLeads: number
  truncated: boolean
  nextCursor: string | null
  error?: string
}

export interface PropertyTask {
  id: string
  property: string
  title: string
  type: TaskType
  status: TaskStatus
  assignee: string | null
  source: TaskSource
  leadUid?: string
  guestName?: string
  notes: string
  createdAt: string
  updatedAt: string
}
